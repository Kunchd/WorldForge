const upstreamTransformerPath = require.resolve(
  '@expo/metro-config/babel-transformer',
  { paths: [require.resolve('expo/package.json')] },
);
const upstreamTransformer = require(upstreamTransformerPath);

module.exports.transform = async ({ src, filename, options }) => {
  const transformedSource = filename.endsWith('.md')
    ? `module.exports = ${JSON.stringify(src)};`
    : src;

  return upstreamTransformer.transform({
    src: transformedSource,
    filename,
    options,
  });
};
