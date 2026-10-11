const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createServer}=require('../server');
const {createSessions}=require('../sessions');
const {hashPassword}=require('../passwords');
const {bookInput,setInput}=require('../catalog');
const {slotInput}=require('../slots');
const {objectInput}=require('../validation');
async function fixture(t,overrides={}){
 const sessions=createSessions(),adminSessions=createSessions({cookieName:'book_queue_admin_session'});
 const cookie=store=>{let value;store.create({headers:{}},{setHeader:(name,v)=>value=v},1);return value.split(';')[0];};
 const studentCookie=cookie(sessions),adminCookie=cookie(adminSessions);
 const server=createServer({students:{findProfile:async()=>({student_id:1}),findCredentials:async()=>null},admins:{findProfile:async()=>({admin_id:1})},sessions,adminSessions,...overrides});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(route,cookie='',options={})=>fetch(base+route,{redirect:'manual',...options,headers:{Cookie:cookie,...options.headers}});
 return {server,base,request,studentCookie,adminCookie};
}
test('All private pages require matching live role, including HEAD and case variants',async t=>{
 let alive=true;const app=await fixture(t,{admins:{findProfile:async()=>alive?{admin_id:1}:null}});
 const pages=['dashboard','admin-books','admin-book-sets','admin-slots','admin-scanner','admin-reports','admin-announcements','admin-students','admin-bookings'];
 for(const page of pages){
  assert.equal((await app.request('/'+page+'.html')).status,302);
  assert.equal((await app.request('/'+page+'.html',app.studentCookie)).status,302);
  assert.equal((await app.request('/'+page+'.html',app.adminCookie)).status,200);
 }
 assert.equal((await app.request('/ADMIN-ANNOUNCEMENTS.HTML',app.studentCookie,{method:'HEAD'})).status,302);
 assert.equal((await app.request('/home.html',app.adminCookie)).status,302);
 alive=false;const revoked=await app.request('/dashboard.html',app.adminCookie);assert.equal(revoked.status,302);assert.match(revoked.headers.get('set-cookie'),/Max-Age=0/);
});
test('Unapproved file aliases and secret/backup paths are never served',async t=>{
 const app=await fixture(t);
 for(const route of ['/dashboard.html.','/dashboard.html%20','/dashboard.html::$DATA','/assets/app.js.bak','/.env','/backend/server.js','/assets/%2e%2e%5cdashboard.html','/admin-reports.html%00'])assert.notEqual((await app.request(route)).status,200,route);
 assert.equal((await app.request('/assets/app.js')).status,200);
 const headers=(await app.request('/')).headers;
 assert.equal(headers.get('referrer-policy'),'no-referrer');assert.match(headers.get('content-security-policy'),/form-action 'self'/);
 assert.match(headers.get('permissions-policy'),/camera=\(self\)/);
});
test('Only application errors are exposed, even when dependency sets status',async t=>{
 const app=await fixture(t,{students:{findProfile:async()=>{throw Object.assign(new Error('SELECT secret-password'),{status:400});}}});
 for(const route of ['/api/auth/me','/home.html']){const res=await app.request(route,app.studentCookie);assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/SELECT|secret/);}
});
test('Strict object schemas reject extra fields without changing legitimate payloads',()=>{
 const book={book_code:'IT01',book_name:'ภาษาไทย',description:'หลาย\nบรรทัด'};
 assert.equal(bookInput(book).description,book.description);
 for(const body of [null,[],true,1,'x',{...book,admin_id:1},JSON.parse('{"book_code":"X","book_name":"X","__proto__":{}}')])assert.throws(()=>bookInput(body),{status:400});
 assert.throws(()=>bookInput({...book,book_name:'a\u0000b'}),{status:400});
 const set={department_id:1,education_level_id:1,classroom_id:1,semester:1,academic_year:2573,book_ids:[1]};assert.throws(()=>setInput({...set,student_id:2}),{status:400});
 const slot={booking_date:'2031-01-01',start_time:'09:00',end_time:'10:00',max_students:10,status:'OPEN'};assert.throws(()=>slotInput({...slot,booked_count:0}),{status:400});
 assert.throws(()=>objectInput({id:1},[]),{status:400});
});
test('Invalid UTF-8 and non-object JSON return 400; extra login fields are rejected',async t=>{
 const app=await fixture(t);
 for(const body of [Buffer.from([123,34,120,34,58,34,255,34,125]),'[]','null','true',JSON.stringify({student_code:'123',password:'x',role:'admin'})]){
  const res=await app.request('/api/auth/login','',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(res.status,400);
 }
});
test('Oversized declared and unfinished chunked bodies return 413 before upload finishes',async t=>{
 const app=await fixture(t);
 for(const declared of [true,false]){
  await new Promise((resolve,reject)=>{
   const req=http.request(app.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(declared?{'Content-Length':'999999'}:{})}},res=>{
    try{assert.equal(res.statusCode,413);assert.equal(res.headers.connection,'close');res.resume();res.on('end',()=>{req.destroy();resolve();});}catch(error){req.destroy();reject(error);}
   });
   req.on('error',reject);req.setTimeout(5000,()=>{req.destroy();reject(new Error('Waited for oversized upload to finish'));});
   if(declared)req.flushHeaders();else req.write('x'.repeat(5000));
  });
 }
 assert.equal((await app.request('/')).status,200);
});
test('Parallel failed logins share a single rate-limit bucket',async t=>{
 const password=await hashPassword('Correct-password-123');
 const app=await fixture(t,{students:{findCredentials:async()=>({student_id:1,password}),findProfile:async()=>({student_id:1})}});
 const replies=await Promise.all(Array.from({length:12},()=>app.request('/api/auth/login','',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_code:'123',password:'wrong'})})));
 assert.equal(replies.filter(r=>r.status===401).length,10);assert.equal(replies.filter(r=>r.status===429).length,2);
 assert.ok(replies.filter(r=>r.status===429).every(r=>Number(r.headers.get('retry-after'))>0));
});
