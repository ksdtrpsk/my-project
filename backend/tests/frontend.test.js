const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = ['catalog-ui.js', 'slots-ui.js', 'booking-ui.js', 'scanner-ui.js', 'dashboard-ui.js', 'announcements-ui.js', 'app.js'].map(file => fs.readFileSync(path.resolve(__dirname, '../../frontend/assets', file), 'utf8')).join('\n');

const bookingFixture = {booking_id:81,book_set_id:4,slot_id:7,queue_number:'A015',booking_status:'WAITING',student_code:'900010',first_name:'นักศึกษา <img>',last_name:'ทดสอบ',department_name:'ไอที',education_level_name:'ปวส.1',classroom_name:'1/1',semester:1,academic_year:2574,booking_date:'2031-09-15',start_time:'09:00:00',end_time:'09:30:00',books:[{book_id:1,book_code:'IT01',book_name:'หนังสือของฉัน'}]};
function bookingReply(url, saved = []) {
  if (url==='/api/auth/me') return {student:{first_name:'นักศึกษา',student_code:'900010'}};
  if (url==='/api/student/book-sets') return {book_sets:[{book_set_id:4,semester:1,academic_year:2574,books:bookingFixture.books}]};
  if (url==='/api/student/bookings') return {bookings:saved};
  return {slots:[{slot_id:7,booking_date:'2031-09-15',start_time:'09:00:00',end_time:'09:30:00',status:'OPEN',availability:'AVAILABLE',max_students:20,booked_count:0,remaining:20}]};
}
function slotClick(ui, action, id='7') { return ui.node('slots-page').click({target:{closest:()=>({dataset:{slotAction:action,slotId:id},disabled:false})}}); }
test('Booking receipt shows a same-origin QR with queue/date/status and hides it for inactive states',async()=>{
  const ui=await screen('my-booking',url=>({ok:true,status:200,data:bookingReply(url,[bookingFixture])}));
  assert.match(ui.node('app').innerHTML,/src="\/api\/student\/bookings\/81\/qr"/);
  assert.match(ui.node('app').innerHTML,/alt="QR Code สำหรับการจองคิว A015"/);
  assert.match(ui.node('app').innerHTML,/download="booking-81-qr.png"/);
  assert.match(ui.node('app').innerHTML,/รอรับหนังสือ/);
  for(const status of ['CANCELLED','RECEIVED','NO_SHOW']){
    const inactive=await screen('my-booking',url=>({ok:true,status:200,data:bookingReply(url,[{...bookingFixture,booking_status:status}])}));
    assert.doesNotMatch(inactive.node('app').innerHTML,/data-booking-qr/);
    assert.match(inactive.node('app').innerHTML,/รายการนี้ไม่แสดง QR/);
  }
});
test('Broken QR image displays recovery guidance rather than an empty image',()=>{
  const message={hidden:true};
  const download={hidden:false};
  const img={hidden:false,complete:false,naturalWidth:0,parentElement:{querySelector:selector=>selector==='[data-qr-error]'?message:download},addEventListener(type,handler){this[type]=handler;}};
  const script=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/booking-ui.js'),'utf8');
  vm.runInNewContext(script+'\nbindBookingQr();',{document:{querySelectorAll:()=>[img]}});
  img.error(); assert.equal(img.hidden,true);assert.equal(message.hidden,false);assert.equal(download.hidden,true);
});
test('Booking confirmation sends only set and slot, guards double click and displays escaped receipt',async()=>{
  const ui=await screen('booking-slots',(url,options)=>({ok:true,status:200,data:options.method==='POST'?{booking:bookingFixture}:bookingReply(url)}));
  slotClick(ui,'select');
  assert.equal(ui.calls.some(call=>call.options.method==='POST'),false);
  const pending=slotClick(ui,'confirm');
  await slotClick(ui,'confirm'); await pending;
  const posts=ui.calls.filter(call=>call.options.method==='POST');
  assert.equal(posts.length,1);assert.equal(posts[0].url,'/api/student/bookings');
  assert.deepEqual(JSON.parse(posts[0].options.body),{book_set_id:4,slot_id:7});
  assert.match(ui.node('slots-page').outerHTML,/จองสำเร็จ/);assert.match(ui.node('slots-page').outerHTML,/A015/);
  assert.match(ui.node('slots-page').outerHTML,/&lt;img&gt;/);assert.doesNotMatch(ui.node('slots-page').outerHTML,/<img>/);
});
test('Lost booking response recovers saved receipt without a second POST',async()=>{
  let saved=[];
  const ui=await screen('booking-slots',(url,options)=>{
    if(options.method==='POST'){saved=[bookingFixture];throw new Error('Response lost');}
    return {ok:true,status:200,data:bookingReply(url,saved)};
  });
  slotClick(ui,'select'); await slotClick(ui,'confirm');
  assert.match(ui.node('slots-page').outerHTML,/พบการจองที่บันทึกแล้ว/);
  assert.match(ui.node('slots-page').outerHTML,/A015/);
  assert.equal(ui.calls.filter(call=>call.options.method==='POST').length,1);
});
test('Existing booking disables set rebooking and own booking page survives refresh',async()=>{
  const handler=url=>({ok:true,status:200,data:bookingReply(url,[bookingFixture])});
  const ui=await screen('booking-slots',handler);
  assert.match(ui.node('app').innerHTML,/คุณจองชุดนี้แล้ว/);
  assert.match(ui.node('app').innerHTML,/data-slot-id="7"[^>]*disabled/);
  await slotClick(ui,'select');await slotClick(ui,'confirm');
  assert.equal(ui.calls.some(call=>call.options.method==='POST'),false);
  const receipt=await screen('my-booking',handler);
  assert.match(receipt.node('app').innerHTML,/A015/);assert.match(receipt.node('app').innerHTML,/900010/);
});
test('Full response refreshes availability and never shows a success receipt',async()=>{
  let full=false;
  const ui=await screen('booking-slots',(url,options)=>{
    if(options.method==='POST'){full=true;return {ok:false,status:409,data:{message:'คิวเต็ม กรุณาเลือกรอบใหม่'}};}
    const data=bookingReply(url);
    if(full&&data.slots)data.slots[0]={...data.slots[0],availability:'FULL',remaining:0,booked_count:20};
    return {ok:true,status:200,data};
  });
  slotClick(ui,'select');await slotClick(ui,'confirm');
  assert.match(ui.node('slots-page').outerHTML,/คิวเต็ม/);
  assert.match(ui.node('slots-page').outerHTML,/data-slot-id="7"[^>]*disabled/);
  assert.doesNotMatch(ui.node('slots-page').outerHTML,/จองสำเร็จ/);
});

