const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const app=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/app.js'),'utf8');
const source=app.slice(app.indexOf('let passwordBusy='),app.indexOf('function fullName()'));
function screen(handler,admin=false){
 const nodes={},calls=[];const node=id=>nodes[id]??={value:'',textContent:'',type:'password',disabled:false,checked:false,children:[],focus(){},addEventListener(){},appendChild(child){this.children.push(child);}};
 const context=vm.createContext({admin,document:{getElementById:node,createElement:tag=>({tag})},window:{location:{replace:url=>node('redirect').value=url}},studentBusy:()=>{},api:async(url,body)=>{calls.push({url,body});return handler(url,body);}});
 vm.runInContext(source,context);return {node,calls,run:s=>vm.runInContext(s,context)};
}
function fill(ui,prefix='own'){for(const [key,value] of [['current','OldPassword-123'],['new','NewPassword-123'],['confirm','NewPassword-123']])ui.node(prefix+'-'+key+'-password').value=value;}
test('Password confirmation mismatch is caught before any request',async()=>{
 const ui=screen(()=>({}));fill(ui);ui.node('own-confirm-password').value='different';await ui.run('submitPasswordChange({preventDefault(){}})');assert.equal(ui.calls.length,0);assert.match(ui.node('own-password-message').textContent,/ไม่ตรงกัน/);
});
test('Self change double click is guarded, clears fields and offers the correct login link',async()=>{
 let release;const ui=screen(()=>new Promise(r=>release=r));fill(ui);
 const first=ui.run('submitPasswordChange({preventDefault(){}})');await ui.run('submitPasswordChange({preventDefault(){}})');assert.equal(ui.calls.length,1);assert.equal(ui.node('own-password-fields').disabled,true);
 release({message:'เปลี่ยนรหัสแล้ว'});await first;assert.equal(ui.node('own-new-password').value,'');assert.equal(ui.node('own-current-password').value,'');assert.equal(ui.node('own-password-fields').disabled,true);assert.equal(ui.node('own-password-message').children[1].href,'index.html');
});
test('Reset sends explicit target code and administrator password, with no automatic retry on uncertain result',async()=>{
 const ui=screen(()=>{throw Error('response lost');},true);fill(ui,'reset');
 await ui.run("submitPasswordChange({preventDefault(){}},true,{student_id:20,student_code:'00120'})");
 assert.equal(ui.calls[0].url,'/api/admin/students/20/password');assert.equal(ui.calls[0].body.student_code,'00120');assert.equal(ui.calls.length,1);assert.equal(ui.node('reset-current-password').value,'');assert.equal(ui.node('reset-confirm-password').value,'');assert.equal(ui.node('reset-password-fields').disabled,false);assert.match(ui.node('reset-password-message').textContent,/ไม่แน่นอน/);
});
test('Wrong-password errors keep the form available and expired session goes to role login',async()=>{
 const ui=screen(()=>{throw Object.assign(Error('รหัสปัจจุบันผิด'),{status:400});},true);fill(ui);await ui.run('submitPasswordChange({preventDefault(){}})');assert.equal(ui.node('own-password-fields').disabled,false);assert.equal(ui.node('own-password-message').textContent,'รหัสปัจจุบันผิด');assert.equal(ui.node('own-new-password').value,'');
 const expired=screen(()=>{throw Object.assign(Error('expired'),{status:401});},true);fill(expired);await expired.run('submitPasswordChange({preventDefault(){}})');assert.equal(expired.node('redirect').value,'admin-login.html');
});
