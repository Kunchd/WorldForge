const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('md');
config.transformer.babelTransformerPath = require.resolve(
  './src/lib/markdownTransformer.js',
);

module.exports = config;
