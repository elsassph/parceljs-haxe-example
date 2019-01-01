const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const tmp = require('tmp');
const hash = require('hash-sum');
const split = require('haxe-modular/tool/bin/split');
const hooks = require('haxe-modular/bin/hooks');
const JSAsset = require('parcel-bundler/src/assets/JSAsset');
const glob = require('fast-glob');

class HaxeAsset extends JSAsset {

    async pretransform() {
        // Nope
    }

    load() {
        // Compile Haxe project and return source for normal JS processing
        const { name, basename, options } = this;

        const queryIndex = name.indexOf('!'); // Is a split module
        const context = queryIndex >= 0
            ? {
                query: basename.substr(1),
                options,
                addContextDependency: (path) => this.addPathDependency(path)
            }
            : {
                resourcePath: name,
                options,
                addContextDependency: (path) => this.addPathDependency(path)
            };

        return new Promise((resolve, reject) => {
            process(context, (err, { content, sourceMap }) => {
                if (err) {
                    reject(err);
                } else {
                    this.sourceMap = sourceMap;
                    resolve(content);
                }
            });
        });
    }

    addPathDependency(classpath) {
        // Make relative glob
        let p = path.relative(path.dirname(this.name), classpath);
        p = path.join(p, '/**/*.hx');
        if (p.charAt(0) !== '.') p = './' + p;
        // Bug #2483: can't watch a glob so watch all files
        // this.addDependency(p, { includedInParent: true });
        glob.sync(p).forEach(file => this.addDependency(file, { includedInParent: true }));
    }
}

module.exports = HaxeAsset;

/* Reusing processing logic from webpack-haxe-loader */
function process(context, cb) {

    const request = context.resourcePath;
    if (!request) {
        // Loader was called without specifying a real hxml file
        fromCache(context, context.query, cb);
        return;
    }

    const hxmlContent = String(fs.readFileSync(request));
    const ns = path.basename(request).replace('.hxml', '');
    const jsTempFile = makeJSTempFile(ns);
    const { jsOutputFile, classpath, args } = prepare(context, ns, hxmlContent, jsTempFile);

    // In HMR scenario we need to indicate sub-modules that a build is in process
    const lockFile = getLockFile(context, ns);
    createLock(lockFile);

    // Execute the Haxe build.
    console.log('haxe', args.join(' '));
    exec(`haxe ${args.join(' ')}`, (err, stdout, stderr) => {
        if (err) {
            return cb(err);
        }
        // Read the resulting JS file and return the main module
        const processed = processOutput(context, jsTempFile, jsOutputFile);
        if (processed) {
            updateCache(context, ns, processed, classpath);
        }
        releaseLock(lockFile);
        returnModule(context, ns, 'Main', cb);
    });
};

function updateCache(context, ns, { results }, classpath) {
    const { options: { cacheDir } } = context;
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    results.forEach(entry => {
        const cacheFile = path.join(cacheDir, `${ns}__${entry.name}.json`);
        fs.writeFileSync(cacheFile, JSON.stringify(entry));
    });

    saveDependencies(context, ns, classpath);
}

function getLockFile(context, ns) {
    const { options: { cacheDir } } = context;
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
    return path.join(cacheDir, `${ns}.lock`);
}

function waitLock(lockFile) {
    return new Promise((resolve) => {
        if (fs.existsSync(lockFile)) {
            let watcher = fs.watch(lockFile, () => {
                if (!fs.existsSync(lockFile)) {
                    watcher.close();
                    watcher = undefined;
                    resolve();
                }
            });
        } else resolve();
    });
}

function createLock(lockFile) {
    fs.writeFileSync(lockFile, new Date().toString());
}

function releaseLock(lockFile) {
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
}

function processOutput(context, jsTempFile, jsOutputFile) {
    const { options } = context;

    const content = String(fs.readFileSync(jsTempFile.path));

    // Split output
    const modules = findImports(content);
    const debug = options.hmr && fs.existsSync(`${jsTempFile.path}.map`);
    const graphHooks = hooks.getGraphHooks();
    const results = split.run(jsTempFile.path, jsOutputFile, modules, debug, true, false, false, graphHooks)
        .filter(entry => entry && entry.source);

    results.forEach(entry => {
        // Inject .hx sources in map file
        if (entry.map) {
            const map = entry.map.content;
            map.sourcesContent = map.sources.map(path => {
                try {
                    if (path.startsWith('file:///')) path = path.substr(8);
                    return fs.readFileSync(path).toString();
                } catch (_) {
                    return '';
                }
            });
        }
    });

    // Delete temp files
    jsTempFile.cleanup();

    return { results };
}

function returnModule(context, ns, name, cb) {
    const { options: { cacheDir } } = context;
    const cacheFile = path.join(cacheDir, `${ns}__${name}.json`);

    if (!fs.existsSync(cacheFile)) {
        throw new Error(`${ns}.hxml did not emit a module called '${name}'`);
    }

    registerDepencencies(context, ns);

    const cache = JSON.parse(String(fs.readFileSync(cacheFile)));
    cb(null, { content: cache.source.content, sourceMap: cache.map.content });
}

function fromCache(context, query, cb) {
    // To locate a split module we expect a query of the form 'hxmlName!moduleName.hxml'
    const params = /([^!]+)!(.*)\.hxml/.exec(query);
    if (!params) {
        throw new Error(`Invalid query: ${query}`);
    }
    const ns = params[1];
    const name = params[2];

    waitLock(getLockFile(context, ns)).then(() => returnModule(context, ns, name, cb));
}

function findImports(content) {
    // Parcel.load() emits a dynamic import call with a query to haxe-loader
    const reImports = /import\("!([^.]+)\.hxml/g;
    const results = [];

    let match = reImports.exec(content);
    while (match) {
        // Module reference is of the form 'hxmlName!moduleName'
        const name = match[1].substr(match[1].indexOf('!') + 1);
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

function saveDependencies(context, ns, classpath) {
    const { options: { cacheDir } } = context;
    const cacheFile = path.join(cacheDir, `${ns}__classpath.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(classpath));
}

function registerDepencencies(context, ns) {
    const { options: { cacheDir } } = context;
    const cacheFile = path.join(cacheDir, `${ns}__classpath.json`);
    if (fs.existsSync(cacheFile)) {
        const classpath = JSON.parse(fs.readFileSync(cacheFile));
        // Listen for any changes in the classpath
        classpath.forEach(path => context.addContextDependency(path));
    }
}

function prepare(context, ns, hxmlContent, jsTempFile) {
    const { options } = context;
    let args = [];
    const classpath = [];
    let jsOutputFile = null;

    // Add args that are specific to hxml-loader
    if (options.sourceMaps) {
        args.push('-debug');
    }
    args.push('-D', `parcel_namespace=${ns}`);

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

            if (name === '-js') {
                jsOutputFile = value;
                args.push(jsTempFile.path);
                continue;
            }

            if (name === '-cp') {
                classpath.push(path.resolve(value));
            }

            args.push(value);
        }
    }

    if (options.haxeExtra) args.push(options.haxeExtra);

    return { jsOutputFile, classpath, args };
}
