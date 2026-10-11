// Phase 4 repository: books and book sets only, using the Phase 2 schema.
const {problem}=require('./errors');
const {objectInput}=require('./validation');
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 4294967295) throw problem(400, `${label} ไม่ถูกต้อง`);
  return value;
}
function text(value, label, max, required = true) {
  if (!required && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || value.trim().length > max || (required && !value.trim())) throw problem(400, `${label} ไม่ถูกต้องหรือยาวเกิน ${max} ตัวอักษร`);
  return value.trim();
}
function bookInput(body) {
  objectInput(body,['book_code','book_name','description']);
  return { book_code: text(body.book_code, 'รหัสหนังสือ', 30), book_name: text(body.book_name, 'ชื่อหนังสือ', 200), description: text(body.description, 'รายละเอียด', 5000, false) };
}
function setInput(body) {
  objectInput(body,['department_id','education_level_id','classroom_id','semester','academic_year','book_ids']);
  const result = {};
  for (const key of ['department_id', 'education_level_id', 'classroom_id']) result[key] = integer(body[key], key);
  if (![1, 2, 3].includes(body.semester)) throw problem(400, 'ภาคเรียนต้องเป็น 1, 2 หรือ 3');
  if (!Number.isInteger(body.academic_year) || body.academic_year < 2500 || body.academic_year > 2999) throw problem(400, 'ปีการศึกษาต้องเป็น พ.ศ. 2500–2999');
  if (!Array.isArray(body.book_ids) || body.book_ids.length < 1 || body.book_ids.length > 200) throw problem(400, 'เลือกหนังสือ 1–200 เล่ม');
  result.book_ids = body.book_ids.map(id => integer(id, 'รหัสหนังสือ'));
  if (new Set(result.book_ids).size !== result.book_ids.length) throw problem(400, 'ห้ามเลือกหนังสือซ้ำในชุด');
  return { ...result, semester: body.semester, academic_year: body.academic_year };
}
function databaseError(error) {
  if (error.status) return error;
  if (error.code === 'ER_DUP_ENTRY') return problem(409, 'รหัสหนังสือหรือชุดของกลุ่ม/ภาคเรียน/ปีนี้มีอยู่แล้ว');
  if (['ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW_2'].includes(error.code)) return problem(409, 'ข้อมูลถูกอ้างอิงหรือเปลี่ยนไปแล้ว กรุณาโหลดใหม่');
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return problem(409, 'มีการแก้ไขพร้อมกัน กรุณาลองใหม่');
  return error;
}
function createCatalog(pool) {
  async function transaction(action) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await action(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw databaseError(error); }
    finally { connection.release(); }
  }
  async function lockSet(connection, id) {
    const [rows] = await connection.execute('SELECT book_set_id FROM book_sets WHERE book_set_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw problem(404, 'ไม่พบชุดหนังสือ');
    const [used] = await connection.execute('SELECT booking_id FROM bookings WHERE book_set_id = ? LIMIT 1', [id]);
    if (used.length) throw problem(409, 'ชุดนี้มีประวัติการจองแล้ว ไม่สามารถแก้ไขหรือลบได้');
  }
  async function checkSet(connection, data) {
    const [group] = await connection.execute(`SELECT classroom_id FROM classrooms WHERE classroom_id = ? AND department_id = ? AND education_level_id = ? FOR SHARE`,
      [data.classroom_id, data.department_id, data.education_level_id]);
    if (!group.length) throw problem(400, 'ห้องเรียนไม่ตรงกับสาขาหรือระดับชั้นที่เลือก');
    const ids = [...data.book_ids].sort((a, b) => a - b);
    const [books] = await connection.execute(`SELECT book_id FROM books WHERE book_id IN (${ids.map(() => '?').join(',')}) ORDER BY book_id FOR UPDATE`, ids);
    if (books.length !== ids.length) throw problem(400, 'มีหนังสือที่ไม่พบในระบบ กรุณาโหลดรายการใหม่');
  }
  async function insertItems(connection, id, bookIds) {
    for (const bookId of bookIds) await connection.execute('INSERT INTO book_set_items (book_set_id, book_id) VALUES (?, ?)', [id, bookId]);
  }
  return {
    async listBooks(search = '') {
      const term = '%' + (text(search, 'คำค้นหา', 100, false) || '').replace(/[=%_]/g, value => '=' + value) + '%';
      const [rows] = await pool.execute(`SELECT book_id, book_code, book_name, description FROM books WHERE book_name LIKE ? ESCAPE '=' OR book_code LIKE ? ESCAPE '=' ORDER BY book_code, book_id`, [term, term]);
      return rows;
    },
    async createBook(body) {
      const data = bookInput(body);
      try {
        const [result] = await pool.execute('INSERT INTO books (book_code, book_name, description) VALUES (?, ?, ?)', [data.book_code, data.book_name, data.description]);
        return { book_id: result.insertId, ...data };
      } catch (error) { throw databaseError(error); }
    },
    async updateBook(id, body) {
      const data = bookInput(body);
      return transaction(async connection => {
        const [rows] = await connection.execute('SELECT book_id FROM books WHERE book_id = ? FOR UPDATE', [id]);
        if (!rows.length) throw problem(404, 'ไม่พบหนังสือ');
        const [used] = await connection.execute('SELECT b.booking_id FROM bookings b JOIN book_set_items i ON i.book_set_id = b.book_set_id WHERE i.book_id = ? LIMIT 1', [id]);
        if (used.length) throw problem(409, 'หนังสืออยู่ในชุดที่มีประวัติจองแล้ว ไม่สามารถแก้ไขได้');
        await connection.execute('UPDATE books SET book_code = ?, book_name = ?, description = ? WHERE book_id = ?', [data.book_code, data.book_name, data.description, id]);
        return { book_id: id, ...data };
      });
    },
    async deleteBook(id) {
      return transaction(async connection => {
        const [rows] = await connection.execute('SELECT book_id FROM books WHERE book_id = ? FOR UPDATE', [id]);
        if (!rows.length) throw problem(404, 'ไม่พบหนังสือ');
        const [items] = await connection.execute('SELECT id FROM book_set_items WHERE book_id = ? LIMIT 1', [id]);
        if (items.length) throw problem(409, 'หนังสือนี้อยู่ในชุดหนังสือ กรุณานำออกจากชุดก่อนลบ');
        await connection.execute('DELETE FROM books WHERE book_id = ?', [id]);
      });
    },
    async lookups() {
      const [[departments], [education_levels], [classrooms]] = await Promise.all([
        pool.query('SELECT department_id, department_name FROM departments ORDER BY department_name'),
        pool.query('SELECT education_level_id, education_level_name FROM education_levels ORDER BY education_level_id'),
        pool.query('SELECT classroom_id, department_id, education_level_id, classroom_name FROM classrooms ORDER BY classroom_name')
      ]);
      return { departments, education_levels, classrooms };
    },
    async listSets(studentId = null) {
      // Student group comes from the authenticated account, never request fields.
      const scope = studentId === null ? '' : `JOIN students s ON s.department_id = bs.department_id AND s.education_level_id = bs.education_level_id AND s.classroom_id = bs.classroom_id`;
      const where = studentId === null ? '' : 'WHERE s.student_id = ?';
      const [rows] = await pool.execute(`SELECT bs.*, d.department_name, e.education_level_name, c.classroom_name,
        b.book_id, b.book_code, b.book_name, b.description,
        EXISTS(SELECT 1 FROM bookings bk WHERE bk.book_set_id = bs.book_set_id) AS has_bookings
        FROM book_sets bs ${scope}
        JOIN departments d ON d.department_id = bs.department_id
        JOIN education_levels e ON e.education_level_id = bs.education_level_id
        JOIN classrooms c ON c.classroom_id = bs.classroom_id
        LEFT JOIN book_set_items i ON i.book_set_id = bs.book_set_id
        LEFT JOIN books b ON b.book_id = i.book_id ${where}
        ORDER BY bs.academic_year DESC, bs.semester DESC, bs.book_set_id, b.book_code`, studentId === null ? [] : [studentId]);
      const sets = new Map();
      for (const row of rows) {
        const { book_id, book_code, book_name, description, ...info } = row;
        if (!sets.has(row.book_set_id)) sets.set(row.book_set_id, { ...info, has_bookings: Boolean(info.has_bookings), books: [] });
        if (book_id !== null) sets.get(row.book_set_id).books.push({ book_id, book_code, book_name, description });
      }
      return [...sets.values()];
    },
    async saveSet(id, body) {
      const data = setInput(body);
      return transaction(async connection => {
        if (id !== null) await lockSet(connection, id);
        await checkSet(connection, data);
        const group = [data.department_id, data.education_level_id, data.classroom_id, data.semester, data.academic_year];
        if (id === null) {
          const [result] = await connection.execute('INSERT INTO book_sets (department_id, education_level_id, classroom_id, semester, academic_year) VALUES (?, ?, ?, ?, ?)', group);
          id = result.insertId;
        } else {
          await connection.execute('UPDATE book_sets SET department_id = ?, education_level_id = ?, classroom_id = ?, semester = ?, academic_year = ? WHERE book_set_id = ?', [...group, id]);
          await connection.execute('DELETE FROM book_set_items WHERE book_set_id = ?', [id]);
        }
        await insertItems(connection, id, data.book_ids);
        return { book_set_id: id, ...data };
      });
    },
    async deleteSet(id) {
      return transaction(async connection => {
        await lockSet(connection, id);
        await connection.execute('DELETE FROM book_set_items WHERE book_set_id = ?', [id]);
        await connection.execute('DELETE FROM book_sets WHERE book_set_id = ?', [id]);
      });
    }
  };
}
module.exports = { createCatalog, problem, integer, bookInput, setInput };
