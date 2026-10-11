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
const { migratePhase14 } = require('../scripts/migrate-phase14');
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

test('Phase 14 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase14_test_' + randomBytes(8).toString('hex');
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

    const route='/api/admin/announcements';
    const get=()=>request(route,'GET',undefined,adminCookie);
    const post=body=>request(route,'POST',body,adminCookie);
    const draft=()=>({title:'เตรียมบัตรนักศึกษา',content:'นำบัตรมาแสดง\nสถานที่: ห้องสมุด <script>alert(1)</script>',request_id:randomUUID()});
    await t.test('Empty announcement state and access boundaries',async()=>{
      assert.deepEqual((await get()).data,{announcements:[]});
      assert.equal((await request('/api/student/announcements/latest','GET',undefined,studentCookie)).data.announcement,null);
      assert.equal((await request(route)).status,401);
      assert.equal((await request(route,'POST',draft(),studentCookie)).status,403);
      assert.equal((await request('/api/student/announcements/latest')).status,401);
      assert.equal((await request('/admin-announcements.html')).status,302);
      assert.equal((await request('/admin-announcements.html','GET',undefined,adminCookie)).status,200);
    });
    await t.test('Validation, CSRF, unknown fields and methods reject before insert',async()=>{
      for(const body of [null,{},[],{...draft(),title:' '},{...draft(),title:'a'.repeat(161)},{...draft(),content:'a'.repeat(5001)},{...draft(),content:'\u0000'},{...draft(),created_by:20},{...draft(),request_id:'bad'}])assert.equal((await post(body)).status,400);
      assert.equal((await request(route,'POST',draft(),adminCookie,{Origin:'https://evil.example'})).status,403);
      assert.equal((await request(route,'DELETE',undefined,adminCookie)).status,405);
      assert.equal((await request(route+'?q=x','GET',undefined,adminCookie)).status,400);
      assert.equal((await request(route,'POST',draft(),adminCookie,{'Content-Type':'text/plain'})).status,415);
      assert.equal((await post({...draft(),content:'ก'.repeat(20000)})).status,413);
      assert.deepEqual((await get()).data.announcements,[]);
    });
    let first;
    await t.test('Thai multiline text persists and student sees newest even at the same timestamp',async()=>{
      const body=draft();first=(await post(body)).data.announcement;
      assert.equal(first.content,body.content);assert.equal(first.created_at,'2030-01-01 09:00:00');
      const second=await post({...draft(),title:'เปลี่ยนสถานที่'});assert.equal(second.status,201);
      const latest=(await request('/api/student/announcements/latest','GET',undefined,studentCookie)).data.announcement;
      assert.deepEqual(latest,second.data.announcement);assert.equal('created_by' in latest,false);assert.equal('request_id' in latest,false);
      assert.deepEqual((await get()).data.announcements.map(x=>x.announcement_id),[latest.announcement_id,first.announcement_id]);
    });
    await t.test('Concurrent retry creates exactly one record; changed payload conflicts',async()=>{
      const body=draft();const replies=await Promise.all([post(body),post(body)]);
      assert.ok(replies.every(x=>x.status===201));assert.deepEqual(replies[0].data,replies[1].data);
      assert.equal((await post({...body,title:'ต่างกัน'})).status,409);
      const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM announcements WHERE request_id=?',[body.request_id]);assert.equal(count.n,1);
    });
    await t.test('Latest fifty limit and repeatable additive migration preserve other data',async()=>{
      for(let i=0;i<51;i++)await post({...draft(),title:'ประกาศ '+i});
      const rows=(await get()).data.announcements;assert.equal(rows.length,50);assert.equal(rows[0].title,'ประกาศ 50');
      await migratePhase14(pool);await migratePhase14(pool);assert.deepEqual((await get()).data.announcements,rows);
      const [[count]]=await pool.query('SELECT COUNT(*) AS n FROM students');assert.equal(count.n,4);
      await pool.query('DROP TABLE announcements');await migratePhase14(pool);assert.deepEqual((await get()).data.announcements,[]);
      await post(draft());
    });
    await t.test('Deleted accounts lose access and author deletion preserves announcement',async()=>{
      await pool.query('DELETE FROM students WHERE student_id=10');
      assert.equal((await request('/api/student/announcements/latest','GET',undefined,studentCookie)).status,401);
      await pool.query('DELETE FROM admins WHERE admin_id=10');assert.equal((await get()).status,401);
      const [[row]]=await pool.query('SELECT created_by,title FROM announcements');assert.equal(row.created_by,null);assert.equal(row.title,'เตรียมบัตรนักศึกษา');
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase14_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
