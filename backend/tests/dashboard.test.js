const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/dashboard-ui.js'),'utf8');
const summary={generated_at:'2030-01-01 09:00:00',today:'2030-01-01',totals:{total:5,today:2,students:4,pending:2,received:1,cancelled:1,no_show:1},groups:[{group_id:10,label:'ไอที <img>',total:5,pending:2,received:1,cancelled:1,no_show:1}]};
const listing={bookings:[],total:0,page:1,page_size:25};
function screen(handler){
 const nodes=new Map(),calls=[];let destination;
 const node=id=>{if(id==='booking-filters')return null;if(!nodes.has(id))nodes.set(id,{outerHTML:'',addEventListener(){},focus(){}});return nodes.get(id);};
 const escapeHtml=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({URLSearchParams,escapeHtml,slotPeriod:row=>escapeHtml(row.booking_date),bookRows:books=>books.map(x=>escapeHtml(x.book_name)).join(''),document:{getElementById:node},window:{location:{replace:value=>{destination=value;}}},api:async url=>{calls.push(url);return handler?await handler(url):url.includes('/dashboard')?summary:listing;}});
 vm.runInContext(source,context);
 return {run:s=>vm.runInContext(s,context),calls,node,destination:()=>destination};
}
test('Dashboard displays real totals and escapes group names',async()=>{
 const ui=screen();await ui.run('loadDashboard()');const html=ui.run('dashboardStatsView()');assert.match(html,/นักศึกษาไม่ซ้ำ 4 คน/);assert.match(html,/ไอที &lt;img&gt;/);assert.doesNotMatch(html,/<img>/);assert.match(html,/นัดรับวันนี้/);assert.match(html,/ยังไม่รับ/);
});
test('Group drilldown and pagination send correct read-only request',async()=>{
 const ui=screen();await ui.run('loadDashboard()');await ui.run("dashboardAction('group','10')");assert.ok(ui.calls.includes('/api/admin/bookings?page=1&group_by=department&group_id=10'));await ui.run("dashboardAction('next')");assert.ok(ui.calls.includes('/api/admin/bookings?page=2&group_by=department&group_id=10'));await ui.run("dashboardAction('dimension','date')");assert.equal(ui.run('dashboardState.groupId'),null);assert.equal(ui.run('dashboardState.page'),1);
});
test('Failed refresh preserves data and labels it as old rather than zero',async()=>{
 let failed=false;const ui=screen(url=>{if(failed)throw Error('offline');return url.includes('/dashboard')?summary:listing;});await ui.run('loadDashboard()');failed=true;await ui.run("dashboardAction('dimension','date')");assert.equal(ui.run('dashboardState.summary.totals.total'),5);assert.equal(ui.run('dashboardState.group'),'department');assert.match(ui.node('dashboard-panel').outerHTML,/ข้อมูลเดิม/);
});
test('Expired admin session redirects without rendering a fresh success',async()=>{
 let failed=false;const ui=screen(url=>{if(failed)throw Object.assign(Error(),{status:401});return url.includes('/dashboard')?summary:listing;});await ui.run('loadDashboard()');failed=true;await ui.run("dashboardAction('refresh')");assert.equal(ui.destination(),'admin-login.html');
});
test('Detail contains escaped student and books with scanner link but no student QR',async()=>{
 const ui=screen(url=>url.includes('/dashboard')?summary:url.endsWith('/7')?{booking:{booking_id:7,first_name:'<script>',queue_number:'A001',booking_status:'RECEIVED',books:[{book_name:'<img>'}],received_at:'2030-01-01 09:00:00'}}:listing);await ui.run('loadDashboard()');await ui.run("dashboardAction('detail','7')");const html=ui.run('dashboardDetailView()');assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img&gt;/);assert.match(html,/admin-scanner.html/);assert.match(html,/2030-01-01 09:00:00/);assert.doesNotMatch(html,/\/api\/student|data-booking-qr/);
});

test('Booking filters survive pagination and reset page on a new search',async()=>{
 const ui=screen();await ui.run('loadDashboard()');await ui.run("dashboardAction('filter',{q:'สมชาย',department_id:'10',education_level_id:'10',classroom_id:'10',date:'2030-01-01',status:'WAITING'})");
 const query=new URL('http://localhost'+ui.calls.at(-1)).searchParams;assert.equal(query.get('q'),'สมชาย');assert.equal(query.get('status'),'WAITING');assert.equal(query.get('page'),'1');
 await ui.run("dashboardAction('next')");assert.equal(new URL('http://localhost'+ui.calls.at(-1)).searchParams.get('page'),'2');assert.equal(new URL('http://localhost'+ui.calls.at(-1)).searchParams.get('classroom_id'),'10');
 await ui.run("dashboardAction('filter',{q:'A002',department_id:'',education_level_id:'',classroom_id:'',date:'',status:''})");assert.equal(ui.run('dashboardState.page'),1);
});
test('Clear returns all records and removes group and filters',async()=>{
 const ui=screen();await ui.run('loadDashboard()');await ui.run("dashboardAction('group','10')");await ui.run("dashboardAction('filter',{q:'A001',status:'WAITING'})");await ui.run("dashboardAction('all')");assert.equal(ui.calls.at(-1),'/api/admin/bookings?page=1');assert.equal(ui.run('dashboardState.groupId'),null);
});
test('Failed search restores applied filters alongside previous results',async()=>{
 let fail=false;const ui=screen(url=>{if(fail)throw Error('offline');return url.includes('/dashboard')?summary:listing;});await ui.run('loadDashboard()');fail=true;await ui.run("dashboardAction('filter',{q:'missing'})");assert.equal(ui.run('dashboardState.filters.q'),'');assert.match(ui.run('dashboardState.message'),/ข้อมูลเดิม/);
});
test('Filter form escapes text and classroom options follow department and level',()=>{
 const ui=screen();ui.run(`dashboardLookups={departments:[{department_id:10,department_name:'ไอที'},{department_id:20,department_name:'บัญชี'}],education_levels:[{education_level_id:10,education_level_name:'ปวส.1'}],classrooms:[{classroom_id:10,department_id:10,education_level_id:10,classroom_name:'1'},{classroom_id:20,department_id:20,education_level_id:10,classroom_name:'1'}]};dashboardState.filters.q='<script>';`);
 const html=ui.run('bookingFiltersView()');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.equal(ui.run("bookingFilterClassrooms('20','10')[0].classroom_id"),20);assert.equal(ui.run("bookingFilterClassrooms('20','20').length"),0);
});
