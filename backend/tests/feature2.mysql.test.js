const {createPasswordManagement}=require('../password-management');
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

test('Feature 2 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_feature2_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog, directory:createStudentDirectory(pool), passwordManagement:createPasswordManagement(pool), announcements:createAnnouncements(pool,()=>Date.parse("2030-01-01T02:00:00Z")), reports:createReports(pool,()=>Date.parse('2030-01-01T02:00:00Z')), dashboard:createDashboard(pool,()=>Date.parse('2030-01-01T02:00:00Z')), pickup:createPickup(pool,()=>Date.parse('2030-01-01T02:00:00Z')), bookingQr: createBookingQr(pool), bookings: createBookings(pool, () => Date.parse('2030-01-01T02:00:00Z')), slots: createSlots(pool, () => Date.parse('2030-01-01T02:00:00Z')) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    const adminCookie=(await request('/api/admin/auth/login','POST',{username:'testadmin',password})).cookie;
    const studentCookie=(await request('/api/auth/login','POST',{student_code:'900010',password})).cookie;



    const loginStudent=async(code,pass=password)=>request('/api/auth/login','POST',{student_code:code,password:pass});
    const loginAdmin=async(pass=password)=>request('/api/admin/auth/login','POST',{username:'testadmin',password:pass});
    const body=(old,next)=>({current_password:old,new_password:next,confirm_password:next});
    const change=(data,cookie=studentCookie)=>request('/api/auth/password','POST',data,cookie);
    const reset=(data,cookie=adminCookie,id=20)=>request('/api/admin/students/'+id+'/password','POST',data,cookie);
    const readStudent=async id=>(await pool.execute('SELECT * FROM students WHERE student_id=?',[id]))[0][0];
    const studentTwoCookie=(await loginStudent('900020')).cookie;
    const secondDevice=(await loginStudent('900010')).cookie;
    let newStudentCookie;
    await t.test('Self change validates old password and confirmation without changing data on failure',async()=>{
      const before=await readStudent(10);
      assert.equal((await change(body('incorrect','StudentNew-12345'))).status,400);
      assert.equal((await change({...body(password,'StudentNew-12345'),confirm_password:'mismatch'})).status,400);
      assert.equal((await change(body(password,password))).status,400);
      assert.deepEqual(await readStudent(10),before);
      assert.equal((await request('/api/auth/me','GET',undefined,studentCookie)).status,200);
    });
    await t.test('Self change preserves bookings/QR and revokes all sessions of that student only',async()=>{
      const book=await catalog.createBook({book_code:'PASS2',book_name:'หนังสือทดสอบ'});
      const set=await catalog.saveSet(null,{department_id:10,education_level_id:10,classroom_id:10,semester:1,academic_year:2574,book_ids:[book.book_id]});
      const slot=await createSlots(pool,()=>Date.parse('2030-01-01T02:00:00Z')).save(null,{booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',max_students:10,status:'OPEN'});
      await createBookings(pool,()=>Date.parse('2030-01-01T02:00:00Z')).create(10,{book_set_id:set.book_set_id,slot_id:slot.slot_id});
      const [before]=await pool.query('SELECT * FROM bookings');const profileBefore=await readStudent(10);
      const result=await change(body(password,'StudentNew-12345'));assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.cookie,/book_queue_session=$/);
      for(const cookie of [studentCookie,secondDevice]){assert.equal((await request('/api/auth/me','GET',undefined,cookie)).status,401);assert.equal((await request('/my-booking.html','GET',undefined,cookie)).status,302);}
      assert.equal((await request('/api/auth/me','GET',undefined,studentTwoCookie)).status,200);
      assert.equal((await request('/api/admin/auth/me','GET',undefined,adminCookie)).status,200);
      assert.deepEqual((await pool.query('SELECT * FROM bookings'))[0],before);
      const after=await readStudent(10);assert.notEqual(after.password,profileBefore.password);assert.deepEqual({...after,password:null},{...profileBefore,password:null});
      assert.equal((await loginStudent('900010')).status,401);const login=await loginStudent('900010','StudentNew-12345');assert.equal(login.status,200);newStudentCookie=login.cookie;
      assert.equal((await request('/api/student/bookings','GET',undefined,newStudentCookie)).data.bookings.length,1);
    });
    await t.test('New endpoints reject unauthorized roles, cross-origin, query injection and unsupported methods',async()=>{
      const valid=body(password,'StudentReset-12345');
      assert.equal((await change(valid,'')).status,401);assert.equal((await change(valid,adminCookie)).status,401);
      assert.equal((await reset({...valid,student_code:'900020'},studentTwoCookie)).status,403);
      assert.equal((await reset({...valid,student_code:'900020'},'')).status,401);
      assert.equal((await request('/api/auth/password','POST',valid,newStudentCookie,{Origin:'http://evil.invalid'})).status,403);
      assert.equal((await request('/api/admin/students/20/password','POST',{...valid,student_code:'900020'},adminCookie,{'sec-fetch-site':'cross-site'})).status,403);
      assert.equal((await request('/api/auth/password','GET',undefined,newStudentCookie)).status,405);
      assert.equal((await request('/api/auth/password?student_id=20','POST',valid,newStudentCookie)).status,400);
      assert.equal((await change({...valid,student_id:20},newStudentCookie)).status,400);
    });
    await t.test('Admin reset requires admin password and matching student code; revokes target only',async()=>{
      const before=await readStudent(20),extra=(await loginStudent('900020')).cookie;
      assert.equal((await reset({...body('incorrect','StudentReset-12345'),student_code:'900020'})).status,400);
      assert.equal((await reset({...body(password,'StudentReset-12345'),student_code:'900999'})).status,409);
      assert.equal((await reset({...body(password,'StudentReset-12345'),student_code:'900020'},adminCookie,999999)).status,404);
      assert.equal((await reset({...body(password,'StudentReset-12345'),student_code:'900020'})).status,200);
      assert.equal((await request('/api/auth/me','GET',undefined,studentTwoCookie)).status,401);assert.equal((await request('/api/auth/me','GET',undefined,extra)).status,401);
      assert.equal((await request('/api/auth/me','GET',undefined,newStudentCookie)).status,200);assert.equal((await request('/api/admin/auth/me','GET',undefined,adminCookie)).status,200);
      assert.equal((await loginStudent('900020')).status,401);assert.equal((await loginStudent('900020','StudentReset-12345')).status,200);
      const after=await readStudent(20);assert.deepEqual({...after,password:null},{...before,password:null});
      assert.equal((await reset({...body(password,'StudentReset-12345'),student_code:'900020'})).status,400);
    });
    await t.test('Five failed password attempts are limited per account; malformed requests do not expose secrets',async()=>{
      const cookie=(await loginStudent('900040')).cookie,before=await readStudent(40);
      for(let i=0;i<5;i++)assert.equal((await change(body('wrong','AttemptPassword-123'),cookie)).status,400);
      assert.equal((await change(body(password,'AttemptPassword-123'),cookie)).status,429);
      assert.deepEqual(await readStudent(40),before);
    });
    await t.test('Concurrent self changes allow one result and do not issue sessions for the losing request',async()=>{
      const cookie=(await loginStudent('900030')).cookie;
      const results=await Promise.all([change(body(password,'ConcurrentNew-123'),cookie),change(body(password,'ConcurrentNew-456'),cookie)]);
      assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.some(r=>[400,401].includes(r.status)));
      const winning=results[0].status===200?'ConcurrentNew-123':'ConcurrentNew-456';assert.equal((await loginStudent('900030',winning)).status,200);
    });
    await t.test('A database failure after UPDATE rolls back password and leaves the existing session valid',async()=>{
      const before=await readStudent(10);
      const wrapped={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql,args)=>{const result=await target.execute(sql,args);if(sql.startsWith('UPDATE students SET password'))throw Error('simulated failure');return result;};return typeof target[key]==='function'?target[key].bind(target):target[key];}});}};
      await assert.rejects(createPasswordManagement(wrapped).change(10,body('StudentNew-12345','RollbackNew-123'),false,()=>{}),/simulated/);
      assert.deepEqual(await readStudent(10),before);assert.equal((await request('/api/auth/me','GET',undefined,newStudentCookie)).status,200);
    });
    await t.test('Default create/import use each student code, require first change and accept six-character new password',async()=>{
      const created=await request('/api/admin/students','POST',{student_code:'009001',first_name:'รหัสเริ่มต้น',last_name:'ทดสอบ',classroom_id:10},adminCookie);assert.equal(created.status,201);
      const logged=await loginStudent('009001','009001');assert.equal(logged.status,200);assert.equal(logged.data.student.must_change_password,1);
      for(const route of ['/api/student/book-sets','/api/student/bookings','/api/student/booking-slots','/api/student/announcements/latest','/api/student/bookings/1/qr']){const denied=await request(route,'GET',undefined,logged.cookie);assert.equal(denied.status,403);assert.equal(denied.data.code,'PASSWORD_CHANGE_REQUIRED');}
      assert.equal((await request('/api/student/bookings','POST',{book_set_id:1,slot_id:1},logged.cookie)).status,403);
      assert.equal((await change(body('009001','abcdef'),logged.cookie)).status,200);assert.equal((await loginStudent('009001','009001')).status,401);
      const changed=await loginStudent('009001','abcdef');assert.equal(changed.status,200);assert.equal(Boolean(changed.data.student.must_change_password),false);assert.equal((await request('/api/student/book-sets','GET',undefined,changed.cookie)).status,200);
      assert.equal((await change(body('abcdef','009001'),changed.cookie)).status,400);
      const csv='student_code,first_name,last_name,department_name,education_level_name,classroom_name\n009002,นำเข้า,หนึ่ง,ไอทีทดสอบ,ปวส.1,1/1\n009003,นำเข้า,สอง,ไอทีทดสอบ,ปวส.1,1/1';
      assert.equal((await request('/api/admin/students/import','POST',{csv},adminCookie)).status,201);
      for(const code of ['009002','009003'])assert.equal((await loginStudent(code,code)).data.student.must_change_password,1);
    });
    await t.test('Bulk reset verifies every student hash and preserves administrators, profile and bookings',async()=>{
      const {resetStudentPasswords}=require('../scripts/reset-student-passwords');const {migrateStudentPassword}=require('../scripts/migrate-student-password');const {verifyPassword}=require('../passwords');
      const [before]=await pool.query('SELECT * FROM students ORDER BY student_id'),[adminsBefore]=await pool.query('SELECT * FROM admins'),[bookingsBefore]=await pool.query('SELECT * FROM bookings');
      await migrateStudentPassword(pool);await migrateStudentPassword(pool);
      let writes=0;const wrapped={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql,args)=>{if(sql.startsWith('UPDATE students')&&++writes===2)throw Error('rollback test');return target.execute(sql,args);};return typeof target[key]==='function'?target[key].bind(target):target[key];}});}};
      await assert.rejects(resetStudentPasswords(wrapped),/rollback test/);assert.deepEqual((await pool.query('SELECT * FROM students ORDER BY student_id'))[0],before);
      assert.equal(await resetStudentPasswords(pool),before.length);
      const [after]=await pool.query('SELECT * FROM students ORDER BY student_id');for(let i=0;i<after.length;i++){assert(await verifyPassword(after[i].student_code,after[i].password));assert.equal(after[i].must_change_password,1);const {password:a,must_change_password:b,...other}=after[i];const {password:c,must_change_password:d,...prior}=before[i];assert.deepEqual(other,prior);}
      assert.deepEqual((await pool.query('SELECT * FROM admins'))[0],adminsBefore);assert.deepEqual((await pool.query('SELECT * FROM bookings'))[0],bookingsBefore);
    });
    await t.test('Admin can change own password with six-character minimum and must log in again',async()=>{
      const extra=(await loginAdmin()).cookie;
      const result=await request('/api/admin/auth/password','POST',body(password,'Adm123'),adminCookie);assert.equal(result.status,200);
      for(const cookie of [extra,adminCookie])assert.equal((await request('/api/admin/auth/me','GET',undefined,cookie)).status,401);
      assert.equal((await loginAdmin()).status,401);const login=await loginAdmin('Adm123');assert.equal(login.status,200);
      await pool.query('DELETE FROM admins WHERE admin_id=10');assert.equal((await reset({...body('Adm123','AnotherNew-123'),student_code:'900020'},login.cookie)).status,401);
    });
  } finally {
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    if(pool)await pool.end();
    if(created&&/^bq_feature2_test_[a-f0-9]{16}$/.test(databaseName))await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
