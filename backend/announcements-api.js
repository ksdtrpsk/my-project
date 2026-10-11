const { requestOrigin } = require('./request-origin');
const {json,readJson}=require('./auth');
const {problem}=require('./catalog');
function createAnnouncementsApi({announcements,students,admins,sessions,adminSessions}){
  return async(req,res,pathname)=>{
    if(new URL(req.url,'http://localhost').search)throw problem(400,'ไม่รับ query parameter');
    if(pathname==='/api/student/announcements/latest'){
      const session=await sessions.read(req);if(!session)throw problem(401,'กรุณาเข้าสู่ระบบนักศึกษา');
      if(!await students.findProfile(session.studentId)){await sessions.destroy(req,res);throw problem(401,'กรุณาเข้าสู่ระบบใหม่');}
      if(req.method!=='GET'){res.setHeader('Allow','GET');throw problem(405,'Method ไม่ถูกต้อง');}
      return json(res,200,{announcement:await announcements.latest()});
    }
    const session=await adminSessions.read(req);if(!session)throw problem(await sessions.read(req)?403:401,'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ');
    if(!await admins.findProfile(session.studentId)){await adminSessions.destroy(req,res);throw problem(401,'กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่');}
    if(pathname!=='/api/admin/announcements')throw problem(404,'ไม่พบ API');
    if(req.method==='GET')return json(res,200,{announcements:await announcements.list()});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw problem(405,'Method ไม่ถูกต้อง');}
    if((req.headers.origin && req.headers.origin!==requestOrigin(req))||req.headers['sec-fetch-site']==='cross-site')throw problem(403,'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
    return json(res,201,{announcement:await announcements.create(session.studentId,await readJson(req,32768))});
  };
}
module.exports={createAnnouncementsApi};
