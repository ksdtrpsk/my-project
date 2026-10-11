const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/students-ui.js'),'utf8');
function screen(handler){
 const nodes={},calls=[];
 const node=id=>nodes[id]??={value:'',dataset:{},disabled:false,outerHTML:'',textContent:'',addEventListener(){},focus(){},setAttribute(){},querySelectorAll(){return [];}};
 const context=vm.createContext({URLSearchParams,TextDecoder,document:{getElementById:node},window:{location:{replace(){}}},escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),api:async(url,body,method)=>{calls.push({url,body,method});return handler(url,body,method);}});
 vm.runInContext(source,context);
 return {node,calls,run:s=>vm.runInContext(s,context)};
}
function fill(ui){for(const [key,value] of Object.entries({student_code:'00123',first_name:'ชื่อ',last_name:'สกุล',classroom_id:'10',phone:'',email:''}))ui.node('student-'+key).value=value;}
test('Editor escapes profile and preview content; history locks code/group with no password edit',()=>{
 const ui=screen(()=>({}));ui.run("Object.assign(studentManagement,{mode:'edit',draft:{first_name:'<img src=x>',student_code:'001'},detail:{has_bookings:true},lookups:{classrooms:[],departments:[],education_levels:[]}})");
 const html=ui.run('studentManagementView()');assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/readonly/);assert.match(html,/name="classroom_id" required disabled/);assert.doesNotMatch(html,/type="password"/);
 ui.run("studentManagement.preview={valid:false,total:1,rows:[{row:2,student_code:'<script>',errors:['<img>']}]}");assert.doesNotMatch(ui.run('studentPreviewView()'),/<script>|<img>/);
});
test('Double save sends one create request and successful response clears the editor',async()=>{
 let resolve;const ui=screen(url=>url==='/api/admin/students'?new Promise(r=>resolve=r):{students:[],page:1,total:1,page_size:25});
 fill(ui);ui.node('student-password').value='InitialPassword-123';ui.run("studentManagement.mode='new'");
 const first=ui.run('studentSave({preventDefault(){}})');await ui.run('studentSave({preventDefault(){}})');assert.equal(ui.calls.length,1);resolve({student:{student_id:7}});await first;
 assert.equal(ui.run('studentManagement.mode'),'');assert.equal(ui.run('directoryState.q'),'00123');assert.equal(ui.run('studentManagement.busy'),false);
});
test('Edit sends only permitted profile fields/version and retains saved outcome if list reload fails',async()=>{
 const ui=screen((url,body,method)=>{if(method==='PUT')return {student:{student_id:7}};throw Error('offline');});fill(ui);
 ui.run("Object.assign(studentManagement,{mode:'edit',draft:{student_id:7,department_id:10},detail:{student:{student_id:7},version:'abc'}})");
 await ui.run('studentSave({preventDefault(){}})');const body=ui.calls[0].body;
 assert.equal(body.version,'abc');assert.ok(!('password' in body));assert.ok(!('student_id' in body));assert.ok(!('department_id' in body));assert.match(ui.run('studentManagement.message'),/บันทึกนักศึกษาแล้ว.*โหลดรายชื่อไม่สำเร็จ/);
});
test('Preview sends no password; failed import invalidates confirmation and retains CSV for recheck',async()=>{
 const ui=screen(url=>{if(url.endsWith('/preview'))return {valid:true,total:1,rows:[]};throw Object.assign(Error('รหัสซ้ำ'),{status:409});});
 ui.run("Object.assign(studentManagement,{mode:'import',csv:'test csv'})");await ui.run('studentCheckCsv()');assert.deepEqual(Object.keys(ui.calls[0].body),['csv']);
 ui.node('student-import-password').value='InitialPassword-123';await ui.run('studentImport({preventDefault(){}})');assert.equal(ui.run('studentManagement.preview'),null);assert.equal(ui.run('studentManagement.csv'),'test csv');assert.match(ui.run('studentManagement.message'),/รหัสซ้ำ/);assert.match(ui.run('studentManagementView()'),/id="student-import-confirm" class="button" disabled/);
});
test('Choosing an unreadable replacement file discards the previously valid preview',async()=>{
 const ui=screen(()=>{throw Error('should not call API');});ui.run("Object.assign(studentManagement,{mode:'import',csv:'old',preview:{valid:true,total:1,rows:[]}})");
 await ui.run("studentChooseCsv({target:{files:[{name:'bad.csv',size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer}]}})");
 assert.equal(ui.run('studentManagement.preview'),null);assert.equal(ui.run('studentManagement.csv'),'');assert.equal(ui.calls.length,0);assert.match(ui.run('studentManagement.message'),/UTF-8/);
});
