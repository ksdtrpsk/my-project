const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {randomBytes}=require('node:crypto');const {readConfig}=require('../config');const {createDatabase,createStudentRepository}=require('../students');const {hashPassword,verifyPassword}=require('../passwords');
async function runSqlFile(pool, source) {
  let delimiter = ';', buffer = '';
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*--/.test(line)) continue;
    const change = /^DELIMITER (.+)$/.exec(line.trim());
    if (change) { delimiter = change[1]; continue; }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length).trim();
      if (statement) await pool.query(statement);
      buffer = '';
    }
  }
  assert.equal(buffer.trim(), '', 'Unterminated SQL statement');
}


test('Real MySQL: student-code password and profile in isolated database',{skip:process.env.RUN_MYSQL_TESTS!=='1'},async()=>{
 const config=readConfig(),name='bq_profile_test_'+randomBytes(8).toString('hex'),manager=createDatabase(config.database);let pool,created=false;
 try{
  await manager.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');created=true;pool=createDatabase({...config.database,database:name});
  await runSqlFile(pool,await fs.readFile(path.resolve(__dirname,'../../database/schema.sql'),'utf8'));
  await pool.query("INSERT INTO departments VALUES(1,'ไอที')");await pool.query("INSERT INTO education_levels VALUES(1,'ปวส.2')");await pool.query("INSERT INTO classrooms VALUES(1,1,1,'2/1')");
  await pool.execute('INSERT INTO students(student_code,password,first_name,last_name,department_id,education_level_id,classroom_id,must_change_password) VALUES(?,?,?,?,1,1,1,1)',['66309010001',await hashPassword('66309010001'),'ทดสอบ','บัญชี']);
  const repository=createStudentRepository(pool),account=await repository.findCredentials('66309010001');assert(await verifyPassword('66309010001',account.password));assert.equal(await verifyPassword('wrong',account.password),false);const profile=await repository.findProfile(account.student_id);assert.equal(profile.must_change_password,1);assert.equal(profile.password,undefined);assert(profile.department_name&&profile.classroom_name);
 }finally{if(pool)await pool.end();if(created&&/^bq_profile_test_[a-f0-9]{16}$/.test(name))await manager.query('DROP DATABASE '+name);await manager.end();}
});
