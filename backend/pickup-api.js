const { requestOrigin } = require('./request-origin');
const { json, readJson } = require('./auth');
const { problem } = require('./catalog');
function createPickupApi({ pickup, admins, adminSessions, sessions }) {
  return async (req, res, pathname) => {
    const session = await adminSessions.read(req);
    if (!session) throw problem(await sessions.read(req) ? 403 : 401, 'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ');
    if (!await admins.findProfile(session.studentId)) { await adminSessions.destroy(req,res); throw problem(401, 'กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่'); }
    if (!['/api/admin/pickup/lookup','/api/admin/pickup/confirm'].includes(pathname)) throw problem(404, 'ไม่พบ API');
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); throw problem(405,'Method ไม่ถูกต้อง'); }
    if (new URL(req.url,'http://localhost').search) throw problem(400,'ไม่รับ query parameter');
    if ((req.headers.origin && req.headers.origin !== requestOrigin(req)) || req.headers['sec-fetch-site'] === 'cross-site') throw problem(403,'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
    const body = await readJson(req);
    const booking = pathname.endsWith('/confirm') ? await pickup.confirm(body) : await pickup.lookup(body);
    return json(res,200,{booking});
  };
}
module.exports = { createPickupApi };
