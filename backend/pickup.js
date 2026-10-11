const { integer, problem } = require('./catalog');
const { bangkokNow } = require('./slots');
const { createBookings } = require('./bookings');
function pickupInput(body, confirm = false) {
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !(confirm ? ['token','booking_id'] : ['token']).includes(key))
    || typeof body.token !== 'string' || !/^BQ1:[A-F0-9]{64}$/.test(body.token)) throw problem(400, 'QR ไม่ใช่รูปแบบของระบบนี้');
  return { token: body.token, ...(confirm ? { booking_id: integer(body.booking_id, 'รหัสการจอง') } : {}) };
}
function createPickup(pool, now = Date.now) {
  const bookings = createBookings(pool);
  async function details(connection, row) {
    const [booking] = await bookings.list(row.student_id, connection, row.booking_id);
    if (!booking) throw problem(404, 'ไม่พบการจอง');
    return booking;
  }
  return {
    async lookup(body) {
      const { token } = pickupInput(body);
      const [[row]] = await pool.execute('SELECT booking_id,student_id FROM bookings WHERE qr_code=?', [token]);
      if (!row) throw problem(404, 'ไม่พบการจองสำหรับ QR นี้');
      return details(pool, row);
    },
    async confirm(body) {
      const { token, booking_id } = pickupInput(body, true);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [[row]] = await connection.execute('SELECT booking_id,student_id,booking_status,received_at FROM bookings WHERE booking_id=? AND qr_code=? FOR UPDATE', [booking_id, token]);
        if (!row) throw problem(404, 'QR ไม่ตรงกับการจองที่แสดง กรุณาสแกนใหม่');
        if (row.booking_status === 'RECEIVED' || row.received_at !== null) throw problem(409, 'รายการนี้รับหนังสือแล้ว');
        if (!['WAITING','CHECKED_IN'].includes(row.booking_status)) throw problem(409, 'สถานะนี้ไม่สามารถยืนยันรับหนังสือได้');
        await connection.execute("UPDATE bookings SET booking_status='RECEIVED',received_at=? WHERE booking_id=?", [bangkokNow(now()), booking_id]);
        const booking = await details(connection, row);
        await connection.commit();
        return booking;
      } catch (error) {
        await connection.rollback();
        if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw problem(409, 'มีการยืนยันพร้อมกัน กรุณาสแกนใหม่เพื่อตรวจสถานะ');
        throw error;
      } finally { connection.release(); }
    }
  };
}
module.exports = { createPickup, pickupInput };
