const {problem}=require('./catalog');
const {bangkokNow}=require('./slots');
const fields="announcement_id,title,content,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at";
function announcementInput(body){
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!['title','content','request_id'].includes(key)))throw problem(400,'ส่งเฉพาะหัวข้อ เนื้อหา และ request_id');
  if(typeof body.title!=='string'||typeof body.content!=='string')throw problem(400,'หัวข้อและเนื้อหาต้องเป็นข้อความ');
  const title=body.title.trim(),content=body.content.trim();
  if(!title || title.length>160 || /[\u0000-\u001f\u007f]/.test(title))throw problem(400,'หัวข้อต้องมี 1–160 ตัวอักษรในบรรทัดเดียว');
  if(!content || content.length>5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content))throw problem(400,'เนื้อหาต้องมี 1–5,000 ตัวอักษร');
  if(typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id))throw problem(400,'request_id ต้องเป็น UUID v4');
  return {title,content,request_id:body.request_id.toLowerCase()};
}
function createAnnouncements(pool,now=Date.now){
  return {
    async latest(){const [[row]]=await pool.query(`SELECT ${fields} FROM announcements ORDER BY created_at DESC,announcement_id DESC LIMIT 1`);return row??null;},
    async list(){const [rows]=await pool.query(`SELECT ${fields} FROM announcements ORDER BY created_at DESC,announcement_id DESC LIMIT 50`);return rows;},
    async create(adminId,body){
      const data=announcementInput(body),created_at=bangkokNow(now());
      try{
        const [result]=await pool.execute('INSERT INTO announcements(title,content,created_by,request_id,created_at) VALUES(?,?,?,?,?)',[data.title,data.content,adminId,data.request_id,created_at]);
        return {announcement_id:result.insertId,title:data.title,content:data.content,created_at};
      }catch(error){
        if(error.code==='ER_DUP_ENTRY'){
          // Retry with the same request ID returns the first published announcement.
          const [[row]]=await pool.execute(`SELECT ${fields},created_by FROM announcements WHERE request_id=?`,[data.request_id]);
          if(row && row.created_by===adminId && row.title===data.title && row.content===data.content){const {created_by,...announcement}=row;return announcement;}
          throw problem(409,'request_id นี้ใช้กับประกาศอื่นแล้ว');
        }
        if(error.code==='ER_NO_REFERENCED_ROW_2')throw problem(401,'กรุณาเข้าสู่ระบบเจ้าหน้าที่ใหม่');
        throw error;
      }
    }
  };
}
module.exports={createAnnouncements,announcementInput};
