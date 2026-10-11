const { allowedHost, requestOrigin } = require('./request-origin');
// Retains Phase 1 static serving and adds Phase 3 student authentication.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../frontend');
const { createAuth, json } = require('./auth');
const { createSessions } = require('./sessions');
const { readConfig } = require('./config');
const { createDatabase, createStudentRepository } = require('./students');
const { createAdminRepository } = require('./admin');
const { createCatalog } = require('./catalog');
const { createCatalogApi } = require('./catalog-api');
const { createSlots } = require('./slots');
const { createSlotsApi } = require('./slots-api');
const { createBookings } = require('./bookings');
const { createBookingsApi } = require('./bookings-api');
const { createBookingQr } = require('./qr');
const { createPickup } = require('./pickup');
const { createPickupApi } = require('./pickup-api');
const { createDashboard } = require('./dashboard');
const { createDashboardApi } = require('./dashboard-api');
const { createReports } = require('./reports');
const { createReportsApi } = require('./reports-api');
const { createAnnouncements } = require('./announcements');
const { createAnnouncementsApi } = require('./announcements-api');
const {createStudentDirectory,createStudentDirectoryApi}=require('./student-directory');
const {publicError}=require('./errors');
const {createPasswordManagement,createPasswordManagementApi}=require('./password-management');
const staticFiles=new Set(["/change-password.html","/admin-password.html","/admin-students.html","/admin-bookings.html","/assets/students-ui.js","/admin-announcements.html","/admin-book-sets.html","/admin-books.html","/admin-login.html","/admin-reports.html","/admin-scanner.html","/admin-slots.html","/booking-slots.html","/books.html","/dashboard.html","/home.html","/index.html","/my-booking.html","/profile.html","/assets/announcements-ui.js","/assets/app.js","/assets/booking-ui.js","/assets/catalog-ui.js","/assets/dashboard-ui.js","/assets/reports-ui.js","/assets/scanner-ui.js","/assets/slots-ui.js","/assets/styles.css","/assets/jsqr.js"]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function createServer({ students, sessions = createSessions(), admins, catalog, slots, bookings, bookingQr, pickup, dashboard, reports, announcements, directory, passwordManagement,
  adminSessions = createSessions({ cookieName: 'book_queue_admin_session' }) }) {
const handlePasswords=passwordManagement?createPasswordManagementApi({passwordManagement,students,admins,sessions,adminSessions}):null;
const handleAuth = createAuth({ students, sessions });
const handleAdminAuth = admins ? createAuth({ students: admins, sessions: adminSessions, adminMode: true }) : null;
const handleCatalog = catalog ? createCatalogApi({ catalog, students, admins, sessions, adminSessions }) : null;
const handleSlots = slots ? createSlotsApi({ slots, students, admins, sessions, adminSessions }) : null;
const handleBookings = bookings ? createBookingsApi({ bookings, students, sessions, bookingQr }) : null;
const handlePickup = pickup ? createPickupApi({ pickup, admins, adminSessions, sessions }) : null;
const handleDashboard = dashboard ? createDashboardApi({ dashboard, admins, sessions, adminSessions }) : null;
const handleReports = reports ? createReportsApi({reports,admins,adminSessions,sessions}) : null;
const handleAnnouncements = announcements ? createAnnouncementsApi({announcements, students, admins, sessions, adminSessions}) : null;
const handleDirectory=directory?createStudentDirectoryApi({directory,admins,sessions,adminSessions}):null;
const protectedPages = new Set(['/change-password.html', '/home.html', '/profile.html', '/books.html', '/my-booking.html', '/booking-slots.html']);
return http.createServer({requestTimeout:30000,headersTimeout:15000,keepAliveTimeout:5000},async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, requestOrigin(req)).pathname); }
  catch { return json(res, 400, { message: 'URL ไม่ถูกต้อง' }); }
  if (!allowedHost(req.headers.host)) {
    return json(res, 403, { message: 'ไม่อนุญาตโดเมนนี้' });
  }
  if (pathname.startsWith('/api/')) {
    try {
      if(pathname.startsWith('/api/student/')){
        const current=sessions.read(req);
        if(current&&(await students.findProfile(current.studentId))?.must_change_password)return json(res,403,{message:'กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนใช้งาน',code:'PASSWORD_CHANGE_REQUIRED'});
      }
      if(handlePasswords&&(pathname==='/api/auth/password'||pathname==='/api/admin/auth/password'||/^\/api\/admin\/students\/\d+\/password$/.test(pathname)))return await handlePasswords(req,res,pathname);
      if((pathname==='/api/admin/students'||pathname.startsWith('/api/admin/students/'))&&handleDirectory)return await handleDirectory(req,res);
      if (pathname.startsWith('/api/admin/auth/') && handleAdminAuth) return await handleAdminAuth(req, res, pathname.replace('/api/admin/auth/', '/api/auth/'));
      if ((pathname === '/api/admin/dashboard' || pathname === '/api/admin/bookings' || pathname.startsWith('/api/admin/bookings/')) && handleDashboard) return await handleDashboard(req,res,pathname);
      if (pathname.startsWith('/api/admin/reports/') && handleReports) return await handleReports(req,res,pathname);
      if ((pathname.startsWith('/api/admin/announcements') || pathname === '/api/student/announcements/latest') && handleAnnouncements) return await handleAnnouncements(req,res,pathname);
      if (pathname.startsWith('/api/admin/pickup/') && handlePickup) return await handlePickup(req,res,pathname);
      if ((pathname === '/api/student/bookings' || pathname.startsWith('/api/student/bookings/')) && handleBookings) return await handleBookings(req, res, pathname);
      if ((pathname === '/api/student/booking-slots' || pathname === '/api/admin/booking-slots' || pathname.startsWith('/api/admin/booking-slots/')) && handleSlots) return await handleSlots(req, res, pathname);
      if ((pathname.startsWith('/api/admin/') || pathname === '/api/student/book-sets') && handleCatalog) return await handleCatalog(req, res, pathname);
      return await handleAuth(req, res, pathname);
    }
    catch (error) {
      // Do not expose SQL, passwords, or database connection details to the browser.
      const result=publicError(error);
      if(result.status===413 || !req.complete){res.shouldKeepAlive=false;res.setHeader('Connection','close');}
      return json(res,result.status,{message:result.message});
    }
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  try {
    // Exact approved filenames reject Windows trailing-dot, ADS and backup-file aliases.
    const requested=(pathname==='/'?'/index.html':pathname).toLowerCase();
    if(!staticFiles.has(requested)){res.writeHead(404);return res.end('ไม่พบหน้าที่ต้องการ');}
    const file = path.resolve(root, '.' + requested);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const normalized = ('/' + relative.split(path.sep).join('/')).toLowerCase();
    const adminPage=normalized==='/dashboard.html'||(normalized.startsWith('/admin-')&&normalized!=='/admin-login.html');
    if(adminPage||protectedPages.has(normalized)){
      const store=adminPage?adminSessions:sessions;
      const session=store.read(req);
      const repository=adminPage?admins:students;
      let account=null;
      try{if(session&&repository)account=await repository.findProfile(session.studentId);}
      catch{return json(res,503,{message:'ติดต่อระบบไม่ได้ กรุณาลองใหม่ภายหลัง'});}
      if(!account){
        if(session)store.destroy(req,res);
        res.writeHead(302,{Location:adminPage?'/admin-login.html':'/index.html'});return res.end();
      }
    }
    const content = await fs.readFile(normalized === '/assets/jsqr.js' ? require.resolve('jsqr') : file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    const status = error instanceof URIError ? 400 : ['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : 500;
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 404 ? 'ไม่พบหน้าที่ต้องการ' : 'ไม่สามารถเปิดหน้านี้ได้');
  }
});
}

