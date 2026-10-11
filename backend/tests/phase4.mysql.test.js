const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { readConfig } = require('../config');
const { createDatabase, createStudentRepository } = require('../students');
const { createAdminRepository } = require('../admin');
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

test('Phase 4 real MySQL and HTTP integration (isolated database)', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async t => {
  const config = readConfig();
  const databaseName = 'bq_phase4_test_' + randomBytes(8).toString('hex');
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
    server = createServer({ students: createStudentRepository(pool), admins: createAdminRepository(pool), catalog });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie = '', extra = {}) {
      const response = await fetch(base + route, { method, redirect: 'manual', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('application/json') ? await response.json() : await response.text() };
    }
    let adminCookie;
    const studentCookies = {};
    await t.test('Real admin login and role-separated cookies', async () => {
      const wrong = await request('/api/admin/auth/login', 'POST', { username: 'testadmin', password: 'wrong' });
      assert.equal(wrong.status, 401);
      const admin = await request('/api/admin/auth/login', 'POST', { username: 'testadmin', password });
      assert.equal(admin.status, 200); assert.equal(admin.data.admin.admin_id, 10);
      assert.equal(admin.data.admin.password, undefined); assert.match(admin.cookie, /^book_queue_admin_session=/);
      adminCookie = admin.cookie;
      for (const id of [10,20,30,40]) {
        const student = await request('/api/auth/login', 'POST', { student_code: '9000' + id, password });
        assert.equal(student.status, 200); studentCookies[id] = student.cookie;
      }
      assert.equal((await request('/api/auth/me', 'GET', undefined, adminCookie)).status, 401);
      assert.equal((await request('/api/admin/auth/me', 'GET', undefined, studentCookies[10])).status, 401);
    });
    const adminRequest = (route, method = 'GET', body) => request('/api/admin/' + route, method, body, adminCookie);
    await t.test('Anonymous/student cannot mutate or inspect admin catalog', async () => {
      for (const route of ['books','book-sets','lookups']) {
        assert.equal((await request('/api/admin/' + route)).status, 401);
        assert.equal((await request('/api/admin/' + route, 'GET', undefined, studentCookies[10])).status, 403);
      }
      for (const method of ['POST','PUT','DELETE']) assert.equal((await request('/api/admin/books' + (method === 'POST' ? '' : '/10'), method, {}, studentCookies[10])).status, 403);
      assert.equal((await request('/admin-books.html', 'GET', undefined, studentCookies[10])).status, 302);
      assert.equal((await request('/dashboard.html', 'GET', undefined, adminCookie)).status, 200);
      const csrf = await request('/api/admin/books', 'POST', {}, adminCookie, { Origin: 'https://evil.example' });
      assert.equal(csrf.status, 403);
    });
    let bookA, bookB, bookC;
    await t.test('Create, search, edit, delete books with persisted Thai data', async () => {
      const a = await adminRequest('books', 'POST', { book_code: 'IT-01', book_name: 'พัฒนาเว็บไซต์', description: 'หนังสือทดสอบ' });
      assert.equal(a.status, 201); bookA = a.data.book.book_id;
      bookB = (await adminRequest('books', 'POST', { book_code: 'AC-01', book_name: 'บัญชีเบื้องต้น', description: null })).data.book.book_id;
      bookC = (await adminRequest('books', 'POST', { book_code: 'P%_01', book_name: 'หนังสือร่วม', description: '' })).data.book.book_id;
      const edited = await adminRequest('books/' + bookA, 'PUT', { book_code: 'IT-01', book_name: 'การพัฒนาเว็บไซต์', description: 'ฉบับแก้ไข' });
      assert.equal(edited.status, 200);
      assert.equal((await adminRequest('books?q=' + encodeURIComponent('เว็บไซต์'))).data.books[0].description, 'ฉบับแก้ไข');
      assert.equal((await adminRequest('books?q=' + encodeURIComponent('%_'))).data.books.length, 1);
      assert.equal((await adminRequest('books?q=' + encodeURIComponent("' OR 1=1 --"))).data.books.length, 0);
      const temporary = await adminRequest('books', 'POST', { book_code: 'DELETE', book_name: 'ลบทดสอบ' });
      assert.equal((await adminRequest('books/' + temporary.data.book.book_id, 'DELETE', {})).status, 200);
      assert.equal((await adminRequest('books?q=DELETE')).data.books.length, 0);
    });
    await t.test('Book validation, duplicate code and missing record', async () => {
      assert.equal((await adminRequest('books','POST',{book_code:'IT-01',book_name:'ซ้ำ'})).status,409);
      assert.equal((await adminRequest('books','POST',{book_code:'',book_name:'ว่าง'})).status,400);
      assert.equal((await adminRequest('books/999999','PUT',{book_code:'X',book_name:'ไม่มี'})).status,404);
      assert.equal((await adminRequest('books/999999','DELETE',{})).status,404);
    });
    const setData = (department, level, classroom, ids, semester = 1) => ({ department_id:department, education_level_id:level, classroom_id:classroom, semester, academic_year:2569, book_ids:ids });
    let itSet;
    await t.test('Create multi-book sets for two departments, rooms, levels and terms', async () => {
      const result = await adminRequest('book-sets','POST',setData(10,10,10,[bookA,bookC]));
      assert.equal(result.status,201); itSet = result.data.book_set.book_set_id;
      for (const data of [setData(20,10,20,[bookB]),setData(10,10,30,[bookC]),setData(10,20,40,[bookB]),setData(10,10,10,[bookC],2)]) assert.equal((await adminRequest('book-sets','POST',data)).status,201);
      const sets = (await adminRequest('book-sets')).data.book_sets;
      assert.equal(sets.length,5); assert.equal(sets.find(s=>s.book_set_id===itSet).books.length,2);
      const lookup = await adminRequest('lookups'); assert.equal(lookup.data.classrooms.length,4);
    });
    await t.test('Students see only sets matching their department, level AND classroom', async () => {
      for (const [id, expectedCount, classroom] of [[10,2,10],[20,1,20],[30,1,30],[40,1,40]]) {
        const response = await request('/api/student/book-sets','GET',undefined,studentCookies[id]);
        assert.equal(response.status,200); assert.equal(response.data.book_sets.length,expectedCount);
        assert(response.data.book_sets.every(s=>s.classroom_id===classroom));
      }
      assert.equal((await request('/api/student/book-sets?student_id=20','GET',undefined,studentCookies[10])).status,400);
      assert.equal((await request('/api/student/book-sets')).status,401);
    });
    await t.test('Reject duplicate/empty/invalid sets and rollback failed edits', async () => {
      assert.equal((await adminRequest('book-sets','POST',setData(10,10,10,[bookA]))).status,409);
      for (const data of [setData(10,10,10,[]),setData(10,10,10,[bookA,bookA]),setData(20,10,10,[bookA]),setData(10,10,10,[999999]),setData(10,10,10,[bookA],0)]) assert.equal((await adminRequest('book-sets','POST',data)).status,400);
      assert.equal((await adminRequest('book-sets/' + itSet,'PUT',setData(10,10,10,[999999]))).status,400);
      const sets = (await adminRequest('book-sets')).data.book_sets;
      assert.equal(sets.length,5); assert.equal(sets.find(s=>s.book_set_id===itSet).books.length,2);
    });
    await t.test('Prevent deleting referenced books; edit set atomically changes student list', async () => {
      assert.equal((await adminRequest('books/' + bookA,'DELETE',{})).status,409);
      assert.equal((await adminRequest('book-sets/' + itSet,'PUT',setData(10,10,10,[bookC]))).status,200);
      const own = (await request('/api/student/book-sets','GET',undefined,studentCookies[10])).data.book_sets;
      assert.equal(own.find(s=>s.book_set_id===itSet).books.length,1);
      assert.equal((await adminRequest('books/' + bookA,'DELETE',{})).status,200);
    });
    await t.test('Concurrent duplicate set requests create only one set', async () => {
      const results = await Promise.all([adminRequest('book-sets','POST',setData(20,10,20,[bookC],2)), adminRequest('book-sets','POST',setData(20,10,20,[bookC],2))]);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    });
    await t.test('Deletion removes set items; students without matching sets see empty list', async () => {
      const accountSet = (await adminRequest('book-sets')).data.book_sets.find(s=>s.classroom_id===30);
      assert.equal((await adminRequest('book-sets/' + accountSet.book_set_id,'DELETE',{})).status,200);
      assert.deepEqual((await request('/api/student/book-sets','GET',undefined,studentCookies[30])).data.book_sets,[]);
    });
    await t.test('Existing booking history protects set and book edits (SQL fixture only)', async () => {
      const [slot] = await pool.query("INSERT INTO booking_slots (booking_date,start_time,end_time,max_students) VALUES ('2026-09-15','09:00:00','09:30:00',20)");
      await pool.execute('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (?,?,?,?)',[10,slot.insertId,itSet,'TEST001']);
      assert.equal((await adminRequest('book-sets/' + itSet,'DELETE',{})).status,409);
      assert.equal((await adminRequest('book-sets/' + itSet,'PUT',setData(10,10,10,[bookB]))).status,409);
      assert.equal((await adminRequest('books/' + bookC,'PUT',{book_code:'NEW',book_name:'เปลี่ยนไม่ได้'})).status,409);
    });
    await t.test('Admin logout revokes admin access without revoking student session', async () => {
      assert.equal((await request('/api/admin/auth/logout','POST',{},adminCookie)).status,200);
      assert.equal((await adminRequest('books')).status,401);
      assert.equal((await request('/api/auth/me','GET',undefined,studentCookies[10])).status,200);
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (pool) await pool.end();
    // Only remove this run's randomly named fixture database, never the configured DB.
    if (created && /^bq_phase4_test_[a-f0-9]{16}$/.test(databaseName)) await management.query(`DROP DATABASE \`${databaseName}\``);
    await management.end();
  }
});
