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
const { createDashboard } = require('../dashboard');
const { createReports } = require('../reports');
const { createAnnouncements } = require('../announcements');
const { randomUUID } = require('node:crypto');
const {createStudentDirectory}=require('../student-directory');
const {PNG}=require('pngjs');
const jsQR = require('jsqr');
const { createPickup } = require('../pickup');
const { migratePhase8 } = require('../scripts/migrate-phase8');
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

test('Phase 17 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase17_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, directory:createStudentDirectory(pool), announcements:createAnnouncements(pool,()=>Date.parse("2030-01-01T02:00:00Z")), reports:createReports(pool,()=>Date.parse('2030-01-01T02:00:00Z')), dashboard:createDashboard(pool,()=>Date.parse('2030-01-01T02:00:00Z')), pickup:createPickup(pool,()=>Date.parse('2030-01-01T02:00:00Z')), bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
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
    assert.ok(adminCookie&&studentCookie&&otherCookie,'All three HTTP logins succeed');
    async function adminPost(route,body){const r=await request('/api/admin/'+route,'POST',body,adminCookie);assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
    const itBook=(await adminPost('books',{book_code:'IT17',book_name:'เว็บไซต์สำหรับไอที'})).book;
    const acBook=(await adminPost('books',{book_code:'AC17',book_name:'บัญชีขั้นต้น'})).book;
    const itSet=(await adminPost('book-sets',{department_id:10,education_level_id:10,classroom_id:10,semester:1,academic_year:2574,book_ids:[itBook.book_id]})).book_set;
    const acSet=(await adminPost('book-sets',{department_id:20,education_level_id:10,classroom_id:20,semester:1,academic_year:2574,book_ids:[acBook.book_id]})).book_set;
    const slot=(await adminPost('booking-slots',{booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',max_students:1,status:'OPEN'})).slot;
    const spare=(await adminPost('booking-slots',{booking_date:'2031-09-15',start_time:'10:00',end_time:'10:30',max_students:1,status:'OPEN'})).slot;
    const get=(route,cookie=adminCookie)=>request(route,'GET',undefined,cookie);
    const book=(set,round,cookie)=>request('/api/student/bookings','POST',{book_set_id:set,slot_id:round},cookie);
    const availability=async id=>(await get('/api/student/booking-slots',otherCookie)).data.slots.find(s=>s.slot_id===id);
    let first,token,receivedAt;
    await t.test('Scenario 1: HTTP login → own books → booking → PNG decode → admin lookup → received',async()=>{
      const books=await get('/api/student/book-sets',studentCookie);assert.equal(books.status,200);assert.equal(books.data.book_sets[0].books[0].book_code,'IT17');
      const saved=await book(itSet.book_set_id,slot.slot_id,studentCookie);assert.equal(saved.status,201);first=saved.data.booking;assert.equal(first.booking_status,'WAITING');
      const pngResponse=await fetch(base+'/api/student/bookings/'+first.booking_id+'/qr',{headers:{Cookie:studentCookie}});assert.equal(pngResponse.status,200);
      const png=PNG.sync.read(Buffer.from(await pngResponse.arrayBuffer()));const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert.ok(decoded);token=decoded.data;assert.match(token,/^BQ1:[A-F0-9]{64}$/);
      const lookup=await request('/api/admin/pickup/lookup','POST',{token},adminCookie);assert.equal(lookup.status,200);assert.equal(lookup.data.booking.student_code,'900010');assert.equal(lookup.data.booking.booking_status,'WAITING');
      const receipt=await request('/api/admin/pickup/confirm','POST',{token,booking_id:first.booking_id},adminCookie);assert.equal(receipt.status,200);assert.equal(receipt.data.booking.booking_status,'RECEIVED');receivedAt=receipt.data.booking.received_at;assert.equal(receivedAt,'2030-01-01 09:00:00');
      const mine=await get('/api/student/bookings',studentCookie);assert.equal(mine.data.bookings[0].booking_status,'RECEIVED');
      const [[stored]]=await pool.execute('SELECT booking_status,received_at FROM bookings WHERE booking_id=?',[first.booking_id]);assert.equal(stored.booking_status,'RECEIVED');assert.ok(stored.received_at);
    });
    await t.test('Scenario 2: duplicate booking rejected even against a different available slot',async()=>{
      const duplicate=await book(itSet.book_set_id,spare.slot_id,studentCookie);assert.equal(duplicate.status,409);assert.match(duplicate.data.message,/จองชุดหนังสือนี้แล้ว/);assert.equal((await availability(spare.slot_id)).remaining,1);
      assert.equal((await get('/api/student/bookings',studentCookie)).data.bookings.length,1);
    });
    await t.test('Scenario 3: full slot rejects another eligible student without inserting a booking',async()=>{
      assert.equal((await availability(slot.slot_id)).availability,'FULL');
      const full=await book(acSet.book_set_id,slot.slot_id,otherCookie);assert.equal(full.status,409);assert.match(full.data.message,/คิวเต็ม/);
      assert.equal((await get('/api/student/bookings',otherCookie)).data.bookings.length,0);
    });
    await t.test('Scenario 4: cancellation returns exactly one seat and permits a new booking',async()=>{
      const saved=await book(acSet.book_set_id,spare.slot_id,otherCookie);assert.equal(saved.status,201);const row=saved.data.booking;
      assert.equal((await availability(spare.slot_id)).remaining,0);
      const cancelled=await request('/api/student/bookings/'+row.booking_id+'/cancel','POST',{},otherCookie);assert.equal(cancelled.status,200);assert.equal(cancelled.data.booking.booking_status,'CANCELLED');assert.equal((await availability(spare.slot_id)).remaining,1);
      assert.equal((await request('/api/student/bookings/'+row.booking_id+'/cancel','POST',{},otherCookie)).status,409);assert.equal((await availability(spare.slot_id)).remaining,1);
      const again=await book(acSet.book_set_id,spare.slot_id,otherCookie);assert.equal(again.status,201);assert.notEqual(again.data.booking.queue_number,row.queue_number);assert.equal((await availability(spare.slot_id)).remaining,0);
    });
    await t.test('Scenario 5: rescan received QR shows received state; repeated confirm preserves timestamp',async()=>{
      const scan=await request('/api/admin/pickup/lookup','POST',{token},adminCookie);assert.equal(scan.status,200);assert.equal(scan.data.booking.booking_status,'RECEIVED');
      const second=await request('/api/admin/pickup/confirm','POST',{token,booking_id:first.booking_id},adminCookie);assert.equal(second.status,409);assert.equal(second.data.message,'รายการนี้รับหนังสือแล้ว');
      assert.equal((await request('/api/admin/pickup/lookup','POST',{token},adminCookie)).data.booking.received_at,receivedAt);
    });
    await t.test('Scenario 6: students in different departments see different assigned sets only',async()=>{
      const it=(await get('/api/student/book-sets',studentCookie)).data.book_sets;const ac=(await get('/api/student/book-sets',otherCookie)).data.book_sets;
      assert.deepEqual(it.map(s=>s.book_set_id),[itSet.book_set_id]);assert.deepEqual(ac.map(s=>s.book_set_id),[acSet.book_set_id]);assert.equal(ac[0].books[0].book_code,'AC17');
      assert.equal((await book(acSet.book_set_id,spare.slot_id,studentCookie)).status,403);
    });
    await t.test('Post-flow Dashboard, Reports and CSV agree with saved history; logout removes access',async()=>{
      const totals=(await get('/api/admin/dashboard')).data.totals;assert.equal(totals.total,3);assert.equal(totals.received,1);assert.equal(totals.pending,1);assert.equal(totals.cancelled,1);
      const report=(await get('/api/admin/reports/bookings?report=received')).data;assert.equal(report.total,1);assert.equal(report.bookings[0].booking_id,first.booking_id);
      assert.match((await get('/api/admin/reports/bookings.csv?report=received')).data,/900010/);
      assert.equal((await request('/api/auth/logout','POST',{},studentCookie)).status,200);assert.equal((await get('/api/student/bookings',studentCookie)).status,401);
      assert.equal((await request('/api/admin/auth/logout','POST',{},adminCookie)).status,200);assert.equal((await get('/api/admin/dashboard')).status,401);
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase17_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
