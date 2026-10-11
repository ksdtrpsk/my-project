const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const { createSessions } = require('../sessions');
const { hashPassword, verifyPassword } = require('../passwords');
const { createStudentRepository } = require('../students');

let passwordHash;
const profile = { student_id: 7, student_code: '66309010001', first_name: 'ทดสอบ', last_name: 'นักศึกษา',
  department_id: 2, department_name: 'การบัญชี', education_level_id: 1, education_level_name: 'ปวส.2',
  classroom_id: 3, classroom_name: 'ปวส.2/3', phone: null, email: 'test@example.com' };
before(async () => { passwordHash = await hashPassword('Test-password-123'); });

async function fixture(t, overrides = {}) {
  const students = {
    findCredentials: async code => code === profile.student_code ? { student_id: 7, password: passwordHash } : null,
    findProfile: async id => id === 7 ? { ...profile } : null,
    ...overrides.students
  };
  const server = createServer({ students, sessions: overrides.sessions });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, options) => fetch(base + url, options);
  const post = (url, body, cookie = '', extraHeaders = {}) => request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...extraHeaders }, body: JSON.stringify(body)
  });
  const login = cookie => post('/api/auth/login', { student_code: profile.student_code, password: 'Test-password-123' }, cookie);
  return { request, post, login };
}
function cookieFrom(response) { return response.headers.get('set-cookie').split(';')[0]; }

test('scrypt: random salt, correct/wrong password, invalid stored hash', async () => {
  assert(await verifyPassword('Test-password-123', passwordHash));
  assert.equal(await verifyPassword('wrong', passwordHash), false);
  assert.equal(await verifyPassword('anything', 'TEST_ONLY_NOT_A_LOGIN_HASH'), false);
  assert.notEqual(await hashPassword('Test-password-123'), passwordHash);
  assert(passwordHash.length <= 255);
});

test('Login -> HttpOnly cookie -> own MySQL-shaped profile -> Logout -> 401', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('/api/auth/me')).status, 401);
  const response = await app.login();
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
  assert.match(header, /Path=\//); assert.match(header, /Max-Age=3600/);
  const cookie = cookieFrom(response);
  const data = await response.json();
  assert.deepEqual(data.student, profile);
  assert.equal(data.student.password, undefined);
  const me = await app.request('/api/auth/me?student_id=999', { headers: { Cookie: cookie } });
  assert.deepEqual((await me.json()).student, profile);
  assert.equal((await app.request('/profile.html', { headers: { Cookie: cookie } })).status, 200);
  const logout = await app.post('/api/auth/logout', {}, cookie);
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await app.request('/api/auth/me', { headers: { Cookie: cookie } })).status, 401);
  const page = await app.request('/profile.html', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(page.status, 302);
});

test('Wrong password and missing student return identical error, no session', async t => {
  const app = await fixture(t);
  const a = await app.post('/api/auth/login', { student_code: profile.student_code, password: 'wrong' });
  const b = await app.post('/api/auth/login', { student_code: '999', password: 'wrong' });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.headers.get('set-cookie'), null);
  assert.deepEqual(await a.json(), await b.json());
});

test('Expired, forged and replaced sessions are rejected', async t => {
  let now = 1000;
  const sessions = createSessions({ ttlMs: 1000, now: () => now });
  const app = await fixture(t, { sessions });
  const first = cookieFrom(await app.login());
  const second = cookieFrom(await app.login(first));
  assert.notEqual(first, second);
  assert.equal((await app.request('/api/auth/me', { headers: { Cookie: first } })).status, 401);
  assert.equal((await app.request('/api/auth/me', { headers: { Cookie: 'book_queue_session=' + 'f'.repeat(64) } })).status, 401);
  now = 2001;
  assert.equal((await app.request('/api/auth/me', { headers: { Cookie: second } })).status, 401);
});

test('Profile refresh comes from repository, missing account revokes session', async t => {
  let present = true;
  const app = await fixture(t, { students: { findProfile: async () => present ? { ...profile } : null } });
  const cookie = cookieFrom(await app.login());
  present = false;
  const response = await app.request('/api/auth/me', { headers: { Cookie: cookie } });
  assert.equal(response.status, 401); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('Input validation, methods, JSON and cross-origin requests', async t => {
  const app = await fixture(t);
  for (const body of [null, {}, { student_code: "' OR 1=1 --", password: 'x' }, { student_code: '123', password: [] }]) {
    assert.equal((await app.post('/api/auth/login', body)).status, 400);
  }
  assert.equal((await app.request('/api/auth/login')).status, 405);
  assert.equal((await app.request('/api/does-not-exist')).status, 404);
  assert.equal((await app.request('/api/auth/login', { method: 'POST', body: 'a=b' })).status, 415);
  assert.equal((await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await app.post('/api/auth/logout', {}, '', { Origin: 'https://other.example' })).status, 403);
  assert.equal((await app.post('/api/auth/login', { student_code: '123', password: 'x'.repeat(5000) })).status, 413);
});

test('Database failure returns 503 without leaking details', async t => {
  const app = await fixture(t, { students: { findCredentials: async () => { throw new Error('secret-password SQL host'); } } });
  const result = await app.login();
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /secret|SQL|host/);
});

test('Rate limit applies after ten failed password attempts', async t => {
  const app = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await app.post('/api/auth/login', { student_code: '999', password: 'wrong' })).status, 401);
  const result = await app.login();
  assert.equal(result.status, 429); assert(Number(result.headers.get('retry-after')) > 0);
});

test('Existing public UI and assets work; student pages require login', async t => {
  const app = await fixture(t);
  for (const url of ['/', '/index.html', '/admin-login.html', '/dashboard.html', '/assets/app.js', '/assets/styles.css']) {
    const result = await app.request(url); assert.equal(result.status, 200, url);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  for (const url of ['/home.html', '/my-booking.html', '/books.html', '/profile.html', '/PROFILE.HTML']) {
    assert.equal((await app.request(url, { redirect: 'manual' })).status, 302, url);
  }
  assert.equal((await app.request('/missing.html')).status, 404);
  assert.notEqual((await app.request('/.env')).status, 200);
});

test('Repository uses prepared parameters and profile SELECT excludes password', async () => {
  const calls = [];
  const repo = createStudentRepository({ execute: async (sql, values) => { calls.push({ sql, values }); return [[profile]]; } });
  await repo.findCredentials("' OR 1=1 --");
  await repo.findProfile(7);
  assert.deepEqual(calls[0].values, ["' OR 1=1 --"]);
  assert.doesNotMatch(calls[0].sql, /OR 1=1/);
  assert.deepEqual(calls[1].values, [7]);
  assert.doesNotMatch(calls[1].sql, /\bpassword\b/i);
  for (const name of ['classrooms', 'departments', 'education_levels']) assert(calls[1].sql.includes(name));
});
