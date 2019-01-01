// This will all be automatic with a 'parcel-plugin-haxe' npm module
const Bundler = require('parcel-bundler');

process.env.NODE_ENV = 'production';

const bundler = new Bundler('./index.html');

bundler.addAssetType('hxml', require.resolve('./HaxeAsset'));

bundler.bundle();
