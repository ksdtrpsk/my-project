const {createHash}=require('node:crypto');
const {problem,integer}=require('./catalog');
const {objectInput}=require('./validation');
const {hashPassword}=require('./passwords');
const {parseCsv,profileInput,groupInput,passwordInput}=require('./student-csv');
const PROFILE=['student_code','first_name','last_name','classroom_id','phone','email'];
const GROUP=['department_name','education_level_name','classroom_name'];
function version(row){return createHash('sha256').update(JSON.stringify(row)).digest('hex');}
function dbError(error){
 if(error.code==='ER_DUP_ENTRY')return problem(409,'รหัสนักศึกษานี้มีอยู่แล้ว ไม่มีการเขียนทับบัญชีเดิม');
 if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_NO_REFERENCED_ROW_2'].includes(error.code))return problem(409,'ข้อมูลเปลี่ยนหรือมีการทำรายการพร้อมกัน กรุณาโหลดแล้วลองใหม่');
 return error;
}
function createStudentManagement(pool){
 let importing=false;
 async function transaction(action){const c=await pool.getConnection();try{await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await c.beginTransaction();const result=await action(c);await c.commit();return result;}catch(e){await c.rollback();throw dbError(e);}finally{c.release();}}
 async function read(id,c=pool,lock=false){
  const [[row]]=await c.execute('SELECT student_id,student_code,first_name,last_name,department_id,education_level_id,classroom_id,phone,email FROM students WHERE student_id=?'+(lock?' FOR UPDATE':''),[integer(id,'รหัสรายการ')]);
  if(!row)throw problem(404,'ไม่พบนักศึกษา');return row;
 }
 async function history(id,c=pool){const [rows]=await c.execute('SELECT booking_id FROM bookings WHERE student_id=? LIMIT 1',[id]);return rows.length>0;}
 async function group(id,c){const [[row]]=await c.execute('SELECT classroom_id,department_id,education_level_id FROM classrooms WHERE classroom_id=? FOR SHARE',[integer(id,'กลุ่มเรียน')]);if(!row)throw problem(400,'ไม่พบกลุ่มเรียน กรุณาเลือกใหม่');return row;}
 async function ensureGroup(data,c){
  const [d]=await c.execute('INSERT INTO departments(department_name) VALUES(?) ON DUPLICATE KEY UPDATE department_id=LAST_INSERT_ID(department_id)',[data.department_name]);
  const [e]=await c.execute('INSERT INTO education_levels(education_level_name) VALUES(?) ON DUPLICATE KEY UPDATE education_level_id=LAST_INSERT_ID(education_level_id)',[data.education_level_name]);
  const [r]=await c.execute('INSERT INTO classrooms(department_id,education_level_id,classroom_name) VALUES(?,?,?) ON DUPLICATE KEY UPDATE classroom_id=LAST_INSERT_ID(classroom_id)',[d.insertId,e.insertId,data.classroom_name]);
  return {department_id:d.insertId,education_level_id:e.insertId,classroom_id:r.insertId};
 }
 async function insert(data,groupData,hash,c,mustChange=false){
  const [r]=await c.execute('INSERT INTO students(student_code,first_name,last_name,department_id,education_level_id,classroom_id,phone,email,password,must_change_password) VALUES(?,?,?,?,?,?,?,?,?,?)',[data.student_code,data.first_name,data.last_name,groupData.department_id,groupData.education_level_id,groupData.classroom_id,data.phone,data.email,hash,mustChange?1:0]);return r.insertId;
 }
 async function preview(csv,c=pool){
  const rows=parseCsv(csv),seen=new Set();
  for(const row of rows){
   if(seen.has(row.student_code))row.errors.push('รหัสซ้ำในไฟล์');seen.add(row.student_code);
   if(!row.errors.length){const [existing]=await c.execute('SELECT student_id FROM students WHERE student_code=?',[row.student_code]);if(existing.length)row.errors.push('มีรหัสนี้ในระบบแล้ว');
    const [groups]=await c.execute('SELECT c.classroom_id FROM classrooms c JOIN departments d ON d.department_id=c.department_id JOIN education_levels e ON e.education_level_id=c.education_level_id WHERE d.department_name=? AND e.education_level_name=? AND c.classroom_name=?',[row.department_name,row.education_level_name,row.classroom_name]);row.new_group=groups.length===0;}
  }
  return {rows,total:rows.length,valid:rows.every(r=>r.errors.length===0)};
 }
 return {
  async detail(id){const student=await read(id);return {student,version:version(student),has_bookings:await history(id)};},
  async create(body){objectInput(body,[...PROFILE,'password']);const data=profileInput(body),id=integer(body.classroom_id,'กลุ่มเรียน');const hash=await hashPassword(body.password===undefined?data.student_code:passwordInput(body.password));return transaction(async c=>{const g=await group(id,c);const studentId=await insert(data,g,hash,c,body.password===undefined||body.password===data.student_code);return {student:await read(studentId,c)};});},
  async update(id,body){
   objectInput(body,[...PROFILE,'version']);const data=profileInput(body);integer(body.classroom_id,'กลุ่มเรียน');
   if(typeof body.version!=='string'||! /^[a-f0-9]{64}$/.test(body.version))throw problem(400,'กรุณาเปิดข้อมูลนักศึกษาใหม่ก่อนแก้ไข');
   return transaction(async c=>{
    // Lock the same student row as booking creation before checking booking history.
    const old=await read(id,c,true);
    if(version(old)!==body.version)throw problem(409,'ข้อมูลถูกแก้ไขแล้ว กรุณาเปิดรายการใหม่');
    if((old.student_code!==data.student_code||old.classroom_id!==body.classroom_id)&&await history(id,c))throw problem(409,'นักศึกษามีประวัติจองแล้ว เปลี่ยนรหัสหรือกลุ่มเรียนไม่ได้ แต่แก้ชื่อและข้อมูลติดต่อได้');
    const g=await group(body.classroom_id,c);
    await c.execute('UPDATE students SET student_code=?,first_name=?,last_name=?,department_id=?,education_level_id=?,classroom_id=?,phone=?,email=? WHERE student_id=?',[data.student_code,data.first_name,data.last_name,g.department_id,g.education_level_id,g.classroom_id,data.phone,data.email,id]);
    return {student:await read(id,c)};
   });
  },
  async createGroup(body){objectInput(body,GROUP);return transaction(c=>ensureGroup(groupInput(body),c));},
  async preview(body){objectInput(body,['csv']);return preview(body.csv);},
  async import(body){
   objectInput(body,['csv','password']);if(body.password!==undefined)passwordInput(body.password);
   if(importing)throw problem(409,'กำลังนำเข้าไฟล์อื่น กรุณารอแล้วลองใหม่');
   importing=true;
   try{
    const check=await preview(body.csv);if(!check.valid)throw problem(400,'ข้อมูล CSV มีข้อผิดพลาด กรุณาตรวจไฟล์อีกครั้ง ยังไม่ได้บันทึก');
    const hashes=[];for(const row of check.rows)hashes.push(await hashPassword(body.password===undefined?row.student_code:body.password));
    return await transaction(async c=>{
     // Recheck inside the transaction; uniqueness also protects concurrent imports/creates.
     const current=await preview(body.csv,c);if(!current.valid)throw problem(409,'มีรหัสถูกเพิ่มระหว่างตรวจไฟล์ กรุณาตรวจไฟล์ใหม่ ยังไม่ได้บันทึก');
     for(let i=0;i<current.rows.length;i++){const row=current.rows[i];await insert(row,await ensureGroup(row,c),hashes[i],c,body.password===undefined||body.password===row.student_code);}
     return {created:current.total,message:'นำเข้าสำเร็จ '+current.total+' คน'};
    });
   }finally{importing=false;}
  }
 };
}
module.exports={createStudentManagement};
