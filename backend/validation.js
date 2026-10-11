const {problem}=require('./errors');
function objectInput(body,allowed){
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!allowed.includes(key)))throw problem(400,'ข้อมูลไม่ถูกต้องหรือมีช่องข้อมูลที่ไม่รองรับ');
  return body;
}
function queryInput(params,allowed=[]){
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw problem(400,'ตัวกรองไม่ถูกต้องหรือส่งซ้ำ');
}
module.exports={objectInput,queryInput};
