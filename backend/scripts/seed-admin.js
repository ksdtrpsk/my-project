const { readConfig } = require('../config');
const { createDatabase } = require('../students');
const { hashPassword } = require('../passwords');

async function seedAdmin() {
  const config = readConfig();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!/^[A-Za-z0-9_.-]{1,50}$/.test(username)) throw new Error('ADMIN_USERNAME ใช้ภาษาอังกฤษ ตัวเลข หรือ _ . - ไม่เกิน 50 ตัว');
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) throw new Error('ตั้ง ADMIN_PASSWORD ใน .env ยาว 6–128 ตัวอักษร');
  const pool = createDatabase(config.database);
  try {
    const [rows] = await pool.execute('SELECT admin_id FROM admins WHERE username = ?', [username]);
    if (rows.length) throw new Error('บัญชีเจ้าหน้าที่นี้มีอยู่แล้ว ไม่เปลี่ยนรหัสผ่านเดิม');
    const hash = await hashPassword(password);
    await pool.execute('INSERT INTO admins (username, password, name) VALUES (?, ?, ?)', [username, hash, 'เจ้าหน้าที่ดูแลหนังสือ']);
    console.log('สร้างบัญชีเจ้าหน้าที่แล้ว ใช้ชื่อใน ADMIN_USERNAME (ค่าเริ่มต้น admin) และรหัสใน ADMIN_PASSWORD');
  } catch (error) { throw new Error(error.code ? `สร้างบัญชีไม่ได้ (${error.code})` : error.message); }
  finally { await pool.end(); }
}
if (require.main === module) seedAdmin().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seedAdmin };
