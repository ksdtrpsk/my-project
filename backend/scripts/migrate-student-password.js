const {readConfig}=require('../config');
const {createDatabase}=require('../students');
async function migrateStudentPassword(pool){
 const [rows]=await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='must_change_password'");
 if(!rows.length)await pool.query('ALTER TABLE students ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password');
}
if(require.main===module){const pool=createDatabase(readConfig().database);migrateStudentPassword(pool).then(()=>console.log('Student password schema ready (no passwords changed)')).catch(()=>{console.error('Migration failed; check database and permissions');process.exitCode=1;}).finally(()=>pool.end());}
module.exports={migrateStudentPassword};