test('Student slot cards show real counts, disable full/closed/past and preview without booking', async () => {
  const rows = ['AVAILABLE','FULL','CLOSED','PAST'].map((availability,index) => ({slot_id:index+1,booking_date:'2031-09-15',start_time:'09:00:00',end_time:'09:30:00',max_students:20,booked_count:availability==='FULL'?20:17,remaining:availability==='FULL'?0:3,status:availability==='CLOSED'?'CLOSED':'OPEN',availability}));
  const ui = await screen('booking-slots', url => ({ok:true,status:200,data:url==='/api/auth/me'?{student:{first_name:'ทดสอบ'}}:{slots:rows,book_sets:[{book_set_id:1,semester:1,academic_year:2574,books:[{book_name:'หนังสือของฉัน',book_code:'IT01'}]}],bookings:[]}}));
  const html = ui.node('app').innerHTML;
  assert.match(html,/17 \/ 20/); assert.match(html,/เหลือ <strong>3/);
  for(const id of [2,3,4]) assert.match(html,new RegExp('data-slot-id="'+id+'"[^>]*disabled'));
  const before=ui.calls.length;
  ui.node('slots-page').click({target:{closest:()=>({dataset:{slotAction:'select',slotId:'1'},disabled:false})}});
  assert.match(ui.node('slots-page').outerHTML,/ยังไม่ได้บันทึกการจอง/);
  assert.equal(ui.calls.length,before);
});

