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

test('Feature 1 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_feature1_test_' + randomBytes(8).toString('hex');
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



    const initial='InitialPassword-12345';
    const input=(code,room=10)=>({student_code:code,first_name:'นักศึกษาใหม่',last_name:'ทดสอบ',classroom_id:room,phone:'0812345678',email:'student@example.com',password:initial});
    const editBody=d=>{const s=d.student;return {student_code:s.student_code,first_name:s.first_name,last_name:s.last_name,classroom_id:s.classroom_id,phone:s.phone,email:s.email,version:d.version};};
    const detail=async id=>(await request('/api/admin/students/'+id,'GET',undefined,adminCookie)).data;
    const add=body=>request('/api/admin/students','POST',body,adminCookie);
    const header='student_code,first_name,last_name,department_name,education_level_name,classroom_name,phone,email';
    const csvRows=(...rows)=>header+'\r\n'+rows.join('\r\n');
    const row=(code,dept='สาขานำเข้า')=>`${code},นำเข้า,ทดสอบ,${dept},ปวส.2,2/1,,`;
    const preview=csv=>request('/api/admin/students/import/preview','POST',{csv},adminCookie);
    const upload=csv=>request('/api/admin/students/import','POST',{csv,password:initial},adminCookie);
    let id;
    await t.test('Admin creates account with leading zeros and new student logs in with hashed password',async()=>{
      const result=await add(input('001234'));assert.equal(result.status,201,JSON.stringify(result.data));id=result.data.student.student_id;
      assert.equal(result.data.student.student_code,'001234');assert.equal(result.data.student.department_id,10);assert.ok(!('password' in result.data.student));
      const [[stored]]=await pool.execute('SELECT password FROM students WHERE student_id=?',[id]);assert.match(stored.password,/^scrypt\$/);assert.notEqual(stored.password,initial);
      const login=await request('/api/auth/login','POST',{student_code:'001234',password:initial});assert.equal(login.status,200);assert.equal(login.data.student.classroom_id,10);
      assert.equal((await add(input('001234'))).status,409);
    });
    await t.test('Editing updates profile and group without changing password; stale edits are rejected',async()=>{
      const old=await detail(id);const body={...editBody(old),first_name:'ชื่อใหม่',classroom_id:20};
      const [[before]]=await pool.execute('SELECT password FROM students WHERE student_id=?',[id]);
      assert.equal((await request('/api/admin/students/'+id,'PUT',body,adminCookie)).status,200);
      assert.equal((await request('/api/admin/students/'+id,'PUT',body,adminCookie)).status,409);
      const [[after]]=await pool.execute('SELECT password,department_id FROM students WHERE student_id=?',[id]);assert.equal(after.password,before.password);assert.equal(after.department_id,20);
      const login=await request('/api/auth/login','POST',{student_code:'001234',password:initial});assert.equal(login.data.student.first_name,'ชื่อใหม่');assert.equal(login.data.student.department_id,20);
      const current=editBody(await detail(id));assert.equal((await request('/api/admin/students/'+id,'PUT',{...current,password:'NewPassword-123'},adminCookie)).status,400);
      assert.equal((await request('/api/admin/students/'+id,'PUT',{...current,student_code:'900010'},adminCookie)).status,409);
    });
    await t.test('All new endpoints require live admin and same origin; malformed input and unsupported methods fail',async()=>{
      const paths=['/api/admin/students','/api/admin/students/groups','/api/admin/students/import/preview','/api/admin/students/import'];
      for(const p of paths){assert.equal((await request(p,'POST',{})).status,401);assert.equal((await request(p,'POST',{},studentCookie)).status,403);assert.equal((await request(p,'POST',{},adminCookie,{Origin:'http://evil.invalid'})).status,403);}
      assert.equal((await request('/api/admin/students/'+id,'GET',undefined,studentCookie)).status,403);
      assert.equal((await request('/api/admin/students/'+id,'DELETE',{},adminCookie)).status,405);
      assert.equal((await request('/api/admin/students/reset-password','POST',{},adminCookie)).status,404);
      assert.equal((await request('/api/admin/students/999999','GET',undefined,adminCookie)).status,404);
      assert.equal((await request('/api/admin/students?role=admin','POST',input('12355'),adminCookie)).status,400);
      for(const bad of [{...input('1'),password:'short'},{...input('1'),classroom_id:999999},{...input('1'),student_code:123},{...input('1'),department_id:20},{...input('1'),email:'invalid'},{...input('1'),first_name:'x'.repeat(101)}])assert.equal((await add(bad)).status,400);
    });
    await t.test('New groups can be created and reused without duplicates',async()=>{
      const group={department_name:'สาขาใหม่',education_level_name:'ปวส.2',classroom_name:'ใหม่/1'};
      const a=await request('/api/admin/students/groups','POST',group,adminCookie),b=await request('/api/admin/students/groups','POST',group,adminCookie);
      assert.equal(a.status,201);assert.deepEqual(a.data.group,b.data.group);
      assert.equal((await add(input('001235',a.data.group.classroom_id))).status,201);
    });
    await t.test('Booking history locks group and student code, but allows corrected name/contact without changing QR or status',async()=>{
      const book=await catalog.createBook({book_code:'FEATURE1',book_name:'หนังสือทดสอบ'});
      const set=await catalog.saveSet(null,{department_id:20,education_level_id:10,classroom_id:20,semester:1,academic_year:2574,book_ids:[book.book_id]});
      const slot=await createSlots(pool,()=>Date.parse('2030-01-01T02:00:00Z')).save(null,{booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',max_students:10,status:'OPEN'});
      await createBookings(pool,()=>Date.parse('2030-01-01T02:00:00Z')).create(id,{book_set_id:set.book_set_id,slot_id:slot.slot_id});
      const d=await detail(id);assert.equal(d.has_bookings,true);const body=editBody(d);
      const [[before]]=await pool.execute('SELECT * FROM bookings WHERE student_id=?',[id]);
      for(const change of [{classroom_id:10},{student_code:'000999'}])assert.equal((await request('/api/admin/students/'+id,'PUT',{...body,...change},adminCookie)).status,409);
      assert.equal((await request('/api/admin/students/'+id,'PUT',{...body,phone:'0999999999'},adminCookie)).status,200);
      const [[after]]=await pool.execute('SELECT * FROM bookings WHERE student_id=?',[id]);assert.deepEqual(after,before);
      // Concurrent booking and group edit serialize on the same student row.
      const created=(await add(input('001236',20))).data.student;const candidate=editBody(await detail(created.student_id));
      const [booking,edit]=await Promise.allSettled([
        createBookings(pool,()=>Date.parse('2030-01-01T02:00:00Z')).create(created.student_id,{book_set_id:set.book_set_id,slot_id:slot.slot_id}),
        request('/api/admin/students/'+created.student_id,'PUT',{...candidate,classroom_id:10},adminCookie)
      ]);
      if(booking.status==='fulfilled')assert.equal(edit.value.status,409);else{assert.equal(booking.reason.status,403);assert.equal(edit.value.status,200);}
      await pool.execute("UPDATE bookings SET booking_status='CANCELLED' WHERE student_id=?",[id]);
      assert.equal((await request('/api/admin/students/'+id,'PUT',{...editBody(await detail(id)),classroom_id:10},adminCookie)).status,409);
    });
    await t.test('Preview is read only, identifies new groups, duplicates and invalid rows with source line numbers',async()=>{
      const [[before]]=await pool.query('SELECT COUNT(*) AS n FROM students');
      const good=await preview(csvRows(row('007001'),row('007002')));assert.equal(good.status,200);assert.equal(good.data.valid,true);assert.equal(good.data.rows[0].new_group,true);
      const [[after]]=await pool.query('SELECT COUNT(*) AS n FROM students');assert.equal(after.n,before.n);
      const [groups]=await pool.query("SELECT * FROM departments WHERE department_name='สาขานำเข้า'");assert.equal(groups.length,0);
      const bad=await preview(csvRows(row('007001'),row('007001'),row('001234'),'1e9,ชื่อ,สกุล,ไอที,ปวส.2,1,,'));
      assert.equal(bad.data.valid,false);assert.match(bad.data.rows[1].errors.join(),/ซ้ำ/);assert.match(bad.data.rows[2].errors.join(),/ระบบแล้ว/);assert.equal(bad.data.rows[3].row,5);
      assert.equal((await upload(csvRows(row('007001'),row('001234')))).status,400);
      const [none]=await pool.query("SELECT * FROM students WHERE student_code='007001'");assert.equal(none.length,0);
    });
    await t.test('CSV import creates accounts/groups atomically, distinct salts and usable logins; repeats never overwrite',async()=>{
      const csv=csvRows(row('007001'),row('007002','สาขานำเข้าอีกกลุ่ม'));
      const imported=await upload(csv);assert.equal(imported.status,201,JSON.stringify(imported.data));assert.equal(imported.data.created,2);
      const [students]=await pool.query("SELECT student_code,password,department_id FROM students WHERE student_code IN ('007001','007002') ORDER BY student_code");
      assert.equal(students.length,2);assert.notEqual(students[0].password,students[1].password);assert.notEqual(students[0].department_id,students[1].department_id);
      assert.equal((await request('/api/auth/login','POST',{student_code:'007001',password:initial})).status,200);
      assert.equal((await upload(csv)).status,400);assert.equal((await preview(csv)).data.valid,false);
    });
    await t.test('A database error on the second insert rolls back all imported students and new groups',async()=>{
      const {createStudentManagement}=require('../student-management');let inserts=0;
      const wrapped={execute:pool.execute.bind(pool),getConnection:async()=>{const connection=await pool.getConnection();return new Proxy(connection,{get(target,key){if(key==='execute')return async(sql,params)=>{if(sql.startsWith('INSERT INTO students')&&++inserts===2)throw new Error('simulated write failure');return target.execute(sql,params);};return typeof target[key]==='function'?target[key].bind(target):target[key];}});}};
      await assert.rejects(createStudentManagement(wrapped).import({csv:csvRows(row('008001','กลุ่มต้องย้อนกลับ'),row('008002','กลุ่มต้องย้อนกลับ')),password:initial}),/simulated/);
      const [students]=await pool.query("SELECT * FROM students WHERE student_code IN ('008001','008002')");assert.equal(students.length,0);
      const [groups]=await pool.query("SELECT * FROM departments WHERE department_name='กลุ่มต้องย้อนกลับ'");assert.equal(groups.length,0);
    });
    await t.test('Concurrent imports accept only one and a code added after preview is rejected',async()=>{
      const csv=csvRows(row('008101'),row('008102'));
      assert.equal((await preview(csv)).data.valid,true);
      await add(input('008101'));
      assert.equal((await upload(csv)).status,400);
      const parallel=csvRows(row('008201'),row('008202'));
      const results=await Promise.all([upload(parallel),upload(parallel)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      const [[count]]=await pool.query("SELECT COUNT(*) AS n FROM students WHERE student_code IN ('008201','008202')");assert.equal(count.n,2);
      await pool.query('DELETE FROM admins WHERE admin_id=10');assert.equal((await add(input('008999'))).status,401);
    });
  } finally {
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    if(pool)await pool.end();
    if(created&&/^bq_feature1_test_[a-f0-9]{16}$/.test(databaseName))await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
