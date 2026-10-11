const {readConfig}=require('../config');
const {createDatabase}=require('../students');
const {hashPassword,verifyPassword}=require('../passwords');
async function resetStudentPasswords(pool){
 const c=await pool.getConnection();
 try{
  await c.beginTransaction();
  const [rows]=await c.query('SELECT student_id,student_code FROM students ORDER BY student_id FOR UPDATE');
  for(const row of rows){
   const hash=await hashPassword(row.student_code);
   await c.execute('UPDATE students SET password=?,must_change_password=1 WHERE student_id=?',[hash,row.student_id]);
  }
  // Verify every replacement before committing; never print credentials.
  const [saved]=await c.query('SELECT student_code,password,must_change_password FROM students');
  for(const row of saved)if(row.must_change_password!==1||!await verifyPassword(row.student_code,row.password))throw Error('Verification failed');
  await c.commit();return rows.length;
 }catch(error){await c.rollback();throw error;}finally{c.release();}
}
if(require.main===module){
 if(!process.argv.includes('--confirm-all')){console.error('Stop the server first. This resets ALL students. Run with --confirm-all only when intended.');process.exitCode=1;}
 else{const pool=createDatabase(readConfig().database);resetStudentPasswords(pool).then(count=>console.log(`Reset and verified ${count} student accounts; administrators unchanged`)).catch(()=>{console.error('Reset failed; transaction rolled back');process.exitCode=1;}).finally(()=>pool.end());}
}
module.exports={resetStudentPasswords};
