const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { readConfig } = require('../config');
const { createDatabase, createStudentRepository } = require('../students');
const { createAdminRepository } = require('../admin');
const { createSlots } = require('../slots');
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

test('Phase 5 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase5_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    const adminCookie = (await request('/api/admin/auth/login','POST',{username:'testadmin',password})).cookie;
    const studentCookie = (await request('/api/auth/login','POST',{student_code:'900010',password})).cookie;
    const adminRequest = (route = '', method = 'GET', body) => request('/api/admin/booking-slots' + route, method, body, adminCookie);
    const studentRequest = (route = '') => request('/api/student/booking-slots' + route, 'GET', undefined, studentCookie);
    const data = { booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',max_students:20,status:'OPEN' };
    let slotId;
    await t.test('Slot routes enforce role, login, methods, JSON and same-origin mutation', async () => {
      assert.equal((await request('/api/admin/booking-slots')).status,401);
      assert.equal((await request('/api/student/booking-slots')).status,401);
      for (const [route,method] of [['','GET'],['','POST'],['/1','PUT'],['/1','DELETE'],['/1/status','PATCH']]) assert.equal((await request('/api/admin/booking-slots'+route,method,method==='GET'?undefined:data,studentCookie)).status,403);
      assert.equal((await request('/api/student/booking-slots','POST',data,studentCookie)).status,405);
      assert.equal((await request('/api/admin/booking-slots','POST',data,adminCookie,{Origin:'https://example.org'})).status,403);
      assert.equal((await request('/admin-slots.html','GET',undefined,studentCookie)).status,302);
      assert.equal((await request('/booking-slots.html')).status,302);
      assert.equal((await request('/admin-slots.html','GET',undefined,adminCookie)).status,200);
      assert.equal((await request('/booking-slots.html','GET',undefined,studentCookie)).status,200);
      assert.equal((await request('/api/admin/booking-slots','POST',data,adminCookie,{'Content-Type':'text/plain'})).status,415);
    });
    await t.test('Admin creates and edits a round; student sees date, capacity and available count', async () => {
      const created = await adminRequest('','POST',data);
      assert.equal(created.status,201); slotId=created.data.slot.slot_id;
      assert.equal(created.data.slot.booking_date,'2031-09-15');
      assert.equal(created.data.slot.start_time,'09:00:00');
      assert.equal(created.data.slot.booked_count,0); assert.equal(created.data.slot.remaining,20);
      assert.equal(created.data.slot.availability,'AVAILABLE');
      assert.equal((await adminRequest('/'+slotId,'PUT',{...data,max_students:25})).status,200);
      const rows=(await studentRequest()).data.slots;
      assert.equal(rows.find(row=>row.slot_id===slotId).remaining,25);
      assert.equal(JSON.stringify(rows).includes('student_code'),false);
    });
    await t.test('Invalid dates, past starts, capacity and duplicate rounds are rejected', async () => {
      for(const patch of [{booking_date:'2031-02-29'},{booking_date:'2020-01-01'},{start_time:'25:00'},{end_time:'08:00'},{max_students:0},{max_students:65536},{status:'INVALID'}]) assert.equal((await adminRequest('','POST',{...data,...patch})).status,400);
      assert.equal((await adminRequest('','POST',data)).status,409);
      assert.equal((await adminRequest('/999999','PUT',data)).status,404);
      assert.equal((await adminRequest('/0','DELETE',{})).status,400);
      assert.equal((await studentRequest('?date=2031-02-29')).status,400);
      assert.equal((await studentRequest('?student_id=20')).status,400);
      assert.equal((await studentRequest('?date=2031-09-15&date=2031-09-16')).status,400);
    });
    await t.test('Open and close round persist without changing capacity', async () => {
      assert.equal((await adminRequest('/'+slotId+'/status','PATCH',{status:'CLOSED'})).data.slot.availability,'CLOSED');
      assert.equal((await studentRequest()).data.slots.find(row=>row.slot_id===slotId).status,'CLOSED');
      assert.equal((await adminRequest('/'+slotId+'/status','PATCH',{status:'OPEN'})).data.slot.remaining,25);
      assert.equal((await adminRequest('/'+slotId+'/status','PATCH',{status:'BAD'})).status,400);
    });
    await t.test('Counts exclude cancellation and protect booked dates, capacity and history', async () => {
      const book = await catalog.createBook({book_code:'SLOT-TEST',book_name:'ทดสอบรอบ'});
      const set = await catalog.saveSet(null,{department_id:10,education_level_id:10,classroom_id:10,semester:1,academic_year:2574,book_ids:[book.book_id]});
      // SQL fixtures only: no booking endpoint is implemented in Phase 5.
      for(const [studentId,status] of [[10,'WAITING'],[20,'CHECKED_IN'],[30,'CANCELLED']]) await pool.execute('INSERT INTO bookings(student_id,slot_id,book_set_id,queue_number,booking_status) VALUES(?,?,?,?,?)',[studentId,slotId,set.book_set_id,'S'+studentId,status]);
      let row=(await studentRequest()).data.slots.find(row=>row.slot_id===slotId);
      assert.equal(row.booked_count,2);assert.equal(row.remaining,23);
      assert.equal((await adminRequest('/'+slotId,'PUT',{...data,max_students:1})).status,409);
      assert.equal((await adminRequest('/'+slotId,'PUT',{...data,booking_date:'2031-09-16'})).status,409);
      assert.equal((await adminRequest('/'+slotId,'DELETE',{})).status,409);
      assert.equal((await adminRequest('/'+slotId,'PUT',{...data,max_students:2})).status,200);
      row=(await studentRequest()).data.slots.find(row=>row.slot_id===slotId);
      assert.equal(row.remaining,0);assert.equal(row.availability,'FULL');
      await pool.execute("UPDATE bookings SET booking_status='CANCELLED' WHERE slot_id=? AND student_id=10",[slotId]);
      row=(await studentRequest()).data.slots.find(row=>row.slot_id===slotId);
      assert.equal(row.remaining,1);assert.equal(row.availability,'AVAILABLE');
      await pool.execute("UPDATE bookings SET booking_status='CANCELLED' WHERE slot_id=?",[slotId]);
      assert.equal((await adminRequest('/'+slotId,'DELETE',{})).status,409);
    });
    await t.test('Date filters and Thailand start boundary hide older days and disable started rounds', async () => {
      await pool.query("INSERT INTO booking_slots(booking_date,start_time,end_time,max_students) VALUES('2029-12-31','09:00','09:30',20),('2030-01-01','08:59','09:30',20),('2030-01-01','09:00','09:30',20),('2030-01-01','09:01','09:30',20)");
      const rows=(await studentRequest('?date=2030-01-01')).data.slots;
      assert.deepEqual(rows.map(row=>row.availability),['PAST','PAST','AVAILABLE']);
      assert.equal((await studentRequest('?date=2029-12-31')).data.slots.length,0);
      assert.equal((await adminRequest('?date=2029-12-31')).data.slots.length,1);
      const past=rows[0];
      assert.equal((await adminRequest('/'+past.slot_id+'/status','PATCH',{status:'CLOSED'})).status,200);
      assert.equal((await adminRequest('/'+past.slot_id+'/status','PATCH',{status:'OPEN'})).status,400);
    });
    await t.test('Concurrent duplicate requests create exactly one round; unused round can be deleted', async () => {
      const results=await Promise.all([adminRequest('','POST',{...data,start_time:'10:00',end_time:'10:30'}),adminRequest('','POST',{...data,start_time:'10:00',end_time:'10:30'})]);
      assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);
      const id=results.find(row=>row.status===201).data.slot.slot_id;
      assert.equal((await adminRequest('/'+id,'DELETE',{})).status,200);
      assert.equal((await studentRequest()).data.slots.some(row=>row.slot_id===id),false);
      assert.equal((await adminRequest('/'+id,'DELETE',{})).status,404);
    });

  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase5_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
