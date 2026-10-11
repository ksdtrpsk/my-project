const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {reportCsv,csvCell,createReports}=require('../reports');
test('CSV preserves Thai, commas, quotes and embedded newlines with CRLF records',()=>{
 const csv=reportCsv([{student_code:'00123',first_name:'ชื่อ,"ไทย"\nใหม่'}]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"00123"'));assert.ok(csv.includes('"ชื่อ,""ไทย""\nใหม่"'));assert.ok(csv.endsWith('\r\n'));
 for(const text of ['=1+1','+cmd','-cmd','@SUM(A1)',' \t=1','\n=1'])assert.ok(csvCell(text).startsWith('"\''));
});
test('Oversized export is rejected before row query and releases connection',async()=>{
 let calls=0,rolled=false,released=false;const connection={query:async()=>{},beginTransaction:async()=>{},execute:async()=>{calls++;return [[{total:10001}]];},rollback:async()=>{rolled=true;},release:()=>{released=true;}};
 await assert.rejects(createReports({getConnection:async()=>connection}).read(new URLSearchParams(),true),{status:413});assert.equal(calls,1);assert.equal(rolled,true);assert.equal(released,true);
});
const source=['dashboard-ui.js','reports-ui.js'].map(file=>fs.readFileSync(path.resolve(__dirname,'../../frontend/assets',file),'utf8')).join('\n');
function screen(handler,fetcher){
 const calls=[],downloads=[];let destination,revoked=false;
 const escapeHtml=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({URLSearchParams,escapeHtml,slotPeriod:row=>escapeHtml(row.booking_date),window:{location:{replace:value=>{destination=value;}}},document:{body:{appendChild(){}},createElement:()=>({click(){downloads.push({href:this.href,download:this.download});},remove(){}})},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{revoked=true;}},setTimeout:fn=>fn(),api:async url=>{calls.push(url);return handler?handler(url):{report:'all',bookings:[],total:0,page:1,page_size:25};},fetch:async url=>{calls.push(url);return fetcher?fetcher(url):{ok:true,headers:{get:()=> 'text/csv; charset=utf-8'},blob:async()=>({})};}});
 vm.runInContext(source+"\nrenderReports=()=>{};dashboardLookups={departments:[],education_levels:[],classrooms:[]};",context);
 return {run:s=>vm.runInContext(s,context),calls,downloads,destination:()=>destination,revoked:()=>revoked};
}
test('Report filters and category persist across pages; new request resets page',async()=>{
 const ui=screen();await ui.run("reportAction('filter',{report:'pending',q:'สมชาย',department_id:'10'})");await ui.run("reportAction('next')");const query=new URL('http://localhost'+ui.calls.at(-1)).searchParams;assert.equal(query.get('report'),'pending');assert.equal(query.get('q'),'สมชาย');assert.equal(query.get('page'),'2');
 await ui.run("reportAction('clear')");assert.equal(ui.calls.at(-1),'/api/admin/reports/bookings?report=all&page=1');
});
test('CSV download uses applied filters without page and cleans blob URL',async()=>{
 const ui=screen();ui.run("reportState.filters={report:'received',date:'2030-01-01'};reportState.page=3;");await ui.run("reportAction('download')");assert.equal(ui.calls[0],'/api/admin/reports/bookings.csv?report=received&date=2030-01-01');assert.equal(ui.downloads.length,1);assert.equal(ui.revoked(),true);
});
test('Export errors never trigger a bogus CSV download',async()=>{
 const ui=screen(null,()=>({ok:false,status:413,json:async()=>({message:'เกิน 10,000 รายการ'})}));await ui.run("reportAction('download')");assert.equal(ui.downloads.length,0);assert.match(ui.run('reportState.message'),/10,000/);
 const expired=screen(null,()=>({ok:false,status:401,json:async()=>({message:'Login'})}));await expired.run("reportAction('download')");assert.equal(expired.destination(),'admin-login.html');
});
test('Failed report refresh retains prior data and applied filters',async()=>{
 const ui=screen(()=>{throw Error('offline');});ui.run("reportState.data={total:5};");await ui.run("reportAction('filter',{report:'no_show'})");assert.equal(ui.run('reportState.data.total'),5);assert.equal(ui.run('reportState.filters.report'),'all');assert.match(ui.run('reportState.message'),/ข้อมูลเดิม/);
});
test('Report preview escapes database text and exposes category and export controls',()=>{
 const ui=screen();ui.run("reportState.data={report:'all',generated_at:'2030-01-01',total:1,page:1,page_size:25,bookings:[{student_code:'00123',first_name:'<script>',last_name:'ทดสอบ',booking_status:'WAITING'}]};");const html=ui.run('reportsView()');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/ดาวน์โหลด CSV/);assert.match(html,/รายชื่อผู้ยังไม่รับหนังสือ/);
});
