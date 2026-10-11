// All values use prepared-statement parameters; API responses never select password.
const profileColumns = `s.student_id, s.student_code, s.first_name, s.last_name,
  s.department_id, d.department_name, s.education_level_id, e.education_level_name,
  s.classroom_id, c.classroom_name, s.phone, s.email, s.must_change_password`;
const profileJoins = `FROM students s
  JOIN classrooms c ON c.classroom_id = s.classroom_id
    AND c.department_id = s.department_id AND c.education_level_id = s.education_level_id
  JOIN departments d ON d.department_id = s.department_id
  JOIN education_levels e ON e.education_level_id = s.education_level_id`;

function createStudentRepository(pool) {
  return {
    async findCredentials(studentCode) {
      const [rows] = await pool.execute(
        'SELECT student_id, password FROM students WHERE student_code = ? LIMIT 1', [studentCode]);
      return rows[0] || null;
    },
    async findProfile(studentId) {
      const [rows] = await pool.execute(`SELECT ${profileColumns} ${profileJoins} WHERE s.student_id = ? LIMIT 1`, [studentId]);
      const row=rows[0];
      if(row&&!row.must_change_password)delete row.must_change_password;
      return row || null;
    }
  };
}

function createDatabase(config) {
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') throw new Error('ยังไม่ได้ติดตั้ง mysql2 กรุณารัน npm install ในโฟลเดอร์ book-queue');
    throw error;
  }
  return mysql.createPool(config);
}
module.exports = { createStudentRepository, createDatabase };
