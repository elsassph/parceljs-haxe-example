# Parcel.js Haxe POC

A proof-of-concept Haxe plugin for [Parcel.js](https://parceljs.org/),
the *"Blazing fast, zero configuration web application bundler"*

## Patch

First thing needed is to path Parcel's resolver to accept "virtual" files:

Edit `node_modules\parcel-bundler\src\Resolver.js` and patch `resolveInternal`:

```javascript
  resolveInternal(filename, parent, resolver) {
    let key = this.getCacheKey(filename, parent);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // PATCH-START
    if (filename.startsWith('!')) {
      return { path: filename };
    }
    // PATCH-END

    if (glob.hasMagic(filename)) {
      return {path: path.resolve(path.dirname(parent), filename)};
    }
```

## Dev

    yarn start

## Production

    yarn run clean
    yarn build
