const fs=require('node:fs/promises');
const path=require('node:path');
const {readConfig}=require('../config');
const {createDatabase}=require('../students');
async function migratePhase14(pool){
  const sql=await fs.readFile(path.resolve(__dirname,'../../database/migrations/phase14.sql'),'utf8');
  await pool.query(sql);
  const [columns]=await pool.query("SELECT COLUMN_NAME,DATA_TYPE,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='announcements'");
  const expected={announcement_id:['int','NO'],title:['varchar','NO',160],content:['text','NO'],created_by:['int','YES'],request_id:['char','NO',36],created_at:['datetime','NO']};
  for(const [name,[type,nullable,length]] of Object.entries(expected)){
    const column=columns.find(row=>row.COLUMN_NAME===name);
    if(!column || column.DATA_TYPE!==type || column.IS_NULLABLE!==nullable || (length && Number(column.CHARACTER_MAXIMUM_LENGTH)!==length))throw new Error('announcements schema mismatch');
  }
  const [indexes]=await pool.query("SELECT INDEX_NAME,COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='announcements'");
  if(!indexes.some(row=>row.INDEX_NAME==='uq_announcements_request'&&row.COLUMN_NAME==='request_id'&&row.NON_UNIQUE===0))throw new Error('announcements unique key missing');
}
if(require.main===module){
  const pool=createDatabase(readConfig().database);
  migratePhase14(pool).then(()=>console.log('Phase 14: ตาราง announcements พร้อมแล้ว ข้อมูลเดิมคงอยู่')).catch(()=>{console.error('Migration ไม่สำเร็จ ตรวจ .env สิทธิ์ CREATE TABLE และโครงสร้าง announcements');process.exitCode=1;}).finally(()=>pool.end());
}
module.exports={migratePhase14};
