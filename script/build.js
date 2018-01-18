// This will all be automatic with a 'parcel-plugin-haxe' npm module
const Bundler = require('parcel-bundler');

process.env.NODE_ENV = 'production';

const bundler = new Bundler('./src/index.html', { publicURL:'/' });

bundler.addPackager('hxml', require.resolve('./HaxePackager'));
bundler.addAssetType('hxml', require.resolve('./HaxeAsset'));

bundler.bundle();
