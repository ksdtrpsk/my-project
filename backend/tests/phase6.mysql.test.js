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

test('Phase 6 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase6_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    const adminCookie = (await request('/api/admin/auth/login','POST',{username:'testadmin',password})).cookie;
    const cookies = {};
    for (const id of [10,20,30,40]) cookies[id]=(await request('/api/auth/login','POST',{student_code:'9000'+id,password})).cookie;
    const post = (studentId, setId, slotId) => request('/api/student/bookings','POST',{book_set_id:setId,slot_id:slotId},cookies[studentId]);
    const mine = id => request('/api/student/bookings','GET',undefined,cookies[id]);
    const clock = () => Date.parse('2030-01-01T02:00:00Z');
    const slots = createSlots(pool,clock);
    const book = await catalog.createBook({book_code:'BOOKING01',book_name:'หนังสือสำหรับจอง'});
    let semester = 0, period = 0;
    async function sets() {
      semester++;
      const result={};
      for(const [id,department,level,room] of [[10,10,10,10],[20,20,10,20],[30,10,10,30],[40,10,20,40]]) result[id]=(await catalog.saveSet(null,{department_id:department,education_level_id:level,classroom_id:room,semester:1,academic_year:2570+semester,book_ids:[book.book_id]})).book_set_id;
      return result;
    }
    async function slot(capacity=20,status='OPEN') {
      period++;
      return slots.save(null,{booking_date:'2031-09-'+String(period).padStart(2,'0'),start_time:'09:00',end_time:'09:30',max_students:capacity,status});
    }
    await t.test('Booking endpoints require student session, reject impersonation and cross-site requests',async()=>{
      assert.equal((await request('/api/student/bookings')).status,401);
      assert.equal((await request('/api/student/bookings','POST',{},adminCookie)).status,401);
      assert.equal((await request('/api/student/bookings','POST',{book_set_id:1,slot_id:1,student_id:20},cookies[10])).status,400);
      assert.equal((await request('/api/student/bookings?student_id=20','GET',undefined,cookies[10])).status,400);
      assert.equal((await request('/api/student/bookings','POST',{book_set_id:1,slot_id:1},cookies[10],{Origin:'https://evil.example'})).status,403);
      assert.equal((await request('/api/student/bookings','POST',{},cookies[10],{'Content-Type':'text/plain'})).status,415);
      assert.equal((await request('/api/student/bookings','DELETE',{},cookies[10])).status,405);
      for(const body of [{},{book_set_id:'1',slot_id:1},{book_set_id:1,slot_id:0},{book_set_id:1,slot_id:1,queue_number:'A999'}]) assert.equal((await request('/api/student/bookings','POST',body,cookies[10])).status,400);
    });
    await t.test('Successful booking persists WAITING, receipt, owned books and capacity; other students cannot see it',async()=>{
      const group=await sets(), round=await slot();
      const result=await post(10,group[10],round.slot_id);
      assert.equal(result.status,201);
      const row=result.data.booking;
      assert.equal(row.queue_number,'A001'); assert.equal(row.booking_status,'WAITING');
      assert.equal(row.student_code,'900010'); assert.equal(row.department_name,'ไอทีทดสอบ');
      assert.equal(row.education_level_name,'ปวส.1'); assert.equal(row.classroom_name,'1/1');
      assert.equal(row.booking_date,round.booking_date); assert.equal(row.books[0].book_code,'BOOKING01');
      assert.equal(row.created_at,'2030-01-01 09:00:00'); assert.equal(row.password,undefined); assert.equal(row.qr_code,undefined);
      assert.equal((await mine(10)).data.bookings[0].booking_id,row.booking_id);
      assert.deepEqual((await mine(20)).data.bookings,[]);
      const [[stored]]=await pool.execute('SELECT booking_status,qr_code FROM bookings WHERE booking_id=?',[row.booking_id]);
      assert.equal(stored.booking_status,'WAITING'); assert.match(stored.qr_code,/^BQ1:[A-F0-9]{64}$/);
      assert.equal((await slots.list()).find(s=>s.slot_id===round.slot_id).remaining,19);
      assert.equal((await post(10,group[10],round.slot_id)).status,409);
    });
    await t.test('Reject wrong department, level, classroom, missing set and empty set without consuming capacity',async()=>{
      const group=await sets(),round=await slot();
      for(const id of [20,30,40]) assert.equal((await post(10,group[id],round.slot_id)).status,403);
      assert.equal((await post(10,999999,round.slot_id)).status,403);
      const [empty]=await pool.query('INSERT INTO book_sets(department_id,education_level_id,classroom_id,semester,academic_year) VALUES(10,10,10,2,2580)');
      assert.equal((await post(10,empty.insertId,round.slot_id)).status,409);
      assert.equal((await slots.list()).find(s=>s.slot_id===round.slot_id).remaining,20);
    });
    await t.test('Reject closed, started, missing and full rounds using fresh server checks',async()=>{
      const group=await sets(),closed=await slot(1,'CLOSED'),full=await slot(1);
      assert.equal((await post(10,group[10],closed.slot_id)).status,409);
      assert.equal((await post(10,group[10],999999)).status,404);
      const [past]=await pool.query("INSERT INTO booking_slots(booking_date,start_time,end_time,max_students) VALUES('2030-01-01','09:00','09:30',20)");
      assert.equal((await post(10,group[10],past.insertId)).status,409);
      assert.equal((await post(20,group[20],full.slot_id)).status,201);
      assert.equal((await post(10,group[10],full.slot_id)).status,409);
    });
    await t.test('Concurrent requests for last seat across two groups never overbook',async()=>{
      const group=await sets(),round=await slot(1);
      const results=await Promise.all([post(10,group[10],round.slot_id),post(20,group[20],round.slot_id)]);
      assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);
      const [rows]=await pool.execute('SELECT booking_id FROM bookings WHERE slot_id=?',[round.slot_id]);
      assert.equal(rows.length,1);assert.equal((await slots.list()).find(s=>s.slot_id===round.slot_id).remaining,0);
    });
    await t.test('Concurrent different groups get distinct sequential numbers when capacity remains',async()=>{
      const group=await sets(),round=await slot(2);
      const results=await Promise.all([post(10,group[10],round.slot_id),post(20,group[20],round.slot_id)]);
      assert.deepEqual(results.map(row=>row.status),[201,201]);
      assert.deepEqual(results.map(row=>row.data.booking.queue_number).sort(),['A001','A002']);
    });
    await t.test('Same student and set submitted concurrently to different slots creates one booking',async()=>{
      const group=await sets(),a=await slot(),b=await slot();
      const results=await Promise.all([post(10,group[10],a.slot_id),post(10,group[10],b.slot_id)]);
      assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);
      const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM bookings WHERE student_id=10 AND book_set_id=?',[group[10]]);
      assert.equal(Number(count.total),1);
    });
    await t.test('Cancelled history allows rebooking without recycling queue; received booking still blocks duplicates',async()=>{
      const group=await sets(),round=await slot();
      const first=(await post(10,group[10],round.slot_id)).data.booking;
      await pool.execute("UPDATE bookings SET booking_status='CANCELLED' WHERE booking_id=?",[first.booking_id]);
      const second=await post(10,group[10],round.slot_id);
      assert.equal(second.status,201);assert.equal(second.data.booking.queue_number,'A002');
      await pool.execute("UPDATE bookings SET booking_status='RECEIVED' WHERE booking_id=?",[second.data.booking.booking_id]);
      assert.equal((await post(10,group[10],round.slot_id)).status,409);
      assert.equal((await slots.list()).find(row=>row.slot_id===round.slot_id).booked_count,1);
    });
    await t.test('Capacity reduction racing bookings cannot leave occupancy above capacity',async()=>{
      const group=await sets(),round=await slot(2);
      const results=await Promise.all([post(10,group[10],round.slot_id),post(20,group[20],round.slot_id),request('/api/admin/booking-slots/'+round.slot_id,'PUT',{booking_date:round.booking_date,start_time:round.start_time,end_time:round.end_time,max_students:1,status:'OPEN'},adminCookie)]);
      assert.ok(results.every(row=>[200,201,409].includes(row.status)));
      const current=(await slots.list()).find(row=>row.slot_id===round.slot_id);
      assert.ok(current.booked_count<=current.max_students);
    });
    await t.test('Receipt failure after insert rolls back booking and capacity',async()=>{
      const group=await sets(),round=await slot();
      const faulty={getConnection:async()=>{
        const connection=await pool.getConnection();
        return new Proxy(connection,{get(target,key){if(key==='execute')return (sql,params)=>{if(sql.startsWith('SELECT b.booking_id,'))throw new Error('Simulated receipt failure');return target.execute(sql,params);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
      }};
      await assert.rejects(createBookings(faulty,clock).create(10,{book_set_id:group[10],slot_id:round.slot_id}),/Simulated receipt failure/);
      assert.equal((await slots.list()).find(row=>row.slot_id===round.slot_id).booked_count,0);
      assert.equal((await post(10,group[10],round.slot_id)).data.booking.queue_number,'A001');
    });

  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase6_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
