const { requestOrigin } = require('./request-origin');
const {problem,integer}=require('./catalog');
const {queryInput}=require('./validation');
const {json,readJson}=require('./auth');
const {createStudentManagement}=require('./student-management');
function createStudentDirectory(pool){
 return {...createStudentManagement(pool),async list(params){
  queryInput(params,['q','page']);
  const q=(params.get('q')||'').trim(),pageText=params.get('page')||'1';
  if(q.length>100||/[\u0000-\u001f\u007f]/.test(q)||!/^\d+$/.test(pageText))throw problem(400,'คำค้นหาหรือหน้าไม่ถูกต้อง');
  const page=integer(Number(pageText),'หน้า');if(page>1000000)throw problem(400,'หน้าเกินขอบเขต');
  const pattern='%'+q.replace(/[!%_]/g,c=>'!'+c)+'%';
  const where=" WHERE CONVERT(s.student_code USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!' OR CONCAT(s.first_name,' ',s.last_name) LIKE ? ESCAPE '!'";
  const connection=await pool.getConnection();
  try{
   await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await connection.beginTransaction();
   const [[count]]=await connection.execute('SELECT COUNT(*) AS total FROM students s'+where,[pattern,pattern]);
   const [students]=await connection.execute(`SELECT s.student_id,s.student_code,s.first_name,s.last_name,d.department_name,e.education_level_name,c.classroom_name FROM students s JOIN departments d ON d.department_id=s.department_id JOIN education_levels e ON e.education_level_id=s.education_level_id JOIN classrooms c ON c.classroom_id=s.classroom_id ${where} ORDER BY s.student_code,s.student_id LIMIT 25 OFFSET ${(page-1)*25}`,[pattern,pattern]);
   await connection.commit();return {students,total:Number(count.total),page,page_size:25};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 }};
}
function createStudentDirectoryApi({directory,admins,sessions,adminSessions}){
 return async(req,res)=>{
  const session=adminSessions.read(req);if(!session)throw problem(sessions.read(req)?403:401,'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ');
  if(!await admins.findProfile(session.studentId)){adminSessions.destroy(req,res);throw problem(401,'กรุณาเข้าสู่ระบบใหม่');}
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  if(!['GET','HEAD'].includes(req.method)&&((req.headers.origin&&req.headers.origin!==requestOrigin(req))||req.headers['sec-fetch-site']==='cross-site'))throw problem(403,'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
  if(route==='/api/admin/students'&&req.method==='GET')return json(res,200,await directory.list(url.searchParams));
  queryInput(url.searchParams,[]);
  const match=/^\/api\/admin\/students\/(\d+)$/.exec(route);
  if(match&&req.method==='GET')return json(res,200,await directory.detail(integer(Number(match[1]),'รหัสรายการ')));
  if(match&&req.method==='PUT')return json(res,200,await directory.update(integer(Number(match[1]),'รหัสรายการ'),await readJson(req,8192)));
  if(req.method==='POST'){
   if(route==='/api/admin/students')return json(res,201,await directory.create(await readJson(req,8192)));
   if(route==='/api/admin/students/groups')return json(res,201,{group:await directory.createGroup(await readJson(req,4096))});
   if(route==='/api/admin/students/import/preview')return json(res,200,await directory.preview(await readJson(req,1310720)));
   if(route==='/api/admin/students/import')return json(res,201,await directory.import(await readJson(req,1310720)));
  }
  const allowed=route==='/api/admin/students'?'GET, POST':match?'GET, PUT':['/api/admin/students/groups','/api/admin/students/import/preview','/api/admin/students/import'].includes(route)?'POST':null;
  if(!allowed)throw problem(404,'ไม่พบ API');res.setHeader('Allow',allowed);throw problem(405,'Method ไม่ถูกต้อง');
 };
}
module.exports={createStudentDirectory,createStudentDirectoryApi};
