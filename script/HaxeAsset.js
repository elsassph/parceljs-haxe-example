const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const tmp = require('tmp');
const hash = require('hash-sum');
const split = require('haxe-modular/tool/bin/split');
const hooks = require('haxe-modular/bin/hooks');
const JSAsset = require('parcel-bundler/src/assets/JSAsset');

class HaxeAsset extends JSAsset {

    load() {
        // compile Haxe project and return source for normal JS processing
        const { name, basename, options } = this;
        const pkg = this.package;

        const queryIndex = name.indexOf('!');
        const context = queryIndex >= 0
            ? {
                resourcePath: null,
                query: name.substr(queryIndex),
                options,
                addContextDependency: (path) => { console.log('ADD RES', path); }
            }
            : {
                resourcePath: name,
                query: null,
                options,
                addContextDependency: (path) => { console.log('ADD RES', path); }
            };
        // console.log(entryAsset.options);

        return new Promise((resolve, reject) => {
            process(context, (err, content) => {
                if (!!err) reject(err);
                else resolve(content);
            });
        });
    }
}

module.exports = HaxeAsset;

function process(context, cb) {

    const request = context.resourcePath;
    if (!request) {
        // Loader was called without specifying a hxml file
        // Expecting a require of the form '!hxmlName/moduleName.hxml'
        fromCache(context, context.query, cb);
        return;
    }

    const hxmlContent = String(fs.readFileSync(request));
    const ns = path.basename(request).replace('.hxml', '');
    const jsTempFile = makeJSTempFile(ns);
    const { jsOutputFile, classpath, args } = prepare(context, ns, hxmlContent, jsTempFile);

    // registerDepencencies(context, classpath);

    // Execute the Haxe build.
    console.log('haxe', args.join(' '));
    exec(`haxe ${args.join(' ')}`, (err, stdout, stderr) => {
        if (err) {
            return cb(err);
        }
        // Read the resulting JS file and return the main module
        const processed = processOutput(context, ns, jsTempFile, jsOutputFile);
        if (processed) {
            updateCache(context, ns, processed, classpath);
        }
        returnModule(context, ns, 'Main', cb);
    });
};

function updateCache(context, ns, { contentHash, results }, classpath) {
    //cache[ns] = { contentHash, results, classpath };
    const { options } = context;
    const cacheDir = options.cacheDir;
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    results.forEach(entry => {
        const cacheFile = path.join(cacheDir, `${ns}__${entry.name}.json`);
        fs.writeFileSync(cacheFile, JSON.stringify(entry));
    });
}

function processOutput(context, ns, jsTempFile, jsOutputFile) {
    const { options } = context;

    const content = String(fs.readFileSync(jsTempFile.path));
    // Check whether the output has changed since last build
    const contentHash = hash(content);
    // if (cache[ns] && cache[ns].hash === contentHash)
        // return null;

    // Split output
    const modules = findImports(content);
    const debug = options.hmr && fs.existsSync(`${jsTempFile.path}.map`);
    const graphHooks = hooks.getGraphHooks();
    const results = split.run(jsTempFile.path, jsOutputFile, modules, debug, true, false, false, graphHooks)
        .filter(entry => entry && entry.source);

    results.forEach(entry => {
        // Change 'System.import'
        entry.source.content = entry.source.content.replace('System.import\(', 'import(');
        // No support of maps in Parcel
        if (entry.map) delete entry.map;
        /* // Inject .hx sources in map file
        if (entry.map) {
            const map = entry.map.content = JSON.parse(entry.map.content);
            map.sourcesContent = map.sources.map(path => {
                try {
                    if (path.startsWith('file:///')) path = path.substr(8);
                    return fs.readFileSync(path).toString();
                } catch (_) {
                    return '';
                }
            });
        }*/
    });

    // Delete temp files
    jsTempFile.cleanup();

    return { contentHash, results };
}

function returnModule(context, ns, name, cb) {
    const { options } = context;
    const cacheDir = options.cacheDir
    const cacheFile = path.join(cacheDir, `${ns}__${name}.json`);

    if (!fs.existsSync(cacheFile)) {
        throw new Error(`${ns}.hxml did not emit a module called '${name}'`);
    }

    const cache = JSON.parse(String(fs.readFileSync(cacheFile)));
    cb(null, cache.source.content);
}

function fromCache(context, query, cb) {
    // To locate a split module we expect a query of the form '!hxmlName/moduleName.hxml'
    const params = /!([^/]+)[\/\\](.*)\.hxml/.exec(query);
    if (!params) {
        throw new Error(`Invalid query: ${query}`);
    }
    const ns = params[1];
    const name = params[2];

    // registerDepencencies(context, cached.classpath);

    returnModule(context, ns, name, cb);
}

function findImports(content) {
    // Webpack.load() emits a call to System.import with a query to haxe-loader
    const reImports = /import\("!([^!]+)\.hxml/g;
    const results = [];

    let match = reImports.exec(content);
    while (match) {
        // Module reference  is of the form 'hxmlName/moduleName'
        const name = match[1].substr(match[1].indexOf('/') + 1);
        results.push(name);
        match = reImports.exec(content);
    }
    return results;
}

function makeJSTempFile() {
    const path = tmp.tmpNameSync({ postfix: '.js' });
    const nop = () => {};
    const cleanup = () => {
        fs.unlink(path, nop);
        fs.unlink(`${path}.map`, nop);
    };
    return { path, cleanup };
}

function registerDepencencies(context, classpath) {
    // Listen for any changes in the classpath
    classpath.forEach(path => context.addContextDependency(path));
}

function prepare(context, ns, hxmlContent, jsTempFile) {
    const { options } = context;
    let args = [];
    const classpath = [];
    let jsOutputFile = null;
    let mainClass = 'Main';
    let preventJsOutput = false;

    // Add args that are specific to hxml-loader
    if (options.debug) {
        args.push('-debug');
    }
    args.push('-D', `webpack_namespace=${ns}`);

    // Process all of the args in the hxml file.
    for (let line of hxmlContent.split('\n')) {
        line = line.trim();
        if (line === '' || line.substr(0, 1) === '#') {
            continue;
        }

        let space = line.indexOf(' ');
        let name = space > -1 ? line.substr(0, space) : line;
        args.push(name);

        if (name === '--next') {
            var err = `${context.resourcePath} included a "--next" line, hxml-loader only supports a single build per hxml file.`;
            throw new Error(err);
        }

        if (space > -1) {
            let value = line.substr(space + 1).trim();

            if (name === '-js' && !preventJsOutput) {
                jsOutputFile = value;
                args.push(jsTempFile.path);
                continue;
            }

            if (name === '-cp') {
                classpath.push(path.resolve(value));
            }

            if (name === '-D' && value == 'prevent-webpack-js-output') {
                preventJsOutput = true;
                if (jsOutputFile) {
                    // If a JS output file was already set to use a webpack temp file, go back and undo that.
                    args = args.map(arg => (arg === jsTempFile.path) ? value : arg);
                    jsOutputFile = null;
                }
            }

            args.push(value);
        }
    }

    if (options.extra) args.push(options.extra);

    return { jsOutputFile, classpath, args };
}
