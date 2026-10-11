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

test('Phase 8 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase8_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, pickup:createPickup(pool,()=>Date.parse('2030-01-01T02:00:00Z')), bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
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
    const pickup=createPickup(pool,clock);
    const book=await catalog.createBook({book_code:'PICKUP01',book_name:'การพัฒนาเว็บไซต์'});
    const set=(await catalog.saveSet(null,{department_id:10,education_level_id:10,classroom_id:10,semester:1,academic_year:2574,book_ids:[book.book_id]})).book_set_id;
    const slot=(await createSlots(pool,clock).save(null,{booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',max_students:20,status:'OPEN'})).slot_id;
    async function fixture(studentId=10){
      const token='BQ1:'+randomBytes(32).toString('hex').toUpperCase();
      const [result]=await pool.execute('INSERT INTO bookings(student_id,slot_id,book_set_id,queue_number,qr_code) VALUES(?,?,?,?,?)',[studentId,slot,set,'P'+randomBytes(5).toString('hex'),token]);
      return {booking_id:result.insertId,token};
    }
    const first=await fixture();
    const post=(action,body,cookie=adminCookie,extra={})=>request('/api/admin/pickup/'+action,'POST',body,cookie,extra);
    async function stored(id){const [[row]]=await pool.execute("SELECT booking_status,DATE_FORMAT(received_at,'%Y-%m-%d %H:%i:%s') AS received_at,qr_code FROM bookings WHERE booking_id=?",[id]);return row;}
    await t.test('Phase 8 migration upgrades legacy schema once and preserves existing bookings',async()=>{
      await pool.query('ALTER TABLE bookings DROP COLUMN received_at');
      assert.equal(await migratePhase8(pool),true);assert.equal(await migratePhase8(pool),false);
      const row=await stored(first.booking_id);assert.equal(row.qr_code,first.token);assert.equal(row.booking_status,'WAITING');assert.equal(row.received_at,null);
    });
    await t.test('Only authenticated admins can look up or confirm; methods and CSRF are enforced',async()=>{
      for(const action of ['lookup','confirm']){
        assert.equal((await post(action,first,'')).status,401);
        assert.equal((await post(action,first,studentCookie)).status,403);
        assert.equal((await post(action,first,adminCookie,{Origin:'https://evil.example'})).status,403);
      }
      assert.equal((await request('/api/admin/pickup/lookup','GET',undefined,adminCookie)).status,405);
      assert.equal((await post('lookup',{token:first.token},adminCookie,{'Content-Type':'text/plain'})).status,415);
      assert.equal((await request('/api/admin/pickup/lookup?token=x','POST',{token:first.token},adminCookie)).status,400);
      assert.equal((await request('/admin-scanner.html','GET',undefined,studentCookie)).status,302);
      assert.equal((await request('/admin-scanner.html','GET',undefined,adminCookie)).status,200);
      assert.equal((await request('/assets/jsqr.js')).status,200);
    });
    await t.test('Scan displays student, group, date, queue and books without marking received',async()=>{
      const result=await post('lookup',{token:first.token});assert.equal(result.status,200);
      const row=result.data.booking;
      assert.equal(row.student_code,'900010');assert.equal(row.first_name,'นักศึกษาทดสอบ');assert.equal(row.department_name,'ไอทีทดสอบ');
      assert.equal(row.education_level_name,'ปวส.1');assert.equal(row.classroom_name,'1/1');assert.equal(row.books[0].book_name,'การพัฒนาเว็บไซต์');
      assert.equal(row.booking_date,'2031-09-15');assert.equal(row.start_time,'09:00:00');assert.equal(row.received_at,null);
      assert.equal(JSON.stringify(row).includes(first.token),false);assert.equal(row.password,undefined);
      assert.equal((await stored(first.booking_id)).booking_status,'WAITING');
    });
    await t.test('Malformed, unknown and mismatched QR cannot confirm a different booking',async()=>{
      for(const body of [{token:'https://example.org'},{token:"' OR 1=1 --"},{token:first.token,student_id:10},{}])assert.equal((await post('lookup',body)).status,400);
      assert.equal((await post('lookup',{token:'BQ1:'+'0'.repeat(64)})).status,404);
      assert.equal((await post('confirm',{...first,booking_id:999999})).status,404);
      assert.equal((await post('confirm',{...first,booking_id:'1'})).status,400);
    });
    await t.test('Confirm persists RECEIVED and Thailand time; second confirm preserves original timestamp',async()=>{
      const before=(await createSlots(pool,clock).list()).find(row=>row.slot_id===slot).remaining;
      const result=await post('confirm',first);assert.equal(result.status,200);
      assert.equal(result.data.booking.booking_status,'RECEIVED');assert.equal(result.data.booking.received_at,'2030-01-01 09:00:00');
      const duplicate=await post('confirm',first);assert.equal(duplicate.status,409);assert.match(duplicate.data.message,/รายการนี้รับหนังสือแล้ว/);
      await assert.rejects(createPickup(pool,()=>clock()+60000).confirm(first),{status:409});
      assert.equal((await stored(first.booking_id)).received_at,'2030-01-01 09:00:00');
      assert.equal((await createSlots(pool,clock).list()).find(row=>row.slot_id===slot).remaining,before);
      assert.equal((await request('/api/student/bookings/'+first.booking_id+'/qr','GET',undefined,studentCookie)).status,409);
      const own=await request('/api/student/bookings','GET',undefined,studentCookie);assert.equal(own.data.bookings[0].received_at,'2030-01-01 09:00:00');
    });
    await t.test('Two concurrent confirmations have exactly one winner',async()=>{
      const row=await fixture(20);
      const results=await Promise.all([post('confirm',row),post('confirm',row)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await stored(row.booking_id)).received_at,'2030-01-01 09:00:00');
    });
    await t.test('Cancelled and no-show cannot be received; checked-in is allowed',async()=>{
      const row=await fixture(30);
      for(const status of ['CANCELLED','NO_SHOW']){
        await pool.execute('UPDATE bookings SET booking_status=? WHERE booking_id=?',[status,row.booking_id]);
        assert.equal((await post('lookup',{token:row.token})).data.booking.booking_status,status);
        assert.equal((await post('confirm',row)).status,409);assert.equal((await stored(row.booking_id)).received_at,null);
      }
      await pool.execute("UPDATE bookings SET booking_status='CHECKED_IN' WHERE booking_id=?",[row.booking_id]);
      assert.equal((await post('confirm',row)).status,200);
    });
    await t.test('Receipt failure rolls back status and received_at together',async()=>{
      const row=await fixture(40);
      const faulty={getConnection:async()=>{const connection=await pool.getConnection();return new Proxy(connection,{get(target,key){if(key==='execute')return(sql,params)=>{if(sql.startsWith('SELECT b.booking_id,'))throw Error('Simulated receipt failure');return target.execute(sql,params);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
      await assert.rejects(createPickup(faulty,clock).confirm(row),/Simulated receipt failure/);
      const unchanged=await stored(row.booking_id);assert.equal(unchanged.booking_status,'WAITING');assert.equal(unchanged.received_at,null);
    });
    await t.test('Removed admin account loses scanner API access immediately',async()=>{
      await pool.query('DELETE FROM admins WHERE admin_id=10');
      assert.equal((await post('lookup',{token:first.token})).status,401);
    });

  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase8_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
