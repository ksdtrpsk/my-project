const fs = require('node:fs');
const path = require('node:path');

function readConfig() {
  const envFile = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  function integer(name, fallback, max) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} ไม่ถูกต้อง`);
    return value;
  }
  return {
    port: integer('PORT', 3000, 65535),
    sessionMs: integer('SESSION_MINUTES', 60, 1440) * 60 * 1000,
    database: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: integer('DB_PORT', 3306, 65535),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'college_book_queue',
      charset: 'utf8mb4', timezone: '+07:00',
      connectionLimit: 5, connectTimeout: 5000
    }
  };
}
module.exports = { readConfig };
