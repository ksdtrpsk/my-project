const { requestOrigin } = require('./request-origin');
const { json, readJson } = require('./auth');
const { integer, problem } = require('./catalog');
function createBookingsApi({ bookings, students, sessions, bookingQr }) {
  return async (req, res, pathname) => {
    const session = sessions.read(req);
    if (!session) throw problem(401, 'กรุณาเข้าสู่ระบบนักศึกษา');
    if (!await students.findProfile(session.studentId)) { sessions.destroy(req, res); throw problem(401, 'กรุณาเข้าสู่ระบบใหม่'); }
    if (new URL(req.url, 'http://localhost').search) throw problem(400, 'ไม่รับตัวกรองหรือรหัสนักศึกษาจากคำขอ');
    const cancelMatch = /^\/api\/student\/bookings\/(\d+)\/cancel$/.exec(pathname);
    if (cancelMatch) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw problem(405, 'Method ไม่ถูกต้อง'); }
      if ((req.headers.origin && req.headers.origin !== requestOrigin(req)) || req.headers['sec-fetch-site'] === 'cross-site') throw problem(403, 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
      const body = await readJson(req);
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) throw problem(400, 'ส่ง JSON ว่างเท่านั้น');
      return json(res, 200, { booking: await bookings.cancel(session.studentId, integer(Number(cancelMatch[1]), 'รหัสการจอง')) });
    }
    const qrMatch = /^\/api\/student\/bookings\/(\d+)\/qr$/.exec(pathname);
    if (qrMatch) {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); throw problem(405, 'Method ไม่ถูกต้อง'); }
      const id = integer(Number(qrMatch[1]), 'รหัสการจอง');
      if (!bookingQr) throw problem(503, 'ระบบ QR ยังไม่พร้อมใช้งาน');
      const png = await bookingQr.image(session.studentId, id);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store, private', 'Cross-Origin-Resource-Policy': 'same-origin' });
      return res.end(png);
    }
    if (pathname !== '/api/student/bookings') throw problem(404, 'ไม่พบ API');
    if (req.method === 'GET') return json(res, 200, { bookings: await bookings.list(session.studentId) });
    if (req.method === 'POST') {
      if ((req.headers.origin && req.headers.origin !== requestOrigin(req)) || req.headers['sec-fetch-site'] === 'cross-site') throw problem(403, 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
      return json(res, 201, { booking: await bookings.create(session.studentId, await readJson(req)) });
    }
    res.setHeader('Allow', 'GET, POST');
    throw problem(405, 'Method ไม่ถูกต้อง');
  };
}
module.exports = { createBookingsApi };
