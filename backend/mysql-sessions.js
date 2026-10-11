const { randomBytes, createHash } = require('node:crypto');
const { problem } = require('./errors');
const digest = value => createHash('sha256').update(value).digest('hex');
function createMysqlSessions(pool, { ttlMs = 3600000, now = Date.now, role = 'student' } = {}) {
  if (!['student', 'admin'].includes(role)) throw Error('Invalid session role');
  const cookieName = role === 'admin' ? 'book_queue_admin_session' : 'book_queue_session';
  const table = role === 'admin' ? 'admins' : 'students';
  const key = role === 'admin' ? 'admin_id' : 'student_id';
  function tokenFrom(req) {
    const value = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(value || '') ? digest(value) : null;
  }
  function cookie(req, res, token, seconds) {
    res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${process.env.VERCEL === '1' || req.socket?.encrypted ? '; Secure' : ''}`);
  }
  return {
    async read(req, executor = pool) {
      const token = tokenFrom(req); if (!token) return null;
      const [[row]] = await executor.execute(`SELECT s.account_id, s.expires_at FROM app_sessions s JOIN ${table} a ON a.${key}=s.account_id WHERE s.token_hash=? AND s.role=? AND s.expires_at>? AND s.credential_hash=SHA2(a.password,256)`, [token, role, now()]);
      return row ? { studentId: row.account_id, expiresAt: Number(row.expires_at) } : null;
    },
    async create(req, res, accountId, verifiedPasswordHash) {
      const c = await pool.getConnection();
      const token = randomBytes(32).toString('hex');
      try {
        await c.beginTransaction();
        // Serialize issuance with password changes. Never issue from stale credentials.
        const [[account]] = await c.execute(`SELECT password FROM ${table} WHERE ${key}=? FOR UPDATE`, [accountId]);
        if (!account || account.password !== verifiedPasswordHash) throw problem(409, 'มีการเปลี่ยนรหัสผ่าน กรุณาเข้าสู่ระบบใหม่');
        await c.execute('DELETE FROM app_sessions WHERE token_hash=? AND role=?', [tokenFrom(req), role]);
        await c.execute('DELETE FROM app_sessions WHERE expires_at<=?', [now()]);
        await c.execute('INSERT INTO app_sessions (token_hash,role,account_id,credential_hash,expires_at) VALUES (?,?,?,?,?)', [digest(token), role, accountId, digest(account.password), now() + ttlMs]);
        await c.commit();
      } catch (error) { await c.rollback(); throw error; }
      finally { c.release(); }
      cookie(req, res, token, Math.floor(ttlMs / 1000));
    },
    async destroy(req, res) {
      const token = tokenFrom(req);
      if (token) await pool.execute('DELETE FROM app_sessions WHERE token_hash=? AND role=?', [token, role]);
      cookie(req, res, '', 0);
    },
    async revokeAccount(accountId) {
      await pool.execute('DELETE FROM app_sessions WHERE role=? AND account_id=?', [role, accountId]);
    }
  };
}
module.exports = { createMysqlSessions };
