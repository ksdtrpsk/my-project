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

test('Phase 13 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase13_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, reports:createReports(pool,()=>Date.parse('2030-01-01T02:00:00Z')), dashboard:createDashboard(pool,()=>Date.parse('2030-01-01T02:00:00Z')), pickup:createPickup(pool,()=>Date.parse('2030-01-01T02:00:00Z')), bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
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


    const route='/api/admin/reports/bookings';
    await t.test('Report categories use saved statuses including pending checked-in',async()=>{
      for(const [report,total] of [['all',5],['received',1],['pending',2],['no_show',1]]){
        const result=await get(route+'?report='+report);assert.equal(result.status,200);assert.equal(result.data.total,total);assert.equal(result.data.report,report);
      }
      const pending=(await get(route+'?report=pending')).data.bookings;assert.deepEqual(pending.map(x=>x.booking_status).sort(),['CHECKED_IN','WAITING']);
    });
    await t.test('Report combines group, date, text and status filters and returns empty results honestly',async()=>{
      assert.equal((await get(route+'?report=pending&department_id=10&education_level_id=10&classroom_id=10&date=2030-01-01&q=A001')).data.total,1);
      const result=(await get(route+'?report=received&status=WAITING')).data;assert.equal(result.total,0);assert.deepEqual(result.bookings,[]);
      assert.equal((await get(route+'?report=received')).data.bookings[0].received_at,'2030-01-01 09:00:00');
    });
    await t.test('Reports and CSV reject students, anonymous requests, mutation and invalid parameters',async()=>{
      for(const target of [route,route+'.csv']){
        assert.equal((await request(target)).status,401);assert.equal((await request(target,'GET',undefined,studentCookie)).status,403);assert.equal((await request(target,'POST',{},adminCookie)).status,405);
        assert.equal((await get(target+'?report=constructor')).status,400);assert.equal((await get(target+'?report=all&report=pending')).status,400);assert.equal((await get(target+'?status=bad')).status,400);assert.equal((await get(target+'?date=2030-02-30')).status,400);
      }
      assert.equal((await get(route+'.csv?page=1')).status,400);
      assert.equal((await request('/admin-reports.html')).status,302);assert.equal((await request('/admin-reports.html','GET',undefined,studentCookie)).status,302);assert.equal((await request('/admin-reports.html','GET',undefined,adminCookie)).status,200);
    });
    await t.test('CSV has UTF-8 BOM, attachment headers, Thai labels and no QR or credentials',async()=>{
      const response=await fetch(base+route+'.csv?report=received',{headers:{Cookie:adminCookie}});assert.equal(response.status,200);
      assert.match(response.headers.get('content-type'),/text\/csv/);assert.match(response.headers.get('content-disposition'),/attachment; filename="bookings-received-2030-01-01.csv"/);assert.match(response.headers.get('cache-control'),/no-store/);
      const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual([...bytes.subarray(0,3)],[239,187,191]);const text=bytes.toString('utf8');assert.match(text,/รหัสนักศึกษา/);assert.match(text,/ไอทีทดสอบ/);assert.match(text,/RECEIVED/);assert.doesNotMatch(text,/BQ1:|password|qr_code|phone|email/);assert.equal(text.split('\r\n').length,3);
    });
    await t.test('CSV escapes spreadsheet formulas and quotes stored in names',async()=>{
      await pool.execute('UPDATE students SET first_name=?,last_name=? WHERE student_id=10',['=1+1','ชื่อ,"ทดสอบ"']);
      const csv=(await get(route+'.csv?q=A001')).data;assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"ชื่อ,""ทดสอบ"""'));
    });
    await t.test('CSV exports every matching row rather than only the current page',async()=>{
      for(let i=0;i<26;i++)await pool.execute("INSERT INTO bookings(student_id,book_set_id,slot_id,queue_number,booking_status) VALUES(10,?,?,?,'CANCELLED')",[sets[0],slot,'EXPORT'+i]);
      const page=(await get(route+'?q=EXPORT')).data;assert.equal(page.total,26);assert.equal(page.bookings.length,25);
      const csv=(await get(route+'.csv?q=EXPORT')).data;assert.equal(csv.split('\r\n').length,28);assert.ok(csv.includes('EXPORT25'));
      const empty=(await get(route+'.csv?q=does-not-exist')).data;assert.equal(empty.split('\r\n').length,2);
    });
    await t.test('Deleted admin loses CSV access',async()=>{
      await pool.query('DELETE FROM admins WHERE admin_id=10');assert.equal((await get(route+'.csv')).status,401);
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase13_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
