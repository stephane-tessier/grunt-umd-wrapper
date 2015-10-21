/*
 * grunt-umd-wrapper
 * https://github.com/bstefanescu/grunt-umd-wrapper
 *
 * Copyright (c) 2014 Bogdan Stefanescu
 * Licensed under the MIT license.
 */

'use strict';

var path = require('path');

module.exports = function(grunt) {

    var glob = grunt.file.glob.sync;


    function endsWith(str, suffix) {
        var l = str.length - suffix.length;
        return l >= 0 && str.indexOf(suffix, l) === l;
    }

    function Module() {
        this.name = null;
        this.exports = null;
        this.imports = [];
        this.source = null;

        this.build = function(tpl, options) {
            var root = options.rootName;
            var rootPrefix = root;
            var amd_req = [];
            var args = [];
            var cjs_args = [];
            var browser_args = [];
            var cjs_req = [];
            for (var i=0,len=this.imports.length; i<len; i++) {
                var imp = this.imports[i];
                if (imp.val) {
                    args.push(imp.val);
                    cjs_args.push("require('"+imp.key+"')");
                    browser_args.push(rootPrefix+"['"+imp.key+"']");
                } else {
                    cjs_req.push("require('"+imp.key+"');");
                }
                amd_req.push("'"+imp.key+"'");          
            }

            var src = this.source;
            var map = {
                ARGS: args.join(', '),
                CJS_ARGS: cjs_args.join(', '),
                BROWSER_ARGS: browser_args.join(', '),
                AMD_REQUIRES: amd_req.join(', '),
                CJS_REQUIRES: cjs_req.join('\n'),
                EXPORT_NAME: this.exports,
                ROOT: root,
                SRC: src
            };

            return tpl.replace(/%([^%]+)%/g, function(m0, m1) {
                var v = map[m1];
                return v != null ? v : m0;
            });
        };
    }

    function ModuleProcessor() {

        function readFile(baseDir, filepath) {
            return grunt.file.read(path.join(baseDir, filepath));
        }

        function concatFiles(baseDir, pattern) {
          var result = '';
          var files = glob(pattern, {"cwd": baseDir});
          if (Array.isArray(files)) {
          for (var i=0, len=files.length; i<len; i++) {
              var file = files[i];
              result += readFile(baseDir, file);
            }
          }
          return result;
        }

        this.loadModule = function(file) {
            var baseDir = path.dirname(file);
            var txt = grunt.file.read(file);
            var rx = /^[ \t]*@([a-z]+)\s+([^\r\n]+)$/mg;
            var req = [];
            var module = new Module();
            var out = txt.replace(rx, function(m0, m1, m2) {
                var token = m1;
                var value = m2.trim();
                var ar = null;
                if (token === 'import') {
                    ar = value.split(/\s+as\s+/);
                    if (ar.length === 2) {
                        req.push({'key':ar[0], 'val':ar[1]});
                    } else {
                        req.push({'key':value, 'val':null});
                    }
                    return '';
                } else if (token === 'include') {
                   return concatFiles(baseDir, value);
                   //return readFile(baseDir, value);
                } else if (token === 'export') {
                    module.exports = value;
                    return '';
                } else if (token === 'module') {
                    module.name = value;
                    return '';
                } else if (token === 'html') {
                    ar = value.split(/\s+as\s+/);
                    if (ar.length === 2) {
                        var file = ar[0].trim();
                        var varName = ar[1].trim();
                        var html = readFile(baseDir, file);
                        html = html.replace(/[\r\n]+/g, '').replace(/"/g, '\\"');
                        return "var "+varName+" = \""+html+"\";\n";
                    } else {
                        grunt.fail('Syntax error: @html requires the as token. Example: @html file/path as varName', 3);
                    }
                } else { // ignore - log warn?
                    return m0;                    
                }
            });
            out = '\n'+out.trim()+'\n';

            if (!module.exports) {
              var name = path.basename(file);
              if (endsWith(name, '-module.js')) {
                  name = name.substring(0, name.length - '-module.js'.length);
              } else if (endsWith(name, '.js')) {
                  name = name.substring(0, name.length - '.js'.length);
              }
              module.exports = name;
            }
            module.source = out;
            module.imports = req;
            return module;
        };
        this.process = function(moduleFile, templateTxt, options) {
            return this.loadModule(moduleFile).build(templateTxt, options);
        };
    }


  grunt.registerMultiTask('umd_wrapper', 'Wrap your module using UMD based on jsdoc @requires annotations', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      template: 'umd',
      rootName: 'root'
    });

    var hasErrors = false;

    // Iterate over all specified file groups.
    this.files.forEach(function(f) {
        // try first the builtin template
        var templatePath = options['template'];
        if (!grunt.file.isFile(templatePath)) {
            templatePath = path.join(__dirname, templatePath+'.template');
            if (!grunt.file.isFile(templatePath)) {
                grunt.fail("Could not find wrapper template: "+options['template']+".", 3);
            }            
        }
        var template = grunt.file.read(templatePath);
        var out = new ModuleProcessor(options).process(f.src, template, options);
        grunt.file.write(f.dest, out);  
        grunt.log.writeln('File "' + f.dest + '" created.');

    });

  });

  
};
