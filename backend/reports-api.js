const {json}=require('./auth');
const {problem}=require('./catalog');
const {reportCsv}=require('./reports');
function createReportsApi({reports,admins,adminSessions,sessions}) {
  return async(req,res,pathname)=>{
    const session=adminSessions.read(req);
    if(!session)throw problem(sessions.read(req)?403:401,'เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ');
    if(!await admins.findProfile(session.studentId)){adminSessions.destroy(req,res);throw problem(401,'กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่');}
    if(!['/api/admin/reports/bookings','/api/admin/reports/bookings.csv'].includes(pathname))throw problem(404,'ไม่พบ API');
    if(req.method!=='GET'){res.setHeader('Allow','GET');throw problem(405,'Method ไม่ถูกต้อง');}
    const exporting=pathname.endsWith('.csv');
    const data=await reports.read(new URL(req.url,'http://localhost').searchParams,exporting);
    if(!exporting)return json(res,200,data);
    const content=Buffer.from(reportCsv(data.bookings),'utf8');
    const filename='bookings-'+data.report+'-'+data.generated_at.slice(0,10)+'.csv';
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+filename+'"','Content-Length':content.length,'Cache-Control':'no-store, private'});
    res.end(content);
  };
}
module.exports={createReportsApi};
