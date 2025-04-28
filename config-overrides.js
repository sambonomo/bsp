const { override, addWebpackResolve } = require('customize-cra');
const webpack = require('webpack');

module.exports = override(
  addWebpackResolve({
    extensions: ['.js', '.mjs', '.jsx', '.ts', '.tsx'],
    fullySpecified: false,
  }),
  (config) => {
    console.log('Applying config-overrides.js...');
    console.log('Resolve Config:', config.resolve);

    config.resolve.fallback = {
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      crypto: require.resolve('crypto-browserify'),
      process: require.resolve('process/browser'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
      vm: require.resolve('vm-browserify'),
    };

    config.plugins = [
      ...(config.plugins || []),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser',
      }),
    ];

    if (config.devServer) {
      const { onBeforeSetupMiddleware, onAfterSetupMiddleware, ...otherDevServerConfig } = config.devServer;
      config.devServer = {
        ...otherDevServerConfig,
        setupMiddlewares: (middlewares, devServer) => {
          if (onBeforeSetupMiddleware) {
            onBeforeSetupMiddleware(devServer);
          }
          if (onAfterSetupMiddleware) {
            onAfterSetupMiddleware(devServer);
          }
          return middlewares;
        },
      };
    }

    return config;
  }
);