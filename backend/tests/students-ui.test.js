const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/students-ui.js'),'utf8');
function screen(handler){const nodes={};const node=id=>nodes[id]??={value:'',outerHTML:'',addEventListener(){},focus(){}};const calls=[];const context=vm.createContext({URLSearchParams,document:{getElementById:node},window:{location:{replace(){}}},escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),api:async url=>{calls.push(url);return handler(url);}});vm.runInContext(source,context);return {run:s=>vm.runInContext(s,context),node,calls};}
test('Directory preserves search on pagination and escapes names',async()=>{
 const ui=screen(()=>({total:30,page:1,page_size:25,students:[{student_code:'01',first_name:'<script>',last_name:'ทดสอบ',department_name:'ไอที',education_level_name:'ปวส.1',classroom_name:'1/1'}]}));
 ui.node('student-query').value='ชื่อ & นามสกุล';await ui.run("directoryAction('search')");await ui.run("directoryAction('next')");assert.match(ui.calls[1],/page=2/);assert.equal(new URL('http://localhost'+ui.calls[1]).searchParams.get('q'),'ชื่อ & นามสกุล');assert.match(ui.run('studentDirectoryView()'),/&lt;script&gt;/);assert.doesNotMatch(ui.run('studentDirectoryView()'),/<script>/);
});
test('Directory failed request retains prior result and pagination instead of reporting empty success',async()=>{
 let fail=false;const ui=screen(()=>{if(fail)throw Error('offline');return {total:30,page:1,page_size:25,students:[]};});await ui.run('loadStudentDirectory()');fail=true;await ui.run("directoryAction('next')");assert.equal(ui.run('directoryState.page'),1);assert.equal(ui.run('directoryState.data.total'),30);assert.match(ui.run('directoryState.message'),/ข้อมูลเดิม/);assert.equal(ui.run('directoryState.busy'),false);
});
