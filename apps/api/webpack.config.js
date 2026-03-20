const path = require('path');

module.exports = (options) => {
  const originalExternals = options.externals;

  return {
    ...options,
    externals: [
      function (ctx, callback) {
        const request = ctx.request;
        if (request && request.startsWith('@monipoch/')) {
          return callback();
        }
        if (typeof originalExternals === 'function') {
          return originalExternals(ctx, callback);
        }
        if (Array.isArray(originalExternals)) {
          for (const ext of originalExternals) {
            if (typeof ext === 'function') {
              return ext(ctx, callback);
            }
          }
        }
        return callback();
      },
    ],
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          options: { transpileOnly: true },
          exclude: /node_modules\/(?!@monipoch)/,
        },
      ],
    },
    resolve: {
      ...options.resolve,
      extensions: ['.ts', '.js', '.json'],
      alias: {
        '@monipoch/shared': path.resolve(__dirname, '../../packages/shared/src'),
        '@monipoch/eve-sdk': path.resolve(__dirname, '../../packages/eve-sdk/src'),
      },
    },
  };
};
