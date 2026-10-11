const { integer, problem } = require('./catalog');
const { dateInput } = require('./slots');
const filterKeys = ['q','department_id','education_level_id','classroom_id','date','status'];
function bookingFilters(params) {
  const conditions=[], args=[];
  const q=(params.get('q') || '').trim();
  if (q.length>100 || /[\u0000-\u001f\u007f]/.test(q)) throw problem(400,'คำค้นหาต้องไม่เกิน 100 ตัวอักษรและไม่มีอักขระควบคุม');
  if(q){
    // Treat %, _ and ! as literal search text, never SQL wildcards.
    const pattern='%'+q.replace(/[!%_]/g,character=>'!'+character)+'%';
    conditions.push("(CONVERT(s.student_code USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!' OR CONCAT(s.first_name,' ',s.last_name) LIKE ? ESCAPE '!' OR CONVERT(b.queue_number USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!')");
    args.push(pattern,pattern,pattern);
  }
  for(const [key,column] of [['department_id','bs.department_id'],['education_level_id','bs.education_level_id'],['classroom_id','bs.classroom_id']]){
    const value=params.get(key);
    if(value!==null){
      if(!/^\d+$/.test(value))throw problem(400,'รหัสตัวกรองไม่ถูกต้อง');
      conditions.push(column+'=?');args.push(integer(Number(value),'รหัสตัวกรอง'));
    }
  }
  if(params.has('date')){conditions.push('sl.booking_date=?');args.push(dateInput(params.get('date')));}
  if(params.has('status')){
    const status=params.get('status');
    if(!['WAITING','CHECKED_IN','RECEIVED','CANCELLED','NO_SHOW'].includes(status))throw problem(400,'สถานะไม่ถูกต้อง');
    conditions.push('b.booking_status=?');args.push(status);
  }
  return {conditions,args};
}
module.exports={bookingFilters,filterKeys};

