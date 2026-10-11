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

test('Phase 12 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase12_test_' + randomBytes(8).toString('hex');
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

    await pool.execute("UPDATE students SET first_name=?,last_name=? WHERE student_id=10",['สมชาย','100%_!']);
    await t.test('Search finds student code, Thai name, full name and queue',async()=>{
      for(const [q,count] of [['900010',2],['สมชาย',2],['สมชาย 100%_!',2],['A001',1],['no match',0]]){
        const result=await get('/api/admin/bookings?q='+encodeURIComponent(q));assert.equal(result.status,200);assert.equal(result.data.total,count,q);
      }
      assert.equal((await get('/api/admin/bookings?q=%20%20')).data.total,5);
    });
    await t.test('Wildcard characters and SQL payload are literal text',async()=>{
      for(const q of ['%','_','!','100%_!'])assert.equal((await get('/api/admin/bookings?q='+encodeURIComponent(q))).data.total,2,q);
      assert.equal((await get('/api/admin/bookings?q='+encodeURIComponent("' OR 1=1 --"))).data.total,0);
    });
    await t.test('Each status and group filter matches stored data',async()=>{
      for(const status of ['WAITING','CHECKED_IN','RECEIVED','CANCELLED','NO_SHOW']){
        const result=(await get('/api/admin/bookings?status='+status)).data;assert.equal(result.total,1);assert.equal(result.bookings[0].booking_status,status);
      }
      for(const [query,count] of [['department_id=10',4],['department_id=20',1],['education_level_id=20',1],['classroom_id=10',2],['date=2030-01-01',2],['date=2030-01-02',3]])assert.equal((await get('/api/admin/bookings?'+query)).data.total,count,query);
    });
    await t.test('Combined filters intersect and keep Phase 11 group selection',async()=>{
      const query='q='+encodeURIComponent('สมชาย')+'&department_id=10&education_level_id=10&classroom_id=10&date=2030-01-01&status=WAITING';
      assert.equal((await get('/api/admin/bookings?'+query)).data.total,1);
      assert.equal((await get('/api/admin/bookings?'+query+'&group_by=department&group_id=20')).data.total,0);
      assert.equal((await get('/api/admin/bookings?department_id=20&classroom_id=10')).data.total,0);
      assert.equal((await get('/api/admin/dashboard')).data.totals.total,5);
    });
    await t.test('Filters reject invalid IDs, dates, statuses and duplicate keys',async()=>{
      for(const query of ['department_id=0','department_id=abc','education_level_id=-1','classroom_id=4294967296','date=2030-02-30','status=waiting','status=','q=a&q=b','department_id=10&department_id=20','q='+ 'x'.repeat(101),'q=%00','student_id=10'])assert.equal((await get('/api/admin/bookings?'+query)).status,400,query);
      assert.equal((await request('/api/admin/bookings?q=900010')).status,401);
      assert.equal((await request('/api/admin/bookings?status=WAITING','GET',undefined,studentCookie)).status,403);
    });
    await t.test('Filtered pagination preserves matching count without losing rows',async()=>{
      for(let i=0;i<26;i++)await pool.execute("INSERT INTO bookings(student_id,book_set_id,slot_id,queue_number,booking_status) VALUES(10,?,?,?,'CANCELLED')",[sets[0],slot,'FILTER'+i]);
      const first=(await get('/api/admin/bookings?q=FILTER&status=CANCELLED')).data;
      const second=(await get('/api/admin/bookings?q=FILTER&status=CANCELLED&page=2')).data;
      assert.equal(first.total,26);assert.equal(first.bookings.length,25);assert.equal(second.bookings.length,1);assert.equal(new Set([...first.bookings,...second.bookings].map(row=>row.booking_id)).size,26);
      assert.equal((await get('/api/admin/bookings')).data.total,31);
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase12_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
