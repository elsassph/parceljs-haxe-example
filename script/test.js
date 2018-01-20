const fs = require('fs');

//./node_modules/parcel-bundler/src/builtins/bundle-loader.js
fs.stat("c:\\Dev\\tests\\haxe\\modular\\parceljs-haxe-example\\node_modules\\parcel-bundler\\src\\builtins\\bundle-loader.js", (err, stats) => {
    console.log(err, stats);
});