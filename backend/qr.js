const { randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const { problem } = require('./catalog');

// Opaque, versioned payload: no name, student code, queue or URL is encoded.
function newQrToken() { return 'BQ1:' + randomBytes(32).toString('hex').toUpperCase(); }
async function qrPng(token) {
  if (!/^BQ1:[A-F0-9]{64}$/.test(token)) throw problem(409, 'QR เดิมไม่ใช่รูปแบบที่รองรับ กรุณาติดต่อเจ้าหน้าที่');
  return QRCode.toBuffer(token, { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: 8, color: { dark: '#000000ff', light: '#ffffffff' } });
}
function createBookingQr(pool) {
  return {
    async image(studentId, bookingId) {
      async function owned() {
        const [[row]] = await pool.execute('SELECT qr_code,booking_status FROM bookings WHERE booking_id=? AND student_id=?', [bookingId, studentId]);
        if (!row) throw problem(404, 'ไม่พบการจองของคุณ');
        if (!['WAITING', 'CHECKED_IN'].includes(row.booking_status)) throw problem(409, 'รายการนี้ไม่อยู่ในสถานะที่แสดง QR สำหรับรับหนังสือได้');
        return row;
      }
      let row = await owned();
      if (row.qr_code === null) {
        // Upgrade an owned Phase 6 booking on first display; concurrent requests keep one token.
        await pool.execute("UPDATE bookings SET qr_code=? WHERE booking_id=? AND student_id=? AND qr_code IS NULL AND booking_status IN ('WAITING','CHECKED_IN')", [newQrToken(), bookingId, studentId]);
        row = await owned();
      }
      return qrPng(row.qr_code);
    }
  };
}
module.exports = { newQrToken, qrPng, createBookingQr };
