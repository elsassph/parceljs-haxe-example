// This will all be automatic with a 'parcel-plugin-haxe' npm module
const Bundler = require('parcel-bundler');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

const bundler = new Bundler('./index.html');

bundler.addPackager('hxml', require.resolve('./HaxePackager'));
bundler.addAssetType('hxml', require.resolve('./HaxeAsset'));

bundler.serve(1234, false);
