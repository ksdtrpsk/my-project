const { readConfig } = require('../config');
const { createDatabase } = require('../students');
async function migratePhase8(pool) {
  const [columns] = await pool.query("SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='received_at'");
  if (columns.length) {
    if (columns[0].DATA_TYPE !== 'datetime' || columns[0].IS_NULLABLE !== 'YES') throw new Error('received_at มีรูปแบบไม่ตรงกับ migration กรุณาตรวจ schema');
    return false;
  }
  await pool.query('ALTER TABLE bookings ADD COLUMN received_at DATETIME NULL DEFAULT NULL AFTER created_at');
  return true;
}
if (require.main === module) {
  const pool = createDatabase(readConfig().database);
  migratePhase8(pool).then(changed => console.log(changed ? 'Phase 8: เพิ่ม received_at แล้ว ข้อมูลเดิมคงอยู่' : 'Phase 8: received_at พร้อมแล้ว ไม่เปลี่ยนข้อมูล')).catch(() => { console.error('Migration ไม่สำเร็จ ตรวจ .env และสิทธิ์ ALTER TABLE'); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { migratePhase8 };