async function start() {
  const config = readConfig();
  const pool = createDatabase(config.database);
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION time_zone = '+07:00'");
      // Verify the Phase 2 tables needed by login before opening the server.
      await createStudentRepository(connection).findProfile(0);
      await connection.query('SELECT received_at FROM bookings LIMIT 0');
    } finally { connection.release(); }
  } catch (error) {
    await pool.end();
    if(error.code==='ER_BAD_FIELD_ERROR'&&String(error.sqlMessage).includes('must_change_password'))throw new Error('ฐานข้อมูลยังไม่อัปเดต: รัน npm run migrate:student-password แล้วเริ่ม server ใหม่');
    if (error.code === 'ER_BAD_FIELD_ERROR') throw new Error('ฐานข้อมูลยังไม่พร้อมสำหรับ Phase 8: รัน npm run migrate:phase8 แล้วเริ่ม server ใหม่');
    throw new Error('เชื่อม MySQL ไม่สำเร็จ (หากยังไม่ได้อัปเดต ให้รัน npm run migrate:student-password): ตรวจ .env และ import database/schema.sql จาก Phase 2 ก่อน');
  }
  try { await pool.query('SELECT announcement_id,title,content,created_at FROM announcements LIMIT 0'); }
  catch { await pool.end(); throw new Error('ฐานข้อมูลประกาศยังไม่พร้อม: รัน npm run migrate:phase14 แล้วเริ่ม server ใหม่'); }
  const server = createServer({ students: createStudentRepository(pool), sessions: createSessions({ ttlMs: config.sessionMs }),
    admins: createAdminRepository(pool), catalog: createCatalog(pool), slots: createSlots(pool), bookings: createBookings(pool), bookingQr: createBookingQr(pool), pickup: createPickup(pool), dashboard: createDashboard(pool), reports: createReports(pool), announcements: createAnnouncements(pool), directory:createStudentDirectory(pool), passwordManagement:createPasswordManagement(pool),
    adminSessions: createSessions({ ttlMs: config.sessionMs, cookieName: 'book_queue_admin_session' }) });
  server.on('error', async (error) => {
    console.error('เปิดเซิร์ฟเวอร์ไม่ได้:', error.code);
    await pool.end();
    process.exitCode = 1;
  });
  server.listen(config.port, process.env.VERCEL === '1' ? '0.0.0.0' : '127.0.0.1', () => console.log(`Server listening on port ${config.port}`));
  function shutdown() { server.close(() => pool.end()); server.closeIdleConnections(); }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createServer, start };
