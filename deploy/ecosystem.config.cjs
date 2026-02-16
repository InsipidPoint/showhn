module.exports = {
  apps: [
    {
      name: "hn-showcase",
      cwd: "./app",
      script: "node_modules/.bin/next",
      args: "start",
      env: {
        PORT: 3333,
        NODE_ENV: "production",
        DATABASE_PATH: "./data/showhn.db",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
