const { integer, problem } = require('./catalog');
const { bangkokNow, dateInput } = require('./slots');
const { createBookings } = require('./bookings');

const { bookingFilters, filterKeys } = require('./booking-filters');
const dimensions = {
  department: { key: 'bs.department_id', label: 'd.department_name' },
  level: { key: 'bs.education_level_id', label: 'e.education_level_name' },
  classroom: { key: 'bs.classroom_id', label: "CONCAT(d.department_name,' / ',e.education_level_name,' / ',c.classroom_name)" },
  date: { key: "DATE_FORMAT(sl.booking_date,'%Y-%m-%d')", label: "DATE_FORMAT(sl.booking_date,'%Y-%m-%d')" },
  book_set: { key: 'b.book_set_id', label: "CONCAT(d.department_name,' / ',e.education_level_name,' / ',c.classroom_name,' / เทอม ',bs.semester,' / ',bs.academic_year)" }
};
const joins = `FROM bookings b JOIN students s ON s.student_id=b.student_id
  JOIN book_sets bs ON bs.book_set_id=b.book_set_id JOIN departments d ON d.department_id=bs.department_id
  JOIN education_levels e ON e.education_level_id=bs.education_level_id JOIN classrooms c ON c.classroom_id=bs.classroom_id
  JOIN booking_slots sl ON sl.slot_id=b.slot_id`;
const counts = `COUNT(*) AS total, COUNT(DISTINCT b.student_id) AS students,
  COALESCE(SUM(b.booking_status='RECEIVED'),0) AS received,
  COALESCE(SUM(b.booking_status IN ('WAITING','CHECKED_IN')),0) AS pending,
  COALESCE(SUM(b.booking_status='CANCELLED'),0) AS cancelled,
  COALESCE(SUM(b.booking_status='NO_SHOW'),0) AS no_show`;
function options(params, listing = false) {
  const allowed = listing ? ['group_by','group_id','page', ...filterKeys] : ['group_by'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw problem(400,'ตัวเลือกไม่ถูกต้อง');
  const group = params.get('group_by') || 'department';
  if (!Object.hasOwn(dimensions,group)) throw problem(400,'กลุ่มไม่ถูกต้อง');
  const id = params.get('group_id');
  if (id !== null && !params.has('group_by')) throw problem(400,'ระบุ group_by คู่กับ group_id');
  let value = null;
  if (id !== null) value = group === 'date' ? dateInput(id) : /^\d+$/.test(id) ? integer(Number(id),'รหัสกลุ่ม') : (()=>{throw problem(400,'รหัสกลุ่มไม่ถูกต้อง');})();
  const pageText = params.get('page') || '1';
  if (!/^\d+$/.test(pageText)) throw problem(400,'หน้าไม่ถูกต้อง');
  const page = integer(Number(pageText),'หน้า');
  if (page > 1000000) throw problem(400,'หน้าเกินขอบเขต');
  return { group, value, page };
}
function numbers(row) {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => ['total','students','today','received','pending','cancelled','no_show'].includes(key) ? [key,Number(value)] : [key,value]));
}
function createDashboard(pool, now = Date.now) {
  async function snapshot(read) {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.beginTransaction();
      const result = await read(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  return {
    async summary(params) {
      const {group} = options(params);
      const dimension = dimensions[group];
      const generatedAt = bangkokNow(now());
      const today = generatedAt.slice(0,10);
      return snapshot(async connection => {
        const [[totals]] = await connection.execute(`SELECT ${counts},COALESCE(SUM(sl.booking_date=?),0) AS today ${joins}`, [today]);
        const [groups] = await connection.query(`SELECT ${dimension.key} AS group_id,${dimension.label} AS label,${counts} ${joins} GROUP BY ${dimension.key},${dimension.label} ORDER BY label,group_id`);
        return { generated_at:generatedAt, today, group_by:group, totals:numbers(totals), groups:groups.map(numbers) };
      });
    },
    async list(params) {
      const {group,value,page} = options(params,true);
      const {conditions,args}=bookingFilters(params);
      if(value!==null){conditions.push(dimensions[group].key+'=?');args.push(value);}
      const where=conditions.length ? ' WHERE '+conditions.join(' AND ') : '';
      return snapshot(async connection => {
        const [[count]] = await connection.execute(`SELECT COUNT(*) AS total ${joins}${where}`,args);
        // Offset is bounded and validated; user values stay in prepared parameters.
        const [rows] = await connection.execute(`SELECT b.booking_id,b.queue_number,b.booking_status,s.student_code,s.first_name,s.last_name,
          d.department_name,e.education_level_name,c.classroom_name,bs.semester,bs.academic_year,
          DATE_FORMAT(sl.booking_date,'%Y-%m-%d') AS booking_date,TIME_FORMAT(sl.start_time,'%H:%i:%s') AS start_time,TIME_FORMAT(sl.end_time,'%H:%i:%s') AS end_time
          ${joins}${where} ORDER BY sl.booking_date DESC,sl.start_time DESC,b.booking_id DESC LIMIT 25 OFFSET ${(page-1)*25}`,args);
        return { bookings:rows,total:Number(count.total),page,page_size:25 };
      });
    },
    async detail(id) {
      id = integer(id,'รหัสการจอง');
      return snapshot(async connection => {
        const [[owner]] = await connection.execute('SELECT student_id FROM bookings WHERE booking_id=?',[id]);
        if (!owner) throw problem(404,'ไม่พบการจอง');
        const [receipt] = await createBookings(pool,now).list(owner.student_id,connection,id);
        return receipt;
      });
    }
  };
}
module.exports = { createDashboard, options };