test('Admin slot form sends canonical payload and status toggle uses PATCH', async () => {
  const row={slot_id:7,booking_date:'2031-09-15',start_time:'09:00:00',end_time:'09:30:00',max_students:20,booked_count:0,remaining:20,status:'OPEN',availability:'AVAILABLE',has_bookings:false};
  const ui=await screen('admin-slots',url=>({ok:true,status:200,data:url==='/api/admin/auth/me'?{admin:{name:'เจ้าหน้าที่'}}:{slots:[row]}}));
  for(const [key,value] of [['slot-date','2031-09-16'],['slot-start','10:00'],['slot-end','10:30'],['slot-capacity','25'],['slot-status','OPEN']]) ui.node(key).value=value;
  await ui.node('slot-form').submit({preventDefault(){}});
  const created=ui.calls.find(call=>call.options.method==='POST');
  assert.equal(created.url,'/api/admin/booking-slots');
  assert.deepEqual(JSON.parse(created.options.body),{booking_date:'2031-09-16',start_time:'10:00',end_time:'10:30',max_students:25,status:'OPEN'});
  await ui.node('slots-page').click({target:{closest:()=>({dataset:{slotAction:'status',slotId:'7'},disabled:false})}});
  const toggle=ui.calls.find(call=>call.options.method==='PATCH');
  assert.equal(toggle.url,'/api/admin/booking-slots/7/status');
  assert.deepEqual(JSON.parse(toggle.options.body),{status:'CLOSED'});
});

test('Slot empty state and filter refresh do not fabricate rounds', async () => {
  const ui=await screen('booking-slots',url=>({ok:true,status:200,data:url==='/api/auth/me'?{student:{first_name:'ทดสอบ'}}:{slots:[],book_sets:[],bookings:[]}}));
  assert.match(ui.node('app').innerHTML,/ยังไม่มีรอบรับหนังสือสำหรับวันที่แสดง/);
  ui.node('filter-date').value='2031-09-15';
  await ui.node('slot-filter').submit({preventDefault(){}});
  assert.equal(ui.calls.at(-1).url,'/api/student/booking-slots?date=2031-09-15');
});

async function screen(page, handler) {
  const nodes = new Map();
  const calls = [];
  let destination;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', value: '', type: 'password', attrs: {}, disabled: false, focus() { this.focused = true; },
      addEventListener(event, callback) { this[event] = callback; },
      setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
      querySelector() { return node('submit'); }, classList: { toggle() {} }
    });
    return nodes.get(id);
  }
  const context = {
    setTimeout, clearTimeout,
    document: { body: { dataset: { page } }, getElementById: node, querySelector: node, querySelectorAll: () => [] },
    window: { addEventListener() {}, location: { replace(value) { destination = value; } } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const reply = handler ? handler(url, options) : { ok: true, status: 200, data: {} };
      return { ...reply, json: async () => reply.data };
    }
  };
  await vm.runInNewContext(source, context);
  return { node, calls, destination: () => destination };
}

test('Student form posts credentials, clears password and redirects on success', async () => {
  const ui = await screen('login');
  assert.doesNotMatch(ui.node('app').innerHTML, /เข้าชมหน้านักศึกษาตัวอย่าง/);
  ui.node('username').value = '66309010001'; ui.node('password').value = 'chosen-password';
  await ui.node('login-form').submit({ preventDefault() {}, currentTarget: ui.node('login-form') });
  assert.equal(ui.calls[0].url, '/api/auth/login');
  assert.deepEqual(JSON.parse(ui.calls[0].options.body), { student_code: '66309010001', password: 'chosen-password' });
  assert.equal(ui.node('password').value, ''); assert.equal(ui.destination(), 'home.html');
});

test('Wrong login displays API message, stays on form and unlocks button', async () => {
  const ui = await screen('login', () => ({ ok: false, status: 401, data: { message: 'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง' } }));
  ui.node('username').value = '66309010001'; ui.node('password').value = 'wrong';
  await ui.node('login-form').submit({ preventDefault() {}, currentTarget: ui.node('login-form') });
  assert.match(ui.node('login-message').textContent, /ไม่ถูกต้อง/);
  assert.equal(ui.node('password').value, ''); assert.equal(ui.node('submit').disabled, false);
  assert.equal(ui.destination(), undefined);
});

