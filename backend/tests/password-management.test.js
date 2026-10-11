const {test}=require('node:test');const assert=require('node:assert/strict');
const {passwordChangeInput}=require('../password-management');
const {createSessions}=require('../sessions');const {createServer}=require('../server');const {hashPassword}=require('../passwords');
test('Password rules distinguish admin/student minimum, confirmation and unsupported fields',()=>{
 const body={current_password:'old',new_password:'123456',confirm_password:'123456'};
 assert.equal(passwordChangeInput(body,true),body);assert.equal(passwordChangeInput(body),body);
 for(const change of [{confirm_password:'different'},{new_password:' '.repeat(12),confirm_password:' '.repeat(12)},{new_password:'x'.repeat(129),confirm_password:'x'.repeat(129)},{student_id:5},{current_password:''}])assert.throws(()=>passwordChangeInput({...body,...change},true),e=>e.status===400);
 assert.equal(passwordChangeInput({...body,student_code:'123'},true,true).new_password,'123456');
});
test('Account revocation removes every device for that role and leaves other accounts intact',()=>{
 const store=createSessions(),req={headers:{}},cookies=[];
 for(const id of [1,1,2])store.create(req,{setHeader:(name,value)=>cookies.push(value.split(';')[0])},id);
 const revision=store.revision();store.revokeAccount(1);assert.equal(store.revision(),revision+1);
 assert.equal(store.read({headers:{cookie:cookies[0]}}),null);assert.equal(store.read({headers:{cookie:cookies[1]}}),null);assert.equal(store.read({headers:{cookie:cookies[2]}}).studentId,2);
});
test('Login paused before session issuance cannot resurrect credentials after revocation',async t=>{
 const sessions=createSessions(),hash=await hashPassword('OldPassword-123');let release,entered;
 const ready=new Promise(r=>entered=r);
 const students={findCredentials:async()=>({student_id:1,password:hash}),findProfile:async()=>{entered();await new Promise(r=>release=r);return {student_id:1};}};
 const server=createServer({students,sessions});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const response=fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_code:'1',password:'OldPassword-123'})});
 await ready;sessions.revokeAccount(1);release();const result=await response;assert.equal(result.status,409);assert.equal(result.headers.get('set-cookie'),null);
});
