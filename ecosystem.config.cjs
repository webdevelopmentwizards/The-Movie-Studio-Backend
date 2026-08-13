module.exports = {
  apps: [
    {
      name: 'the-movie-studio-api',
      script: './dist/src/app.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
