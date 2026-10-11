const { integer, problem } = require('./catalog');
const {objectInput}=require('./validation');

// Compare calendar/time strings in Thailand, independent of the server OS timezone.
function bangkokNow(now = Date.now()) {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
function dateInput(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || value < '1000-01-01' || value > '9999-12-31'
    || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw problem(400, 'วันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD ค.ศ.');
  return value;
}
function statusInput(value) {
  if (!['OPEN', 'CLOSED'].includes(value)) throw problem(400, 'สถานะต้องเป็น OPEN หรือ CLOSED');
  return value;
}
function slotInput(body) {
  objectInput(body,['booking_date','start_time','end_time','max_students','status']);
  const result = { booking_date: dateInput(body.booking_date), status: statusInput(body.status) };
  for (const key of ['start_time', 'end_time']) {
    if (typeof body[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body[key])) throw problem(400, 'เวลาต้องอยู่ระหว่าง 00:00 ถึง 23:59:59');
    result[key] = body[key].length === 5 ? body[key] + ':00' : body[key];
  }
  if (result.start_time >= result.end_time) throw problem(400, 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มในวันเดียวกัน');
  result.max_students = integer(body.max_students, 'จำนวนที่รับได้');
  if (result.max_students > 65535) throw problem(400, 'จำนวนที่รับได้ต้องอยู่ระหว่าง 1–65535 คน');
  return result;
}
function createSlots(pool, now = Date.now) {
  const columns = `s.slot_id, DATE_FORMAT(s.booking_date, '%Y-%m-%d') AS booking_date,
    TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time, TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
    s.max_students, s.status,
    (SELECT COUNT(*) FROM bookings b WHERE b.slot_id=s.slot_id AND b.booking_status <> 'CANCELLED') AS booked_count,
    EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.slot_id) AS has_bookings`;
  function decorate(row) {
    const booked_count = Number(row.booked_count);
    const remaining = Math.max(0, row.max_students - booked_count);
    const started = row.booking_date + ' ' + row.start_time <= bangkokNow(now());
    const availability = row.status === 'CLOSED' ? 'CLOSED' : started ? 'PAST' : remaining === 0 ? 'FULL' : 'AVAILABLE';
    return { ...row, booked_count, remaining, has_bookings: Boolean(row.has_bookings), availability };
  }
  async function list({ student = false, date } = {}) {
    if (date !== undefined) dateInput(date);
    const where = [], params = [];
    if (student) { where.push('s.booking_date >= ?'); params.push(bangkokNow(now()).slice(0, 10)); }
    if (date !== undefined) { where.push('s.booking_date = ?'); params.push(date); }
    const [rows] = await pool.execute(`SELECT ${columns} FROM booking_slots s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.booking_date, s.start_time, s.slot_id`, params);
    return rows.map(decorate);
  }
  function future(data) {
    if (data.booking_date + ' ' + data.start_time <= bangkokNow(now())) throw problem(400, 'รอบต้องเริ่มหลังเวลาปัจจุบันตามเวลาประเทศไทย');
  }
  async function transaction(action) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await action(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') throw problem(409, 'มีรอบวันและเวลาเดียวกันแล้ว');
      if (error.code === 'ER_ROW_IS_REFERENCED_2') throw problem(409, 'รอบนี้มีประวัติการจอง ลบไม่ได้');
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw problem(409, 'มีการแก้ไขพร้อมกัน กรุณาลองใหม่');
      throw error;
    } finally { connection.release(); }
  }
  async function locked(connection, id) {
    // Acquire the slot first, then read current bookings after any wait for a booking commit.
    const [[row]] = await connection.execute("SELECT slot_id,DATE_FORMAT(booking_date,'%Y-%m-%d') AS booking_date,TIME_FORMAT(start_time,'%H:%i:%s') AS start_time,TIME_FORMAT(end_time,'%H:%i:%s') AS end_time,max_students,status FROM booking_slots WHERE slot_id=? FOR UPDATE", [id]);
    if (!row) throw problem(404, 'ไม่พบรอบรับหนังสือ');
    const [history] = await connection.execute('SELECT booking_status FROM bookings WHERE slot_id=? FOR UPDATE', [id]);
    return decorate({ ...row, booked_count: history.filter(item => item.booking_status !== 'CANCELLED').length, has_bookings: history.length > 0 });
  }
  return {
    list,
    async save(id, body) {
      const data = slotInput(body);
      future(data);
      return transaction(async connection => {
        if (id !== null) {
          const old = await locked(connection, id);
          if (old.has_bookings && ['booking_date', 'start_time', 'end_time'].some(key => old[key] !== data[key])) throw problem(409, 'รอบมีประวัติการจองแล้ว เปลี่ยนวันหรือเวลาไม่ได้');
          if (data.max_students < old.booked_count) throw problem(409, 'จำนวนที่รับได้ต้องไม่น้อยกว่าจำนวนจองที่ยังไม่ยกเลิก');
          await connection.execute('UPDATE booking_slots SET booking_date=?, start_time=?, end_time=?, max_students=?, status=? WHERE slot_id=?', [data.booking_date, data.start_time, data.end_time, data.max_students, data.status, id]);
        } else {
          const [result] = await connection.execute('INSERT INTO booking_slots (booking_date,start_time,end_time,max_students,status) VALUES (?,?,?,?,?)', [data.booking_date, data.start_time, data.end_time, data.max_students, data.status]);
          id = result.insertId;
        }
        return locked(connection, id);
      });
    },
    async setStatus(id, body) {
      objectInput(body,['status']);
      const status = statusInput(body.status);
      return transaction(async connection => {
        const row = await locked(connection, id);
        if (status === 'OPEN') future(row);
        await connection.execute('UPDATE booking_slots SET status=? WHERE slot_id=?', [status, id]);
        return locked(connection, id);
      });
    },
    async remove(id) {
      return transaction(async connection => {
        const row = await locked(connection, id);
        if (row.has_bookings) throw problem(409, 'รอบนี้มีประวัติการจอง ลบไม่ได้ กรุณาปิดรอบแทน');
        await connection.execute('DELETE FROM booking_slots WHERE slot_id=?', [id]);
      });
    }
  };
}
module.exports = { createSlots, slotInput, dateInput, bangkokNow };