test('Profile uses logged-in student data and escapes HTML from database', async () => {
  const ui = await screen('profile', () => ({ ok: true, status: 200, data: { student: {
    first_name: '<script>alert(1)</script>', last_name: 'ทดสอบ', student_code: '00222',
    department_name: 'บัญชี', education_level_name: 'ปวส.1', classroom_name: 'ปวส.1/2', phone: null, email: 'other@example.com'
  } } }));
  const html = ui.node('app').innerHTML;
  assert.match(html, /00222/); assert.match(html, /ปวส.1\/2/); assert.match(html, /other@example.com/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /สมชาย ใจดี|66309010001/);
  await ui.node('logout').click({ currentTarget: ui.node('logout') });
  assert.equal(ui.calls.at(-1).url, '/api/auth/logout'); assert.equal(ui.destination(), 'index.html');
});

test('Expired session redirects; database failure never shows a fake profile', async () => {
  const unauthorized = await screen('profile', () => ({ ok: false, status: 401, data: { message: 'เข้าสู่ระบบใหม่' } }));
  assert.equal(unauthorized.destination(), 'index.html');
  const unavailable = await screen('profile', () => ({ ok: false, status: 503, data: { message: 'DB unavailable' } }));
  assert.match(unavailable.node('app').innerHTML, /โหลดข้อมูลไม่สำเร็จ/);
  assert.doesNotMatch(unavailable.node('app').innerHTML, /สมชาย/);
});

test('Admin login posts to separate auth API; password visibility still works', async () => {
  const ui = await screen('admin-login');
  assert.doesNotMatch(ui.node('app').innerHTML, /เข้าชมหน้าเจ้าหน้าที่ตัวอย่าง/);
  ui.node('toggle-password').click({ currentTarget: ui.node('toggle-password') });
  assert.equal(ui.node('password').type, 'text');
  await ui.node('login-form').submit({ preventDefault() {}, currentTarget: ui.node('login-form') });
  assert.equal(ui.calls[0].url, '/api/admin/auth/login');
  assert.equal(ui.destination(), 'dashboard.html');
});

test('Student book list renders only API sets, escapes content, and has no group selector', async () => {
  const ui = await screen('books', url => ({ ok: true, status: 200, data: url === '/api/auth/me' ? { student: { first_name:'นักศึกษา',last_name:'บัญชี' } } : { book_sets: [{ department_name:'การบัญชี', education_level_name:'ปวส.2',classroom_name:'2/1',semester:1,academic_year:2569,books:[{book_id:1,book_code:'AC01',book_name:'บัญชี <img>',description:null}] }] } }));
  const html = ui.node('app').innerHTML;
  assert.match(html, /AC01/); assert.match(html, /บัญชี &lt;img&gt;/);
  assert.doesNotMatch(html, /31901-2001|เทคโนโลยีสารสนเทศ|<select/);
  assert.equal(ui.calls[1].url, '/api/student/book-sets');
});

test('Student without assigned set sees empty state rather than sample books', async () => {
  const ui = await screen('books', url => ({ ok:true,status:200,data:url === '/api/auth/me' ? {student:{first_name:'ทดสอบ',last_name:'ว่าง'}} : {book_sets:[]} }));
  assert.match(ui.node('app').innerHTML, /ยังไม่มีชุดหนังสือสำหรับบัญชีของคุณ/);
  assert.doesNotMatch(ui.node('app').innerHTML, /31901-2001/);
});

