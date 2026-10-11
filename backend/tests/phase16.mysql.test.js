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

test('Phase 16 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase16_test_' + randomBytes(8).toString('hex');
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



    const get=(query='',cookie=adminCookie)=>request('/api/admin/students'+query,'GET',undefined,cookie);
    await t.test('Directory includes unbooked students and excludes credentials and contact details',async()=>{
      const result=await get();assert.equal(result.status,200);assert.equal(result.data.total,4);assert.equal(result.data.students.length,4);
      assert.deepEqual(Object.keys(result.data.students[0]).sort(),['student_id','student_code','first_name','last_name','department_name','education_level_name','classroom_name'].sort());
      assert.equal((await get('?q=900020')).data.students[0].department_name,'บัญชีทดสอบ');
      assert.equal((await get('?q='+encodeURIComponent('นักศึกษาทดสอบ'))).data.total,4);
      assert.equal((await get('?q='+encodeURIComponent("' OR 1=1 --"))).data.total,0);
      assert.equal((await get('?q=%25')).data.total,0);
    });
    await t.test('Directory role, methods and filters reject unauthorized or malformed requests',async()=>{
      assert.equal((await get('','')).status,401);assert.equal((await get('',studentCookie)).status,403);
      assert.equal((await request('/api/admin/students','POST',{},adminCookie)).status,400);
      for(const query of ['?q=a&q=b','?role=admin','?page=0','?page=1.2','?page=1000001','?q=%00','?q='+('x'.repeat(101))])assert.equal((await get(query)).status,400,query);
      for(const page of ['/admin-students.html','/admin-bookings.html']){
        assert.equal((await request(page)).status,302);assert.equal((await request(page,'GET',undefined,studentCookie)).status,302);assert.equal((await request(page,'GET',undefined,adminCookie)).status,200);
      }
    });
    await t.test('Directory paginates predictably without duplicates and rejects deleted admins',async()=>{
      for(let i=0;i<24;i++)await pool.execute('INSERT INTO students(student_code,password,first_name,last_name,department_id,education_level_id,classroom_id) VALUES(?,?,?,?,10,10,10)',['8000'+String(i).padStart(2,'0'),hash,'แบ่งหน้า',String(i)]);
      const first=(await get()).data,second=(await get('?page=2')).data;
      assert.equal(first.total,28);assert.equal(first.students.length,25);assert.equal(second.students.length,3);assert.equal(new Set([...first.students,...second.students].map(s=>s.student_id)).size,28);
      await pool.query('DELETE FROM admins WHERE admin_id=10');assert.equal((await get()).status,401);
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase16_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
