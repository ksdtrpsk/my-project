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

test('Phase 11 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase11_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, dashboard:createDashboard(pool,()=>Date.parse('2030-01-01T02:00:00Z')), pickup:createPickup(pool,()=>Date.parse('2030-01-01T02:00:00Z')), bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    const adminCookie=(await request('/api/admin/auth/login','POST',{username:'testadmin',password})).cookie;
    const studentCookie=(await request('/api/auth/login','POST',{student_code:'900010',password})).cookie;
    const clock=()=>Date.parse('2030-01-01T02:00:00Z');

    const dashboard=createDashboard(pool,clock);
    const get=route=>request(route,'GET',undefined,adminCookie);
    await t.test('Empty database returns true zero counts and empty lists',async()=>{
      const result=await get('/api/admin/dashboard');assert.equal(result.status,200);
      assert.deepEqual(result.data.totals,{total:0,students:0,received:0,pending:0,cancelled:0,no_show:0,today:0});
      assert.deepEqual(result.data.groups,[]);assert.deepEqual((await get('/api/admin/bookings')).data.bookings,[]);
    });
    const book=await catalog.createBook({book_code:'DASH11',book_name:'หนังสือ <script> ทดสอบ'});
    const sets=[];
    for(const [department,level,classroom] of [[10,10,10],[20,10,20],[10,10,30],[10,20,40]]) sets.push((await catalog.saveSet(null,{department_id:department,education_level_id:level,classroom_id:classroom,semester:1,academic_year:2573,book_ids:[book.book_id]})).book_set_id);
    const [slotResult]=await pool.execute("INSERT INTO booking_slots(booking_date,start_time,end_time,max_students,status) VALUES ('2030-01-01','09:00','09:30',50,'OPEN'),('2030-01-02','09:00','09:30',50,'OPEN')");
    const slot=slotResult.insertId;
    const ids=[];
    for(const [student,set,day,status] of [[10,sets[0],slot,'WAITING'],[20,sets[1],slot,'CHECKED_IN'],[30,sets[2],slot+1,'RECEIVED'],[40,sets[3],slot+1,'NO_SHOW'],[10,sets[0],slot+1,'CANCELLED']]){
      const [result]=await pool.execute('INSERT INTO bookings(student_id,book_set_id,slot_id,queue_number,booking_status,qr_code,received_at) VALUES(?,?,?,?,?,?,?)',[student,set,day,'A00'+(ids.length+1),status,'BQ1:'+randomBytes(32).toString('hex').toUpperCase(),status==='RECEIVED'?'2030-01-01 09:00:00':null]);ids.push(result.insertId);
    }
    await t.test('All dashboard data requires a valid admin account',async()=>{
      for(const route of ['/api/admin/dashboard','/api/admin/bookings','/api/admin/bookings/'+ids[0]]){
        assert.equal((await request(route)).status,401);assert.equal((await request(route,'GET',undefined,studentCookie)).status,403);
        assert.equal((await request(route,'POST',{},adminCookie)).status,405);
      }
      assert.equal((await request('/dashboard.html')).status,302);
      assert.equal((await request('/dashboard.html','GET',undefined,studentCookie)).status,302);
    });
    await t.test('Totals use appointment date and disjoint states without duplicating book joins',async()=>{
      const result=(await get('/api/admin/dashboard')).data;
      assert.deepEqual(result.totals,{total:5,students:4,received:1,pending:2,cancelled:1,no_show:1,today:2});
      assert.equal(result.today,'2030-01-01');assert.equal(result.groups.length,2);
      assert.equal(result.groups.find(x=>x.group_id===10).total,4);
      const edge=await createDashboard(pool,()=>Date.parse('2030-01-01T17:00:00Z')).summary(new URLSearchParams());assert.equal(edge.today,'2030-01-02');assert.equal(edge.totals.today,3);
    });
    await t.test('All five group dimensions drill down to matching complete totals',async()=>{
      for(const group of ['department','level','classroom','date','book_set']){
        const result=(await get('/api/admin/dashboard?group_by='+group)).data;
        assert.equal(result.groups.reduce((n,row)=>n+row.total,0),5);
        for(const row of result.groups){
          const list=(await get('/api/admin/bookings?group_by='+group+'&group_id='+row.group_id)).data;
          assert.equal(list.total,row.total);assert.equal(list.bookings.length,row.total);
          assert.equal(list.bookings.filter(x=>x.booking_status==='RECEIVED').length,row.received);
        }
      }
    });
    await t.test('Detail includes books and received time but never secrets or QR token',async()=>{
      const response=await get('/api/admin/bookings/'+ids[2]);assert.equal(response.status,200);
      assert.equal(response.data.booking.books[0].book_name,'หนังสือ <script> ทดสอบ');assert.equal(response.data.booking.received_at,'2030-01-01 09:00:00');
      for(const route of ['/api/admin/dashboard','/api/admin/bookings','/api/admin/bookings/'+ids[2]])assert.doesNotMatch(JSON.stringify((await get(route)).data),/BQ1:|password|qr_code|phone|email/);
      assert.equal((await get('/api/admin/bookings/4294967295')).status,404);
    });
    await t.test('Invalid query, repeated parameters and injection are rejected',async()=>{
      for(const route of ['/api/admin/dashboard?group_by=constructor','/api/admin/dashboard?group_by=date&group_by=level','/api/admin/dashboard?q=x','/api/admin/bookings?group_id=10','/api/admin/bookings?group_by=date&group_id=2030-02-30','/api/admin/bookings?group_by=department&group_id=1%20OR%201=1','/api/admin/bookings?page=0','/api/admin/bookings?page=-1','/api/admin/bookings?page=1000001','/api/admin/bookings/'+ids[0]+'?x=1','/api/admin/bookings/0'])assert.equal((await get(route)).status,400,route);
    });
    await t.test('Pagination retains stable order with no duplicate or omitted bookings',async()=>{
      for(let i=0;i<26;i++)await pool.execute("INSERT INTO bookings(student_id,book_set_id,slot_id,queue_number,booking_status) VALUES(10,?,?,?,'CANCELLED')",[sets[0],slot,'Z'+i]);
      const first=(await get('/api/admin/bookings')).data,second=(await get('/api/admin/bookings?page=2')).data;
      assert.equal(first.total,31);assert.equal(first.bookings.length,25);assert.equal(second.bookings.length,6);
      assert.equal(new Set([...first.bookings,...second.bookings].map(x=>x.booking_id)).size,31);
      assert.equal((await get('/api/admin/bookings?page=3')).data.bookings.length,0);
    });
    await t.test('Removed admin cannot read any booking data',async()=>{
      await pool.query('DELETE FROM admins WHERE admin_id=10');assert.equal((await get('/api/admin/dashboard')).status,401);
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase11_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
