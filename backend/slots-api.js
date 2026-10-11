const { requestOrigin } = require('./request-origin');
const { json, readJson } = require('./auth');
const {objectInput,queryInput}=require('./validation');
const { integer, problem } = require('./catalog');
function createSlotsApi({ slots, students, admins, sessions, adminSessions }) {
  return async (req, res, pathname) => {
    const studentRoute = pathname === '/api/student/booking-slots';
    const store = studentRoute ? sessions : adminSessions;
    const session = store.read(req);
    if (!session) throw problem(!studentRoute && sessions.read(req) ? 403 : 401, 'กรุณาเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์');
    if (!await (studentRoute ? students : admins).findProfile(session.studentId)) {
      store.destroy(req, res); throw problem(401, 'กรุณาเข้าสู่ระบบใหม่');
    }
    const url = new URL(req.url, 'http://localhost');
    if ([...url.searchParams.keys()].some(key => key !== 'date') || url.searchParams.getAll('date').length > 1) throw problem(400, 'รับเฉพาะตัวกรอง date หนึ่งค่า');
    if (!['GET', 'HEAD'].includes(req.method) && ((req.headers.origin && req.headers.origin !== requestOrigin(req)) || req.headers['sec-fetch-site'] === 'cross-site')) throw problem(403, 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
    const match = /^\/api\/admin\/booking-slots(?:\/(\d+)(\/status)?)?$/.exec(pathname);
    if (!studentRoute && !match) throw problem(404, 'ไม่พบ API');
    if(req.method!=='GET')queryInput(url.searchParams);
    const id = match?.[1] ? integer(Number(match[1]), 'รหัสรอบ') : null;
    const statusRoute = Boolean(match?.[2]);
    if (req.method === 'GET' && id === null) return json(res, 200, { slots: await slots.list({ student: studentRoute, date: url.searchParams.get('date') ?? undefined }) });
    if (!studentRoute) {
      if (req.method === 'POST' && id === null) return json(res, 201, { slot: await slots.save(null, await readJson(req)) });
      if (req.method === 'PUT' && id !== null && !statusRoute) return json(res, 200, { slot: await slots.save(id, await readJson(req)) });
      if (req.method === 'PATCH' && statusRoute) return json(res, 200, { slot: await slots.setStatus(id, await readJson(req)) });
      if (req.method === 'DELETE' && id !== null && !statusRoute) { objectInput(await readJson(req),[]); await slots.remove(id); return json(res, 200, { message: 'ลบรอบแล้ว' }); }
    }
    res.setHeader('Allow', studentRoute ? 'GET' : statusRoute ? 'PATCH' : id === null ? 'GET, POST' : 'PUT, DELETE');
    throw problem(405, 'Method ไม่ถูกต้อง');
  };
}
module.exports = { createSlotsApi };
