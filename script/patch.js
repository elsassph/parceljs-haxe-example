const path = require('path');

module.exports = function(resolver) {

    const _internal = resolver.resolveInternal;

    resolver.resolveInternal = function(filename, parent, nextResolver) {

        if (filename.startsWith('!')) {
            let key = (parent ? path.dirname(parent) : '') + ':' + filename;
            if (resolver.cache.has(key)) {
              return resolver.cache.get(key);
            }
            return { path: filename };
        }

        return _internal.call(resolver, filename, parent, nextResolver);
    }
}
