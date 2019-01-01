// This will all be automatic with a 'parcel-plugin-haxe' npm module
const Bundler = require('parcel-bundler');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const bundler = new Bundler('./index.html', { useLocalWorker: true });

bundler.addAssetType('hxml', require.resolve('./HaxeAsset'));

bundler.serve(1234, false);
