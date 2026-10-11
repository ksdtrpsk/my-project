function createAdminRepository(pool) {
  return {
    async findCredentials(username) {
      const [rows] = await pool.execute('SELECT admin_id, password FROM admins WHERE username = ? LIMIT 1', [username]);
      return rows[0] || null;
    },
    async findProfile(id) {
      const [rows] = await pool.execute('SELECT admin_id, username, name FROM admins WHERE admin_id = ? LIMIT 1', [id]);
      return rows[0] || null;
    }
  };
}
module.exports = { createAdminRepository };
