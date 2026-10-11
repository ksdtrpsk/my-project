const fs = require('node:fs/promises');
const path = require('node:path');
const { readConfig } = require('../config');
const { createDatabase } = require('../students');
async function migrateSessions(pool) {
  await pool.query(await fs.readFile(path.resolve(__dirname, '../../database/migrations/shared-sessions.sql'), 'utf8'));
}
if (require.main === module) {
  const pool = createDatabase(readConfig().database);
  migrateSessions(pool).then(() => console.log('Shared session table ready; accounts and bookings unchanged'))
    .catch(() => { console.error('Session migration failed; check connection and permissions'); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { migrateSessions };
