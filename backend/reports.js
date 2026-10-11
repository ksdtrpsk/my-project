const { integer, problem } = require('./catalog');
const { bangkokNow } = require('./slots');
const { bookingFilters, filterKeys } = require('./booking-filters');
const reportTypes = {all:null,received:['RECEIVED'],pending:['WAITING','CHECKED_IN'],no_show:['NO_SHOW']};
const exportLimit = 10000;
const columns = [['booking_id','รหัสการจอง'],['student_code','รหัสนักศึกษา'],['first_name','ชื่อ'],['last_name','นามสกุล'],['department_name','สาขา'],['education_level_name','ระดับชั้น'],['classroom_name','ห้อง'],['book_set_id','รหัสชุดหนังสือ'],['semester','ภาคเรียน'],['academic_year','ปีการศึกษา พ.ศ.'],['booking_date','วันนัดรับ ค.ศ.'],['start_time','เวลาเริ่ม'],['end_time','เวลาสิ้นสุด'],['queue_number','เลขคิว'],['booking_status','สถานะ'],['created_at','เวลาจอง ประเทศไทย'],['received_at','เวลารับ ประเทศไทย']];
function reportInput(params, exporting=false) {
  const allowed = [...filterKeys,'report',...(exporting ? [] : ['page'])];
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw problem(400,'ตัวเลือกรายงานไม่ถูกต้อง');
  const report=params.get('report')??'all';
  if(!Object.hasOwn(reportTypes,report))throw problem(400,'ประเภทรายงานไม่ถูกต้อง');
  const pageText=params.get('page')??'1';
  if(!/^\d+$/.test(pageText))throw problem(400,'หน้าไม่ถูกต้อง');
  const page=integer(Number(pageText),'หน้า');
  if(page>1000000)throw problem(400,'หน้าเกินขอบเขต');
  const {conditions,args}=bookingFilters(params);
  if(reportTypes[report]){conditions.push('b.booking_status IN ('+reportTypes[report].map(()=>'?').join(',')+')');args.push(...reportTypes[report]);}
  return {report,page,where:conditions.length?' WHERE '+conditions.join(' AND '):'',args};
}
function csvCell(value) {
  let text=String(value??'');
  // Spreadsheet apps must not execute formulas supplied through database text.
  if (/^[\s\u200B-\u200F\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
function reportCsv(rows) {
  return '\uFEFF'+[columns.map(([,label])=>csvCell(label)).join(','),...rows.map(row=>columns.map(([key])=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';
}
function createReports(pool,now=Date.now) {
  return {
    async read(params,exporting=false) {
      const {report,page,where,args}=reportInput(params,exporting);
      const joins=`FROM bookings b JOIN students s ON s.student_id=b.student_id JOIN book_sets bs ON bs.book_set_id=b.book_set_id
        JOIN departments d ON d.department_id=bs.department_id JOIN education_levels e ON e.education_level_id=bs.education_level_id
        JOIN classrooms c ON c.classroom_id=bs.classroom_id JOIN booking_slots sl ON sl.slot_id=b.slot_id`;
      const connection=await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        const [[count]]=await connection.execute(`SELECT COUNT(*) AS total ${joins}${where}`,args);
        if(exporting && Number(count.total)>exportLimit)throw problem(413,'รายงานเกิน 10,000 รายการ กรุณากรองสาขา ห้อง หรือวันนัดรับให้แคบลง');
        const [rows]=await connection.execute(`SELECT b.booking_id,b.book_set_id,s.student_code,s.first_name,s.last_name,
          d.department_name,e.education_level_name,c.classroom_name,bs.semester,bs.academic_year,b.queue_number,b.booking_status,
          DATE_FORMAT(sl.booking_date,'%Y-%m-%d') AS booking_date,TIME_FORMAT(sl.start_time,'%H:%i:%s') AS start_time,TIME_FORMAT(sl.end_time,'%H:%i:%s') AS end_time,
          DATE_FORMAT(b.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,DATE_FORMAT(b.received_at,'%Y-%m-%d %H:%i:%s') AS received_at
          ${joins}${where} ORDER BY d.department_name,e.education_level_name,c.classroom_name,sl.booking_date,sl.start_time,b.booking_id
          LIMIT ${exporting?exportLimit:25} OFFSET ${exporting?0:(page-1)*25}`,args);
        await connection.commit();
        return {report,generated_at:bangkokNow(now()),total:Number(count.total),page,page_size:exporting?exportLimit:25,bookings:rows};
      } catch(error){await connection.rollback();throw error;}
      finally{connection.release();}
    }
  };
}
module.exports={createReports,reportInput,reportCsv,csvCell,exportLimit};
