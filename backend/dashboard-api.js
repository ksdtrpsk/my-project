const { json } = require('./auth');
const { problem } = require('./catalog');
function createDashboardApi({ dashboard, admins, sessions, adminSessions }) {
  return async (req,res,pathname) => {
    const session = adminSessions.read(req);
    if (!session) throw problem(sessions.read(req) ? 403 : 401,'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ');
    if (!await admins.findProfile(session.studentId)) { adminSessions.destroy(req,res); throw problem(401,'กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่'); }
    if (req.method !== 'GET') { res.setHeader('Allow','GET'); throw problem(405,'Method ไม่ถูกต้อง'); }
    const params = new URL(req.url,'http://localhost').searchParams;
    if (pathname === '/api/admin/dashboard') return json(res,200,await dashboard.summary(params));
    if (pathname === '/api/admin/bookings') return json(res,200,await dashboard.list(params));
    const match = /^\/api\/admin\/bookings\/(\d+)$/.exec(pathname);
    if (!match) throw problem(404,'ไม่พบ API');
    if (params.size) throw problem(400,'ไม่รับ query parameter');
    return json(res,200,{booking:await dashboard.detail(Number(match[1]))});
  };
}
module.exports = { createDashboardApi };
