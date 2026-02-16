module.exports = {
  apps: [
    {
      name: "hn-showcase",
      cwd: "./app",
      script: "node_modules/.bin/next",
      args: "start",
      env: {
        PORT: 3333,
        HOSTNAME: "0.0.0.0",
        NODE_ENV: "production",
        DATABASE_PATH: "./data/showhn.db",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/root/clawd/projects/showhn/logs/pm2-error.log",
      out_file: "/root/clawd/projects/showhn/logs/pm2-out.log",
      merge_logs: true,
    },
  ],
};
