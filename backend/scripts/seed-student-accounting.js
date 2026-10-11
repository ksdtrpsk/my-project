const { readConfig } = require('../config');
const { createDatabase } = require('../students');
const { hashPassword } = require('../passwords');

async function seed() {
  const config = readConfig();
  const password = process.env.ACCOUNTING_STUDENT_PASSWORD;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('ตั้ง ACCOUNTING_STUDENT_PASSWORD ใน .env เป็นรหัสผ่านที่เลือกเอง ยาว 12–128 ตัวอักษร');
  }
  const hash = await hashPassword(password);
  const pool = createDatabase(config.database);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Duplicate accounts must not silently overwrite a student's password or group.
    const [existing] = await connection.execute('SELECT student_id FROM students WHERE student_code = ?', ['66302010001']);
    if (existing.length) throw new Error('รหัส 66302010001 มีอยู่แล้ว ไม่เปลี่ยนข้อมูลหรือรหัสผ่านเดิม');
    const [department] = await connection.execute(
      'INSERT INTO departments (department_name) VALUES (?) ON DUPLICATE KEY UPDATE department_id = LAST_INSERT_ID(department_id)', ['การบัญชี']);
    const [level] = await connection.execute(
      'INSERT INTO education_levels (education_level_name) VALUES (?) ON DUPLICATE KEY UPDATE education_level_id = LAST_INSERT_ID(education_level_id)', ['ปวส.2']);
    const [classroom] = await connection.execute(
      'INSERT INTO classrooms (department_id, education_level_id, classroom_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE classroom_id = LAST_INSERT_ID(classroom_id)',
      [department.insertId, level.insertId, 'ปวส.2/1']);
    await connection.execute(`INSERT INTO students
      (student_code, password, first_name, last_name, department_id, education_level_id, classroom_id, phone, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['66302010001', hash, 'สมหญิง', 'เรียนดี', department.insertId, level.insertId, classroom.insertId, null, 'accounting-student@example.com']);
    await connection.commit();
    console.log('สร้างนักศึกษาทดสอบ 66302010001 แล้ว ใช้รหัสผ่านที่คุณตั้งไว้ (ไม่ได้สร้าง Book Set หรือ Booking)');
  } catch (error) {
    if (connection) await connection.rollback();
    // Driver messages can include values from INSERT, so only expose our own errors.
    throw new Error(error.code ? `สร้างข้อมูลไม่สำเร็จ (${error.code}) ตรวจฐานข้อมูล Phase 2` : error.message);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}
seed().catch(error => { console.error(error.message); process.exitCode = 1; });

