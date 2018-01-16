const Bundler = require('parcel-bundler');

const bundler = new Bundler('./src/index.html');
bundler.addPackager('hxml', require.resolve('./HaxePackager'));
bundler.parser.registerExtension('hxml', require.resolve('./HaxeAsset'));

bundler.serve(1234, false);
