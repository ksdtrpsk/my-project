const { requestOrigin } = require('./request-origin');
const {hashPassword,verifyPassword}=require('./passwords');
const {problem,integer}=require('./catalog');
const {objectInput,queryInput}=require('./validation');
const {readJson,json}=require('./auth');

function passwordChangeInput(body,admin=false,reset=false){
 objectInput(body,['current_password','new_password','confirm_password',...(reset?['student_code']:[])]);
 const minimum=6;
 if(typeof body.current_password!=='string'||body.current_password.length<1||body.current_password.length>128)throw problem(400,'กรอกรหัสผ่านปัจจุบันให้ถูกต้อง');
 if(typeof body.new_password!=='string'||body.new_password.length<minimum||body.new_password.length>128||!body.new_password.trim())throw problem(400,`รหัสผ่านใหม่ต้องยาว ${minimum}–128 ตัวอักษร`);
 if(body.confirm_password!==body.new_password)throw problem(400,'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
 if(reset&&(typeof body.student_code!=='string'||!/^\d{1,20}$/.test(body.student_code)))throw problem(400,'กรุณาเปิดข้อมูลนักศึกษาใหม่');
 return body;
}
function createPasswordManagement(pool){
 async function write(action){
  const c=await pool.getConnection();
  try{await c.beginTransaction();const result=await action(c);await c.commit();return result;}
  catch(e){await c.rollback();if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code))throw problem(409,'มีการเปลี่ยนข้อมูลพร้อมกัน กรุณาลองใหม่');throw e;}
  finally{c.release();}
 }
 return {
  async change(id,body,admin,authorize){
   const data=passwordChangeInput(body,admin);integer(id,'บัญชี');
   // Identifiers come only from this internal role flag, never from request data.
   const table=admin?'admins':'students',key=admin?'admin_id':'student_id';
   return write(async c=>{
    const [[account]]=await c.execute(`SELECT password${admin?'':',student_code'} FROM ${table} WHERE ${key}=? FOR UPDATE`,[id]);
    if(!account)throw problem(401,'กรุณาเข้าสู่ระบบใหม่');
    if(!await verifyPassword(data.current_password,account.password))throw problem(400,'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    if(data.new_password===data.current_password)throw problem(400,'รหัสผ่านใหม่ต้องต่างจากรหัสเดิม');
    if(!admin&&data.new_password===account.student_code)throw problem(400,'รหัสผ่านใหม่ต้องไม่ใช่รหัสนักศึกษา');
    const hash=await hashPassword(data.new_password);authorize();
    await c.execute(`UPDATE ${table} SET password=?${admin?'':',must_change_password=0'} WHERE ${key}=?`,[hash,id]);
   });
  },
  async reset(adminId,studentId,body,authorize){
   const data=passwordChangeInput(body,true,true);integer(studentId,'นักศึกษา');
   return write(async c=>{
    // Admin first, student second. Self changes lock just their own row.
    const [[actor]]=await c.execute('SELECT password FROM admins WHERE admin_id=? FOR UPDATE',[adminId]);
    if(!actor)throw problem(401,'กรุณาเข้าสู่ระบบใหม่');
    if(!await verifyPassword(data.current_password,actor.password))throw problem(400,'รหัสผ่านปัจจุบันของเจ้าหน้าที่ไม่ถูกต้อง');
    const [[target]]=await c.execute('SELECT student_code,password FROM students WHERE student_id=? FOR UPDATE',[studentId]);
    if(!target)throw problem(404,'ไม่พบนักศึกษา');
    if(target.student_code!==data.student_code)throw problem(409,'ข้อมูลนักศึกษาเปลี่ยนไป กรุณาเปิดรายการใหม่');
    if(await verifyPassword(data.new_password,target.password))throw problem(400,'รหัสผ่านใหม่ต้องต่างจากรหัสเดิมของนักศึกษา');
    const hash=await hashPassword(data.new_password);authorize();
    await c.execute('UPDATE students SET password=?,must_change_password=? WHERE student_id=?',[hash,data.new_password===target.student_code?1:0,studentId]);
   });
  }
 };
}
function createPasswordManagementApi({passwordManagement,students,admins,sessions,adminSessions,now=Date.now}){
 const attempts=new Map();
 return async(req,res,pathname)=>{
  const reset=/^\/api\/admin\/students\/(\d+)\/password$/.exec(pathname);
  const admin=Boolean(reset)||pathname==='/api/admin/auth/password';
  const store=admin?adminSessions:sessions,repository=admin?admins:students;
  const session=store.read(req);
  if(!session)throw problem(admin&&sessions.read(req)?403:401,'กรุณาเข้าสู่ระบบด้วยบัญชีที่ถูกต้อง');
  if(!await repository.findProfile(session.studentId)){store.destroy(req,res);throw problem(401,'กรุณาเข้าสู่ระบบใหม่');}
  if(req.method!=='POST'){res.setHeader('Allow','POST');throw problem(405,'ใช้ POST สำหรับเปลี่ยนรหัสผ่าน');}
  if((req.headers.origin&&req.headers.origin!==requestOrigin(req))||req.headers['sec-fetch-site']==='cross-site')throw problem(403,'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
  queryInput(new URL(req.url,'http://localhost').searchParams,[]);
  const body=passwordChangeInput(await readJson(req,8192),admin,Boolean(reset));
  for(const [key,bucket] of attempts)if(bucket.expiresAt<=now())attempts.delete(key);
  // Reserve before awaiting password work, so parallel requests share the limit.
  const key=(admin?'admin:':'student:')+session.studentId;
  const bucket=attempts.get(key)||{count:0,expiresAt:now()+15*60*1000};
  if(bucket.count>=5){res.setHeader('Retry-After',Math.ceil((bucket.expiresAt-now())/1000));throw problem(429,'ลองรหัสผ่านหลายครั้งเกินไป กรุณารอ 15 นาที');}
  bucket.count++;attempts.set(key,bucket);
  const authorize=()=>{if(store.read(req)!==session)throw problem(401,'เซสชันหมดอายุหรือถูกยกเลิก กรุณาเข้าสู่ระบบใหม่');};
  if(reset){
   const id=integer(Number(reset[1]),'นักศึกษา');
   await passwordManagement.reset(session.studentId,id,body,authorize);
   sessions.revokeAccount(id);
  }else{
   await passwordManagement.change(session.studentId,body,admin,authorize);
   store.revokeAccount(session.studentId);store.destroy(req,res);
  }
  attempts.delete(key);
  return json(res,200,{message:reset?'รีเซ็ตรหัสนักศึกษาแล้ว กรุณาแจ้งรหัสใหม่ให้นักศึกษาเป็นส่วนตัว':'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสใหม่'});
 };
}
module.exports={createPasswordManagement,createPasswordManagementApi,passwordChangeInput};
