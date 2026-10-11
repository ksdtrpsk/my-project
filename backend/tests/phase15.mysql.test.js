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

test('Phase 15 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase15_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, announcements:createAnnouncements(pool,()=>Date.parse("2030-01-01T02:00:00Z")), reports:createReports(pool,()=>Date.parse('2030-01-01T02:00:00Z')), dashboard:createDashboard(pool,()=>Date.parse('2030-01-01T02:00:00Z')), pickup:createPickup(pool,()=>Date.parse('2030-01-01T02:00:00Z')), bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    const adminCookie=(await request('/api/admin/auth/login','POST',{username:'testadmin',password})).cookie;
    const studentCookie=(await request('/api/auth/login','POST',{student_code:'900010',password})).cookie;


    const get=route=>request(route,'GET',undefined,adminCookie);
    await t.test('Every authenticated API family enforces role boundaries',async()=>{
      const adminRoutes=[['/api/admin/auth/me','GET'],['/api/admin/lookups','GET'],['/api/admin/books','GET'],['/api/admin/book-sets','GET'],['/api/admin/booking-slots','GET'],['/api/admin/dashboard','GET'],['/api/admin/bookings','GET'],['/api/admin/bookings/1','GET'],['/api/admin/reports/bookings','GET'],['/api/admin/reports/bookings.csv','GET'],['/api/admin/announcements','GET'],['/api/admin/pickup/lookup','POST'],['/api/admin/pickup/confirm','POST']];
      for(const [route,method]of adminRoutes){
        assert.equal((await request(route,method,method==='POST'?{}:undefined)).status,401,route);
        assert.ok([401,403].includes((await request(route,method,method==='POST'?{}:undefined,studentCookie)).status),route);
      }
      for(const route of ['/api/auth/me','/api/student/book-sets','/api/student/booking-slots','/api/student/bookings','/api/student/bookings/1/qr','/api/student/announcements/latest']){
        assert.equal((await request(route)).status,401,route);
        assert.equal((await request(route,'GET',undefined,adminCookie)).status,401,route);
      }
    });
    await t.test('Catalog query pollution, unknown body fields and non-empty DELETE never mutate rows',async()=>{
      for(const route of ['/api/admin/books?q=a&q=b','/api/admin/books?student_id=10','/api/admin/lookups?q=x','/api/admin/book-sets?q=x'])assert.equal((await get(route)).status,400,route);
      const book=(await request('/api/admin/books','POST',{book_code:'VALID15',book_name:'หนังสือเดิม'},adminCookie)).data.book;
      assert.equal((await request('/api/admin/books/'+book.book_id,'PUT',{book_code:'CHANGED',book_name:'เปลี่ยน',role:'admin'},adminCookie)).status,400);
      assert.equal((await request('/api/admin/books/'+book.book_id,'DELETE',{force:true},adminCookie)).status,400);
      assert.equal((await get('/api/admin/books?q=VALID15')).data.books[0].book_name,'หนังสือเดิม');
      assert.equal((await request('/api/admin/auth/logout','POST',{unexpected:true},adminCookie)).status,400);
      assert.equal((await get('/api/admin/auth/me')).status,200);
      const slot=(await createSlots(pool,()=>Date.parse('2030-01-01T02:00:00Z')).save(null,{booking_date:'2031-01-01',start_time:'09:00',end_time:'10:00',max_students:10,status:'OPEN'}));
      assert.equal((await request('/api/admin/booking-slots/'+slot.slot_id+'/status','PATCH',{status:'CLOSED',student_id:20},adminCookie)).status,400);
      assert.equal((await request('/api/admin/booking-slots/'+slot.slot_id,'DELETE',{force:true},adminCookie)).status,400);
      assert.equal((await request('/api/admin/booking-slots/'+slot.slot_id+'/status?date=2031-01-01','PATCH',{status:'CLOSED'},adminCookie)).status,400);
      assert.equal((await get('/api/admin/booking-slots')).data.slots[0].status,'OPEN');
    });
    await t.test('SQL payload remains literal text and cannot change schema or broaden searches',async()=>{
      const payload="' OR 1=1; DROP TABLE students; --";
      const result=await request('/api/admin/books','POST',{book_code:'SQL15',book_name:payload,description:'<script>example</script>'},adminCookie);
      assert.equal(result.status,201);assert.equal(result.data.book.book_name,payload);
      const found=await get('/api/admin/books?q='+encodeURIComponent(payload));assert.equal(found.status,200);assert.equal(found.data.books.length,1);assert.equal(found.data.books[0].book_code,'SQL15');
      assert.equal((await get('/api/admin/reports/bookings?q='+encodeURIComponent(payload))).data.total,0);
      const [[count]]=await pool.query('SELECT COUNT(*) AS n FROM students');assert.equal(count.n,4);
      const [[row]]=await pool.query('SELECT password FROM admins WHERE admin_id=10');assert.match(row.password,/^scrypt\$/);assert.notEqual(row.password,password);
    });
    await t.test('Cross-origin mutations rejected across all writers',async()=>{
      for(const [route,method,cookie]of [['/api/admin/books','POST',adminCookie],['/api/admin/book-sets','POST',adminCookie],['/api/admin/booking-slots','POST',adminCookie],['/api/admin/announcements','POST',adminCookie],['/api/admin/pickup/lookup','POST',adminCookie],['/api/admin/pickup/confirm','POST',adminCookie],['/api/student/bookings','POST',studentCookie],['/api/student/bookings/1/cancel','POST',studentCookie]]){
        assert.equal((await request(route,method,{},cookie,{'Sec-Fetch-Site':'cross-site'})).status,403,route);
      }
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase15_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
