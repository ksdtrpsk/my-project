const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { readConfig } = require('../config');
const { createDatabase, createStudentRepository } = require('../students');
const { createAdminRepository } = require('../admin');
const { createSlots } = require('../slots');
const { createBookings } = require('../bookings');
const { createBookingQr } = require('../qr');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { createCatalog } = require('../catalog');
const { createServer } = require('../server');
const { hashPassword } = require('../passwords');

// Supports the mysql CLI DELIMITER syntax without enabling multipleStatements.
async function runSqlFile(pool, source) {
  let delimiter = ';', buffer = '';
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*--/.test(line)) continue;
    const change = /^DELIMITER (.+)$/.exec(line.trim());
    if (change) { delimiter = change[1]; continue; }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length).trim();
      if (statement) await pool.query(statement);
      buffer = '';
    }
  }
  assert.equal(buffer.trim(), '', 'Unterminated SQL statement');
}

test('Phase 7 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase7_test_' + randomBytes(8).toString('hex');
  const management = createDatabase(config.database);
  let pool, server, created = false;
  try {
    await management.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    pool = createDatabase({ ...config.database, database: databaseName });
    const connection = await pool.getConnection();
    try {
      const sqlRoot = path.resolve(__dirname, '../../database');
      await runSqlFile(connection, await fs.readFile(path.join(sqlRoot, 'schema.sql'), 'utf8'));
      await t.test('Original Phase 2 SQL constraints pass on the real engine', async () => {
        const suite = (await fs.readFile(path.join(sqlRoot, 'tests.sql'), 'utf8')).replaceAll('college_book_queue_phase2_test', databaseName);
        await runSqlFile(connection, suite);
      });
    } finally { connection.release(); }
    const password = 'Test-' + randomBytes(16).toString('hex');
    const hash = await hashPassword(password);
    await pool.query("INSERT INTO departments (department_id,department_name) VALUES (10,'ไอทีทดสอบ'),(20,'บัญชีทดสอบ')");
    await pool.query("INSERT INTO education_levels (education_level_id,education_level_name) VALUES (10,'ปวส.1'),(20,'ปวส.2')");
    await pool.query("INSERT INTO classrooms (classroom_id,department_id,education_level_id,classroom_name) VALUES (10,10,10,'1/1'),(20,20,10,'1/1'),(30,10,10,'1/2'),(40,10,20,'2/1')");
    for (const [id, department, level, classroom] of [[10,10,10,10],[20,20,10,20],[30,10,10,30],[40,10,20,40]]) {
      await pool.execute('INSERT INTO students (student_id,student_code,password,first_name,last_name,department_id,education_level_id,classroom_id) VALUES (?,?,?,?,?,?,?,?)', [id, '9000' + id, hash, 'นักศึกษาทดสอบ', String(id), department, level, classroom]);
    }
    await pool.execute('INSERT INTO admins (admin_id,username,password,name) VALUES (?,?,?,?)', [10,'testadmin',hash,'เจ้าหน้าที่ทดสอบ']);
    const catalog = createCatalog(pool);
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    const adminCookie=(await request('/api/admin/auth/login','POST',{username:'testadmin',password})).cookie;
    const studentCookie=(await request('/api/auth/login','POST',{student_code:'900010',password})).cookie;
    const otherCookie=(await request('/api/auth/login','POST',{student_code:'900020',password})).cookie;
    const clock=()=>Date.parse('2030-01-01T02:00:00Z');
    const book=await catalog.createBook({book_code:'QR01',book_name:'หนังสือทดสอบ QR'});
    const sets={};
    for(const [id,department] of [[10,10],[20,20]]) sets[id]=(await catalog.saveSet(null,{department_id:department,education_level_id:10,classroom_id:id,semester:1,academic_year:2574,book_ids:[book.book_id]})).book_set_id;
    const slot=await createSlots(pool,clock).save(null,{booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',max_students:20,status:'OPEN'});
    let bookingId,token;
    async function stored(){const [[row]]=await pool.execute('SELECT qr_code,booking_status,created_at FROM bookings WHERE booking_id=?',[bookingId]);return row;}
    async function image(id=bookingId,cookie=studentCookie,method='GET',suffix=''){
      const response=await fetch(base+'/api/student/bookings/'+id+'/qr'+suffix,{method,headers:{Cookie:cookie}});
      return {status:response.status,headers:response.headers,bytes:Buffer.from(await response.arrayBuffer())};
    }
    function decode(bytes){const png=PNG.sync.read(bytes);const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert.ok(decoded);return decoded.data;}
    await t.test('Booking creates unique persisted token without returning it in receipt JSON',async()=>{
      const first=await request('/api/student/bookings','POST',{book_set_id:sets[10],slot_id:slot.slot_id},studentCookie);
      assert.equal(first.status,201);bookingId=first.data.booking.booking_id;
      token=(await stored()).qr_code;assert.match(token,/^BQ1:[A-F0-9]{64}$/);
      assert.equal(JSON.stringify(first.data).includes(token),false);
      const second=await request('/api/student/bookings','POST',{book_set_id:sets[20],slot_id:slot.slot_id},otherCookie);
      assert.equal(second.status,201);
      const [[row]]=await pool.execute('SELECT qr_code FROM bookings WHERE booking_id=?',[second.data.booking.booking_id]);
      assert.notEqual(row.qr_code,token);
    });
    await t.test('Owned QR PNG decodes to stored token only and disables image caching',async()=>{
      const response=await image();
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
      assert.match(response.headers.get('cache-control'),/no-store/);
      assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
      assert.equal(decode(response.bytes),token);
      assert.equal((await stored()).booking_status,'WAITING');
      const own=await request('/api/student/bookings','GET',undefined,studentCookie);
      assert.equal(JSON.stringify(own.data).includes(token),false);
    });
    await t.test('QR route rejects anonymous, admin, other owner, bad IDs, methods and query tampering',async()=>{
      assert.equal((await image(bookingId,'')).status,401);
      assert.equal((await image(bookingId,adminCookie)).status,401);
      assert.equal((await image(bookingId,otherCookie)).status,404);
      assert.equal((await image(999999)).status,404);
      assert.equal((await image(0)).status,400);
      assert.equal((await image(bookingId,studentCookie,'POST')).status,405);
      assert.equal((await image(bookingId,studentCookie,'GET','?student_id=10')).status,400);
      assert.equal((await request('/api/student/bookings/unknown/qr','GET',undefined,studentCookie)).status,404);
    });
    await t.test('Repeated PNG requests and a new repository instance preserve the same token',async()=>{
      const values=await Promise.all([image(),image(),image()]);
      assert.ok(values.every(value=>value.status===200&&decode(value.bytes)===token));
      assert.equal(decode(await createBookingQr(pool).image(10,bookingId)),token);
      assert.equal((await stored()).qr_code,token);
    });
    await t.test('Existing Phase 6 NULL token upgrades once under concurrent first requests',async()=>{
      await pool.execute('UPDATE bookings SET qr_code=NULL WHERE booking_id=?',[bookingId]);
      const before=await stored();
      const values=await Promise.all([image(),image(),image()]);
      const current=(await stored()).qr_code;
      assert.match(current,/^BQ1:[A-F0-9]{64}$/);
      assert.ok(values.every(value=>value.status===200&&decode(value.bytes)===current));
      assert.equal((await stored()).created_at.getTime(),before.created_at.getTime());
      const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM bookings WHERE slot_id=?',[slot.slot_id]);
      assert.equal(Number(count.total),2);
      token=current;
    });
    await t.test('Only WAITING/CHECKED_IN display QR; unsupported old data is not encoded or rotated',async()=>{
      for(const status of ['CANCELLED','RECEIVED','NO_SHOW']){
        await pool.execute('UPDATE bookings SET booking_status=? WHERE booking_id=?',[status,bookingId]);
        assert.equal((await image()).status,409);assert.equal((await stored()).qr_code,token);
      }
      await pool.execute("UPDATE bookings SET booking_status='CHECKED_IN' WHERE booking_id=?",[bookingId]);
      assert.equal(decode((await image()).bytes),token);
      await pool.execute("UPDATE bookings SET qr_code='student:900010' WHERE booking_id=?",[bookingId]);
      assert.equal((await image()).status,409);assert.equal((await stored()).qr_code,'student:900010');
      await pool.execute('UPDATE bookings SET qr_code=? WHERE booking_id=?',[token,bookingId]);
    });
    await t.test('Logout removes access to a previously displayed QR',async()=>{
      assert.equal((await request('/api/auth/logout','POST',{},studentCookie)).status,200);
      assert.equal((await image()).status,401);
    });

  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase7_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
