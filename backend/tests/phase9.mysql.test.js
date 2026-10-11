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

test('Phase 9 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase9_test_' + randomBytes(8).toString('hex');
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

    const bookings=createBookings(pool,clock);
    const route=id=>'/api/student/bookings/'+id+'/cancel';
    async function clear(){await pool.query('DELETE FROM bookings');}
    await t.test('Cancellation requires owner session, correct method, origin and empty body',async()=>{
      const first=await fixture();
      assert.equal((await request(route(first.booking_id),'POST',{})).status,401);
      assert.equal((await request(route(first.booking_id),'POST',{},adminCookie)).status,401);
      const other=(await request('/api/auth/login','POST',{student_code:'900020',password})).cookie;
      assert.equal((await request(route(first.booking_id),'POST',{},other)).status,404);
      assert.equal((await request(route(first.booking_id),'GET',undefined,studentCookie)).status,405);
      assert.equal((await request(route(first.booking_id),'POST',{},studentCookie,{Origin:'https://evil.example'})).status,403);
      assert.equal((await request(route(first.booking_id),'POST',{student_id:10},studentCookie)).status,400);
      assert.equal((await request(route(first.booking_id)+'?student_id=10','POST',{},studentCookie)).status,400);
      assert.equal((await request(route(first.booking_id),'POST',{},studentCookie,{'Content-Type':'text/plain'})).status,415);
      assert.equal((await request(route(0),'POST',{},studentCookie)).status,400);
      await clear();
    });
    await t.test('Cancel frees one seat, retains history, disables QR and allows new unique booking',async()=>{
      const first=await bookings.create(10,{book_set_id:set,slot_id:slot});
      const [[before]]=await pool.execute('SELECT qr_code FROM bookings WHERE booking_id=?',[first.booking_id]);
      assert.equal(first.can_cancel,true);
      const result=await request(route(first.booking_id),'POST',{},studentCookie);
      assert.equal(result.status,200);assert.equal(result.data.booking.booking_status,'CANCELLED');assert.equal(result.data.booking.can_cancel,false);
      const slots=await createSlots(pool,clock).list(false);assert.equal(slots.find(row=>row.slot_id===slot).booked_count,0);
      assert.equal((await request('/api/student/bookings/'+first.booking_id+'/qr','GET',undefined,studentCookie)).status,409);
      await assert.rejects(pickup.confirm({booking_id:first.booking_id,token:before.qr_code}),{status:409});
      assert.equal((await request(route(first.booking_id),'POST',{},studentCookie)).status,409);
      const next=await bookings.create(10,{book_set_id:set,slot_id:slot});
      assert.notEqual(next.queue_number,first.queue_number);
      const [[after]]=await pool.execute('SELECT qr_code FROM bookings WHERE booking_id=?',[next.booking_id]);assert.notEqual(before.qr_code,after.qr_code);
      assert.equal((await bookings.list(10)).length,2);
      await clear();
    });
    await t.test('Server enforces exact Thai start deadline and terminal statuses',async()=>{
      const first=await fixture();
      const boundary=Date.parse('2031-09-15T02:00:00Z');
      for(const stamp of [boundary,boundary+1000]){
        assert.equal((await createBookings(pool,()=>stamp).list(10))[0].can_cancel,false);
        await assert.rejects(createBookings(pool,()=>stamp).cancel(10,first.booking_id),{status:409});
      }
      assert.equal((await createBookings(pool,()=>boundary-1000).list(10))[0].can_cancel,true);
      for(const status of ['CHECKED_IN','RECEIVED','NO_SHOW','CANCELLED']){
        await pool.execute('UPDATE bookings SET booking_status=? WHERE booking_id=?',[status,first.booking_id]);
        await assert.rejects(bookings.cancel(10,first.booking_id),{status:409});
      }
      await pool.execute("UPDATE bookings SET booking_status='WAITING' WHERE booking_id=?",[first.booking_id]);
      assert.equal((await createBookings(pool,()=>boundary-1000).cancel(10,first.booking_id)).booking_status,'CANCELLED');
      await clear();
    });
    await t.test('Two cancellation requests release only one seat',async()=>{
      const first=await fixture();
      const results=await Promise.all([request(route(first.booking_id),'POST',{},studentCookie),request(route(first.booking_id),'POST',{},studentCookie)]);
      assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
      assert.equal((await createSlots(pool,clock).list(false)).find(row=>row.slot_id===slot).booked_count,0);
      await clear();
    });
    await t.test('Cancel racing pickup has exactly one winner with consistent received_at',async()=>{
      const first=await fixture();
      const results=await Promise.allSettled([bookings.cancel(10,first.booking_id),pickup.confirm(first)]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
      const [row]=await bookings.list(10);
      assert.ok(['CANCELLED','RECEIVED'].includes(row.booking_status));
      assert.equal(Boolean(row.received_at),row.booking_status==='RECEIVED');
      await clear();
    });
    await t.test('Receipt failure rolls cancellation back and leaves QR usable',async()=>{
      const first=await fixture();
      const faulty={getConnection:async()=>{
        const connection=await pool.getConnection();
        return new Proxy(connection,{get(target,key){
          if(key==='execute')return async(sql,args)=>{if(sql.includes('SELECT b.booking_id'))throw new Error('receipt failure');return target.execute(sql,args);};
          const value=target[key];return typeof value==='function'?value.bind(target):value;
        }});
      }};
      await assert.rejects(createBookings(faulty,clock).cancel(10,first.booking_id),/receipt failure/);
      assert.equal((await bookings.list(10))[0].booking_status,'WAITING');
      assert.equal((await request('/api/student/bookings/'+first.booking_id+'/qr','GET',undefined,studentCookie)).status,200);
      await clear();
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase9_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
