const { requestOrigin } = require('./request-origin');
const { verifyPassword } = require('./passwords');
const {problem}=require('./errors');
const {objectInput}=require('./validation');

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req, limit = 4096) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw problem(415,'กรุณาส่งข้อมูลแบบ JSON');
  if(Number(req.headers['content-length'])>limit)throw problem(413,'ข้อมูลมีขนาดใหญ่เกินไป');
  let size=0;const chunks=[];
  // Do not wait for an oversized chunked upload to finish or destroy the socket before replying.
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    size+=chunk.length;
    if(size>limit)throw problem(413,'ข้อมูลมีขนาดใหญ่เกินไป');
    chunks.push(chunk);
  }
  let body;
  try {body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  catch {throw problem(400,'รูปแบบ JSON หรือ UTF-8 ไม่ถูกต้อง');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw problem(400,'ส่งข้อมูลเป็น JSON object เท่านั้น');
  return body;
}

function createAuth({ students, sessions, now = Date.now, adminMode = false }) {
  const attempts = new Map();
  return async function handleAuth(req, res, pathname) {
    const routes = { '/api/auth/login': 'POST', '/api/auth/me': 'GET', '/api/auth/logout': 'POST' };
    if (!routes[pathname]) return json(res, 404, { message: 'ไม่พบ API ที่ต้องการ' });
    if (req.method !== routes[pathname]) {
      res.setHeader('Allow', routes[pathname]);
      return json(res, 405, { message: 'Method ไม่ถูกต้อง' });
    }
    // No CORS. Browser mutations must be same-origin and JSON (no form-based login CSRF).
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== requestOrigin(req)) {
        return json(res, 403, { message: 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น' });
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { message: 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น' });
    }
    if (pathname === '/api/auth/logout') {
      objectInput(await readJson(req),[]);
      await sessions.destroy(req, res);
      return json(res, 200, { message: 'ออกจากระบบแล้ว' });
    }
    if (pathname === '/api/auth/me') {
      const session = await sessions.read(req);
      if (!session) return json(res, 401, { message: 'กรุณาเข้าสู่ระบบใหม่' });
      const student = await students.findProfile(session.studentId);
      if (!student) {
        await sessions.destroy(req, res);
        return json(res, 401, { message: 'กรุณาเข้าสู่ระบบใหม่' });
      }
      return json(res, 200, adminMode ? { admin: student } : { student });
    }
    const body = await readJson(req);
    objectInput(body,adminMode?['username','password']:['student_code','password']);
    const loginName = adminMode ? body?.username : body?.student_code;
    const loginPattern = adminMode ? /^[A-Za-z0-9_.-]{1,50}$/ : /^\d{1,20}$/;
    if (!body || typeof loginName !== 'string' || !loginPattern.test(loginName)
      || typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 128) {
      return json(res, 400, { message: adminMode ? 'กรอกชื่อผู้ใช้ภาษาอังกฤษ ตัวเลข หรือ _ . - ไม่เกิน 50 ตัว และรหัสผ่านไม่เกิน 128 ตัว' : 'กรุณากรอกรหัสนักศึกษาเป็นตัวเลขไม่เกิน 20 หลัก และรหัสผ่านไม่เกิน 128 ตัวอักษร' });
    }
    // Reserve an attempt without an await between reading and updating the bucket.
    for (const [key, value] of attempts) if (value.expiresAt <= now()) attempts.delete(key);
    const key = req.socket.remoteAddress;
    const count = attempts.get(key) || { count: 0, expiresAt: now() + 15 * 60 * 1000 };
    if (count.count >= 10) {
      res.setHeader('Retry-After', Math.ceil((count.expiresAt - now()) / 1000));
      return json(res, 429, { message: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอแล้วลองใหม่' });
    }
    count.count += 1;
    attempts.set(key, count);
    const revision = await sessions.revision?.();
    const account = await students.findCredentials(loginName);
    if (!await verifyPassword(body.password, account?.password)) {
      return json(res, 401, { message: adminMode ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : 'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง' });
    }
    const accountId = adminMode ? account.admin_id : account.student_id;
    const student = await students.findProfile(accountId);
    if (!student) return json(res, 401, { message: 'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง' });
    // Do not issue a session from credentials verified before a password change.
    if (await sessions.revision?.() !== revision) return json(res, 409, { message: 'มีการเปลี่ยนรหัสผ่านระหว่างเข้าสู่ระบบ กรุณาลองใหม่' });
    await sessions.create(req, res, accountId, account.password);
    attempts.delete(key);
    return json(res, 200, adminMode ? { admin: student } : { student });
  };
}
module.exports = { createAuth, json, readJson };
