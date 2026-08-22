module.exports = {
  apps: [
    {
      name: 'cafe-backend',
      script: './apps/backend/dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.BACKEND_PORT || 3000
      }
    },
    {
      name: 'cafe-ims',
      script: './apps/ims/.output/server/index.mjs',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.IMS_PORT || 8080
      }
    }
  ]
};
