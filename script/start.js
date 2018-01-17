// This will all be automatic with a 'parcel-plugin-haxe' npm module
const Bundler = require('parcel-bundler');

const bundler = new Bundler('./src/index.html');
bundler.addPackager('hxml', require.resolve('./HaxePackager'));
bundler.addAssetType('hxml', require.resolve('./HaxeAsset'));

bundler.serve(1234, false);
