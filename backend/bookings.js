const { integer, problem } = require('./catalog');
const { bangkokNow } = require('./slots');
const { newQrToken } = require('./qr');

function bookingInput(body) {
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !['book_set_id', 'slot_id'].includes(key))) throw problem(400, 'ส่งเฉพาะ book_set_id และ slot_id');
  return { book_set_id: integer(body.book_set_id, 'รหัสชุดหนังสือ'), slot_id: integer(body.slot_id, 'รหัสรอบ') };
}
function createBookings(pool, now = Date.now) {
  async function list(studentId, connection = pool, bookingId) {
    const [rows] = await connection.execute(`SELECT b.booking_id, b.book_set_id, b.slot_id, b.queue_number, b.booking_status,
      DATE_FORMAT(b.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(b.received_at,'%Y-%m-%d %H:%i:%s') AS received_at,
      s.student_code, s.first_name, s.last_name, d.department_name, e.education_level_name, c.classroom_name,
      bs.semester, bs.academic_year, DATE_FORMAT(sl.booking_date,'%Y-%m-%d') AS booking_date,
      TIME_FORMAT(sl.start_time,'%H:%i:%s') AS start_time, TIME_FORMAT(sl.end_time,'%H:%i:%s') AS end_time
      FROM bookings b JOIN students s ON s.student_id=b.student_id
      JOIN book_sets bs ON bs.book_set_id=b.book_set_id
      JOIN departments d ON d.department_id=bs.department_id
      JOIN education_levels e ON e.education_level_id=bs.education_level_id
      JOIN classrooms c ON c.classroom_id=bs.classroom_id
      JOIN booking_slots sl ON sl.slot_id=b.slot_id
      WHERE b.student_id=? ${bookingId === undefined ? '' : 'AND b.booking_id=?'} ORDER BY b.booking_id DESC`, bookingId === undefined ? [studentId] : [studentId, bookingId]);
    if (!rows.length) return [];
    const ids = [...new Set(rows.map(row => row.book_set_id))];
    const [books] = await connection.execute(`SELECT i.book_set_id, bk.book_id, bk.book_code, bk.book_name, bk.description
      FROM book_set_items i JOIN books bk ON bk.book_id=i.book_id WHERE i.book_set_id IN (${ids.map(() => '?').join(',')}) ORDER BY bk.book_code`, ids);
    return rows.map(row => ({ ...row, can_cancel: row.booking_status === 'WAITING' && !row.received_at && row.booking_date + ' ' + row.start_time > bangkokNow(now()), books: books.filter(book => book.book_set_id === row.book_set_id).map(({ book_set_id, ...book }) => book) }));
  }
  return {
    list,
    async cancel(studentId, bookingId) {
      const id = integer(bookingId, 'รหัสการจอง');
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        // Serialize with rebooking; lock slot before booking like the booking creator.
        const [[student]] = await connection.execute('SELECT student_id FROM students WHERE student_id=? FOR UPDATE', [studentId]);
        if (!student) throw problem(401, 'กรุณาเข้าสู่ระบบใหม่');
        const [[target]] = await connection.execute('SELECT slot_id FROM bookings WHERE booking_id=? AND student_id=?', [id, studentId]);
        if (!target) throw problem(404, 'ไม่พบการจอง');
        const [[slot]] = await connection.execute("SELECT DATE_FORMAT(booking_date,'%Y-%m-%d') AS booking_date,TIME_FORMAT(start_time,'%H:%i:%s') AS start_time FROM booking_slots WHERE slot_id=? FOR UPDATE", [target.slot_id]);
        const [[booking]] = await connection.execute('SELECT booking_status,received_at FROM bookings WHERE booking_id=? AND student_id=? FOR UPDATE', [id, studentId]);
        if (booking.booking_status === 'CANCELLED') throw problem(409, 'รายการนี้ยกเลิกแล้ว');
        if (booking.booking_status !== 'WAITING' || booking.received_at) throw problem(409, 'ยกเลิกได้เฉพาะรายการที่ยังรอรับและยังไม่เช็กอิน');
        if (slot.booking_date + ' ' + slot.start_time <= bangkokNow(now())) throw problem(409, 'ถึงเวลาเริ่มรอบแล้ว ไม่สามารถยกเลิกได้');
        // Availability counts non-cancelled rows, so this releases exactly one seat.
        await connection.execute("UPDATE bookings SET booking_status='CANCELLED' WHERE booking_id=?", [id]);
        const [receipt] = await list(studentId, connection, id);
        await connection.commit();
        return receipt;
      } catch (error) {
        await connection.rollback();
        if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw problem(409, 'มีการทำรายการพร้อมกัน กรุณาโหลดข้อมูลแล้วลองใหม่');
        throw error;
      } finally { connection.release(); }
    },
    async create(studentId, body) {
      const data = bookingInput(body);
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        // Lock account, set, then slot. Every booking writer must use this order.
        const [[student]] = await connection.execute('SELECT student_id,department_id,education_level_id,classroom_id FROM students WHERE student_id=? FOR UPDATE', [studentId]);
        if (!student) throw problem(401, 'กรุณาเข้าสู่ระบบใหม่');
        const [[set]] = await connection.execute('SELECT * FROM book_sets WHERE book_set_id=? FOR UPDATE', [data.book_set_id]);
        if (!set || ['department_id','education_level_id','classroom_id'].some(key => student[key] !== set[key])) throw problem(403, 'ชุดหนังสือไม่ตรงกับบัญชีนักศึกษา');
        // Shared book locks coordinate with Phase 4 edits until the booking commits.
        const [items] = await connection.execute('SELECT bk.book_id FROM book_set_items i JOIN books bk ON bk.book_id=i.book_id WHERE i.book_set_id=? ORDER BY bk.book_id FOR SHARE', [data.book_set_id]);
        if (!items.length) throw problem(409, 'ชุดหนังสือยังไม่มีรายการหนังสือ');
        const [existing] = await connection.execute("SELECT booking_id FROM bookings WHERE student_id=? AND book_set_id=? AND booking_status <> 'CANCELLED'", [studentId, data.book_set_id]);
        if (existing.length) throw problem(409, 'คุณจองชุดหนังสือนี้แล้ว กรุณาดูการจองของฉัน');
        const [[slot]] = await connection.execute("SELECT slot_id, DATE_FORMAT(booking_date,'%Y-%m-%d') AS booking_date,TIME_FORMAT(start_time,'%H:%i:%s') AS start_time,max_students,status FROM booking_slots WHERE slot_id=? FOR UPDATE", [data.slot_id]);
        if (!slot) throw problem(404, 'ไม่พบรอบรับหนังสือ');
        if (slot.status !== 'OPEN') throw problem(409, 'รอบนี้ปิดแล้ว กรุณาเลือกรอบใหม่');
        if (slot.booking_date + ' ' + slot.start_time <= bangkokNow(now())) throw problem(409, 'เลยเวลาเริ่มรอบแล้ว กรุณาเลือกรอบใหม่');
        // Current locking read avoids stale snapshots after another transaction wins a seat.
        const [occupied] = await connection.execute('SELECT queue_number,booking_status FROM bookings WHERE slot_id=? FOR UPDATE', [data.slot_id]);
        if (occupied.filter(row => row.booking_status !== 'CANCELLED').length >= slot.max_students) throw problem(409, 'คิวเต็ม กรุณาเลือกรอบใหม่');
        const last = occupied.reduce((max, row) => /^A\d+$/.test(row.queue_number) ? Math.max(max, Number(row.queue_number.slice(1))) : max, 0);
        if (!Number.isSafeInteger(last + 1)) throw problem(409, 'เลขคิวเกินขอบเขต กรุณาติดต่อเจ้าหน้าที่');
        // A001 starts per slot; cancelled history keeps its number and is never reused.
        const queue = 'A' + String(last + 1).padStart(3, '0');
        const [result] = await connection.execute("INSERT INTO bookings(student_id,slot_id,book_set_id,queue_number,booking_status,created_at,qr_code) VALUES(?,?,?,?,'WAITING',?,?)", [studentId, data.slot_id, data.book_set_id, queue, bangkokNow(now()), newQrToken()]);
        const [booking] = await list(studentId, connection, result.insertId);
        await connection.commit();
        return booking;
      } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') throw problem(409, 'มีการจองซ้ำ กรุณาดูการจองของฉันก่อนลองใหม่');
        if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw problem(409, 'มีการทำรายการพร้อมกัน กรุณาโหลดข้อมูลแล้วลองใหม่');
        if (error.code === 'ER_NO_REFERENCED_ROW_2') throw problem(409, 'ข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่');
        throw error;
      } finally { connection.release(); }
    }
  };
}
module.exports = { createBookings, bookingInput };