test('Admin book form renders database books and sends create payload', async () => {
  const ui = await screen('admin-books', url => ({ ok:true,status:200,data:url === '/api/admin/auth/me' ? {admin:{name:'เจ้าหน้าที่'}} : {books:[{book_id:5,book_code:'T01',book_name:'ทดสอบ',description:''}]} }));
  assert.match(ui.node('app').innerHTML, /เพิ่มหนังสือ/); assert.match(ui.node('app').innerHTML, /T01/);
  ui.node('book-code').value = 'NEW01'; ui.node('book-name').value = 'เล่มใหม่'; ui.node('book-description').value = 'รายละเอียด';
  ui.node('book-form').submit({preventDefault(){}});
  await new Promise(resolve => setImmediate(resolve));
  const request = ui.calls.find(call => call.options.method === 'POST');
  assert.equal(request.url,'/api/admin/books');
  assert.deepEqual(JSON.parse(request.options.body),{book_code:'NEW01',book_name:'เล่มใหม่',description:'รายละเอียด'});
});

test('Admin set form sends group, Buddhist year and multiple selected book IDs', async () => {
  const ui = await screen('admin-book-sets', url => ({ok:true,status:200,data:
    url === '/api/admin/auth/me' ? {admin:{name:'เจ้าหน้าที่'}} :
    url === '/api/admin/lookups' ? {departments:[{department_id:2,department_name:'บัญชี'}],education_levels:[{education_level_id:3,education_level_name:'ปวส.2'}],classrooms:[{classroom_id:4,department_id:2,education_level_id:3,classroom_name:'2/1'}]} :
    url === '/api/admin/books' ? {books:[{book_id:7,book_code:'A',book_name:'เล่ม1'},{book_id:8,book_code:'B',book_name:'เล่ม2'}]} : {book_sets:[]}}));
  assert.match(ui.node('app').innerHTML,/สร้างชุดหนังสือ/);
  for(const [id,value] of [['set-department','2'],['set-level','3'],['set-classroom','4'],['set-semester','1'],['set-year','2569']]) ui.node(id).value=value;
  ui.node('catalog-page').querySelectorAll=()=>[{value:'7'},{value:'8'}];
  ui.node('set-form').submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  const request=ui.calls.find(call=>call.options.method==='POST');
  assert.equal(request.url,'/api/admin/book-sets');
  assert.deepEqual(JSON.parse(request.options.body),{department_id:2,education_level_id:3,classroom_id:4,semester:1,academic_year:2569,book_ids:[7,8]});
});

test('Phase 16 home shows actual set and earliest pending booking with both primary actions',async()=>{
 const rows=[{...bookingFixture,queue_number:'A999',booking_status:'RECEIVED'}, {...bookingFixture,queue_number:'A021',booking_date:'2031-09-16'}, {...bookingFixture,queue_number:'A015',booking_date:'2031-09-15'}];
 const ui=await screen('home',url=>({ok:true,status:200,data:bookingReply(url,rows)}));
 const html=ui.node('app').innerHTML;assert.match(html,/1 ชุด · 1 เล่ม/);assert.match(html,/A015/);assert.doesNotMatch(html,/A999|A021/);assert.match(html,/รอรับ \/ เช็กอินแล้ว 2 รายการ/);assert.match(html,/href="booking-slots.html">จองคิวรับหนังสือ/);assert.match(html,/href="my-booking.html">การจองของฉัน/);
 const empty=await screen('home',url=>({ok:true,status:200,data:bookingReply(url,[])}));assert.match(empty.node('app').innerHTML,/ยังไม่มีการจอง/);
});

test('Initial student password redirects before requesting protected data', async () => {
  const ui=await screen('home',()=>({ok:true,status:200,data:{student:{student_code:'900010',first_name:'Student',must_change_password:1}}}));
  assert.deepEqual(ui.calls.map(c=>c.url),['/api/auth/me']);
  assert.equal(ui.destination(),'change-password.html');
});

test('Dedicated password pages load only account data and render the password form', async()=>{
 for(const page of ['change-password','admin-password']){
 const ui=await screen(page,()=>({ok:true,status:200,data:{student:{student_code:'900010',must_change_password:1},admin:{name:'Admin'}}}));
 assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].url,page==='admin-password'?'/api/admin/auth/me':'/api/auth/me');
 assert.match(ui.node('app').innerHTML,/id="own-password-form"/);assert.doesNotMatch(ui.node('app').innerHTML,/own-password-panel/);assert.equal(ui.destination(),undefined);
 }
});
