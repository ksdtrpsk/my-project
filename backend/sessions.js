const { randomBytes } = require('node:crypto');
const COOKIE = 'book_queue_session';

function createSessions({ ttlMs = 3600000, now = Date.now, cookieName = COOKIE } = {}) {
  const sessions = new Map();
  let revision = 0;
  function tokenFrom(req) {
    const value = (req.headers.cookie || '').split(';').map(v => v.trim())
      .find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
  }
  function prune() {
    for (const [token, session] of sessions) if (session.expiresAt <= now()) sessions.delete(token);
  }
  return {
    revision() { return revision; },
    revokeAccount(studentId) {
      revision++;
      for (const [token, session] of sessions) if (session.studentId === studentId) sessions.delete(token);
    },
    read(req) {
      prune();
      return sessions.get(tokenFrom(req)) || null;
    },
    create(req, res, studentId) {
      prune();
      sessions.delete(tokenFrom(req));
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { studentId, expiresAt: now() + ttlMs });
      res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(ttlMs / 1000)}`);
    },
    destroy(req, res) {
      sessions.delete(tokenFrom(req));
      res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    }
  };
}
module.exports = { createSessions };
