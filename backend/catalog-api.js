const { requestOrigin } = require('./request-origin');
const { json, readJson } = require('./auth');
const {objectInput,queryInput}=require('./validation');
const { integer, problem } = require('./catalog');
function createCatalogApi({ catalog, students, admins, sessions, adminSessions }) {
  return async (req, res, pathname) => {
    const url = new URL(req.url, 'http://localhost');
    if (pathname === '/api/student/book-sets') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { message: 'Method ไม่ถูกต้อง' }); }
      const session = await sessions.read(req);
      if (!session) throw problem(401, 'กรุณาเข้าสู่ระบบนักศึกษา');
      if (!await students.findProfile(session.studentId)) { await sessions.destroy(req, res); throw problem(401, 'กรุณาเข้าสู่ระบบใหม่'); }
      if (url.search) throw problem(400, 'ระบบเลือกชุดหนังสือจากบัญชี ไม่รับค่ากลุ่มหรือรหัสนักศึกษาจากคำขอ');
      return json(res, 200, { book_sets: await catalog.listSets(session.studentId) });
    }
    const session = await adminSessions.read(req);
    if (!session) throw problem(await sessions.read(req) ? 403 : 401, 'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบเท่านั้น');
    if (!await admins.findProfile(session.studentId)) { await adminSessions.destroy(req, res); throw problem(401, 'กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่'); }
    if (!['GET', 'HEAD'].includes(req.method)) {
      if ((req.headers.origin && req.headers.origin !== requestOrigin(req)) || req.headers['sec-fetch-site'] === 'cross-site') throw problem(403, 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
    }
    queryInput(url.searchParams,pathname==='/api/admin/books' && req.method==='GET'?['q']:[]);
    if (pathname === '/api/admin/lookups' && req.method === 'GET') return json(res, 200, await catalog.lookups());
    const match = /^\/api\/admin\/(books|book-sets)(?:\/(\d+))?$/.exec(pathname);
    if (!match) throw problem(404, 'ไม่พบ API');
    const isBook = match[1] === 'books';
    const id = match[2] ? integer(Number(match[2]), 'รหัสรายการ') : null;
    if (req.method === 'GET' && id === null) return json(res, 200, isBook ? { books: await catalog.listBooks(url.searchParams.get('q') || '') } : { book_sets: await catalog.listSets() });
    if ((req.method === 'POST' && id === null) || (req.method === 'PUT' && id !== null)) {
      const body = await readJson(req, 32768);
      const result = isBook ? (id === null ? await catalog.createBook(body) : await catalog.updateBook(id, body)) : await catalog.saveSet(id, body);
      return json(res, id === null ? 201 : 200, isBook ? { book: result } : { book_set: result });
    }
    if (req.method === 'DELETE' && id !== null) {
      objectInput(await readJson(req),[]);
      if (isBook) await catalog.deleteBook(id); else await catalog.deleteSet(id);
      return json(res, 200, { message: 'ลบข้อมูลแล้ว' });
    }
    res.setHeader('Allow', id === null ? 'GET, POST' : 'PUT, DELETE');
    throw problem(405, 'Method ไม่ถูกต้อง');
  };
}
module.exports = { createCatalogApi };
