// Phase 4 uses authenticated student book sets and admin catalog APIs.
const page = document.body.dataset.page;
const admin = ['admin-password', 'dashboard', 'admin-login', 'admin-books', 'admin-book-sets', 'admin-slots', 'admin-scanner', 'admin-reports', 'admin-announcements', 'admin-students', 'admin-bookings'].includes(page);
let adminAccount = null;
let studentSets = [];
let student = null;
function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function studentText(key) { return escapeHtml(student?.[key]); }
let passwordBusy=false;
function passwordFormView(reset=false){
 const prefix=reset?'reset':'own',minimum=6;
 return `<form id="${prefix}-password-form"><p>${reset?'ตั้งรหัสใหม่ให้นักศึกษาที่แสดงด้านบน และแจ้งรหัสให้นักศึกษาเป็นส่วนตัว':'เปลี่ยนรหัสของบัญชีที่เข้าสู่ระบบอยู่'}</p><p class="muted">รหัสใหม่ ${minimum}–128 ตัวอักษร ต้องต่างจากรหัสเดิม เมื่อสำเร็จบัญชีที่เปลี่ยนรหัสจะออกจากระบบทุกเซสชัน</p><fieldset id="${prefix}-password-fields" class="password-fields"><legend class="sr-only">ข้อมูลรหัสผ่าน</legend><label for="${prefix}-current-password">${reset?'รหัสผ่านปัจจุบันของเจ้าหน้าที่':'รหัสผ่านปัจจุบัน'}</label><input id="${prefix}-current-password" type="password" required maxlength="128" autocomplete="current-password"><label for="${prefix}-new-password">รหัสผ่านใหม่${reset?'ของนักศึกษา':''}</label><input id="${prefix}-new-password" type="password" required minlength="${minimum}" maxlength="128" autocomplete="new-password"><label for="${prefix}-confirm-password">ยืนยันรหัสผ่านใหม่</label><input id="${prefix}-confirm-password" type="password" required minlength="${minimum}" maxlength="128" autocomplete="new-password"><label class="password-toggle"><input id="${prefix}-show-password" type="checkbox"> แสดงรหัสผ่านใหม่</label><div class="actions"><button type="submit" class="button">${reset?'ยืนยันรีเซ็ตรหัสนักศึกษาคนนี้':'บันทึกรหัสผ่านใหม่'}</button></div></fieldset><p id="${prefix}-password-message" role="status"></p></form>`;
}
function bindPasswordForm(reset=false,target=null){
 const prefix=reset?'reset':'own';
 document.getElementById(prefix+'-show-password')?.addEventListener('change',event=>{
  for(const key of ['new','confirm'])document.getElementById(prefix+'-'+key+'-password').type=event.target.checked?'text':'password';
 });
 document.getElementById(prefix+'-password-form')?.addEventListener('submit',event=>submitPasswordChange(event,reset,target));
}
async function submitPasswordChange(event,reset=false,target=null){
 event.preventDefault();if(passwordBusy)return;
 const prefix=reset?'reset':'own',message=document.getElementById(prefix+'-password-message');
 const inputs=['current','new','confirm'].map(key=>document.getElementById(prefix+'-'+key+'-password'));
 const body={current_password:inputs[0].value,new_password:inputs[1].value,confirm_password:inputs[2].value};
 if(body.new_password!==body.confirm_password){message.textContent='ยืนยันรหัสผ่านใหม่ไม่ตรงกัน';inputs[2].focus();return;}
 if(reset)body.student_code=target.student_code;
 const endpoint=reset?'/api/admin/students/'+target.student_id+'/password':admin?'/api/admin/auth/password':'/api/auth/password';
 const fields=document.getElementById(prefix+'-password-fields');passwordBusy=true;fields.disabled=true;
 if(reset)studentBusy(true);
 message.textContent='กำลังบันทึกรหัสผ่าน…';let success=false;
 try{
  const result=await api(endpoint,body);success=true;
  // Never retain credentials in state or put a supplied password into HTML.
  inputs.forEach(input=>{input.value='';input.type='password';});
  message.textContent=result.message;
  if(!reset){
   const link=document.createElement('a');link.className='button secondary';link.href=admin?'admin-login.html':'index.html';link.textContent='เข้าสู่ระบบด้วยรหัสใหม่';message.appendChild(document.createElement('br'));message.appendChild(link);
  }
 }catch(error){
  inputs.forEach(input=>{input.value='';input.type='password';});
  if(error.status===401){window.location.replace(admin?'admin-login.html':'index.html');return;}
  message.textContent=error.status?error.message:'การเชื่อมต่อขัดข้อง ผลการบันทึกยังไม่แน่นอน กรุณาลองเข้าสู่ระบบด้วยรหัสใหม่ก่อนทำซ้ำ';
 }finally{
  passwordBusy=false;if(reset)studentBusy(false);fields.disabled=success;
  const checkbox=document.getElementById(prefix+'-show-password');if(checkbox)checkbox.checked=false;
 }
}
function fullName() { return `${studentText('first_name')} ${studentText('last_name')}`; }
const brand = `<a class="brand" href="${admin ? 'dashboard.html' : 'home.html'}"><span class="brand-mark" aria-hidden="true">▤</span><span>Book Queue<small>ระบบจองคิวรับหนังสือ</small></span></a>`;
const notice = `<div class="demo">${admin ? (page==='admin-students'?'เพิ่ม แก้ไข และนำเข้าบัญชีนักศึกษา':'จัดการหนังสือ ชุดหนังสือ และรอบรับหนังสือ') : 'จองคิวรับหนังสือตามชุดที่จัดสรรให้บัญชีของคุณ'}</div>`;
const titles = { 'change-password': 'เปลี่ยนรหัสผ่าน', 'admin-password': 'เปลี่ยนรหัสผ่าน', home: 'หน้าหลัก', 'my-booking': 'การจองของฉัน', books: 'รายการหนังสือ', profile: 'ข้อมูลส่วนตัว', dashboard: 'พื้นที่เจ้าหน้าที่', 'admin-books': 'จัดการหนังสือ', 'admin-book-sets': 'ชุดหนังสือ', 'admin-slots': 'จัดการรอบรับหนังสือ', 'booking-slots': 'รอบรับหนังสือ', 'admin-scanner': 'สแกนรับหนังสือ', 'admin-reports':'รายงาน', 'admin-announcements':'ประกาศ', 'admin-students':'นักศึกษา', 'admin-bookings':'รายการจอง' };
const menu = admin ? [['dashboard','dashboard.html','ภาพรวม','01'],['admin-students','admin-students.html','นักศึกษา','02'],['admin-books','admin-books.html','จัดการหนังสือ','03'],['admin-book-sets','admin-book-sets.html','ชุดหนังสือ','04'],['admin-slots','admin-slots.html','รอบรับหนังสือ','05'],['admin-bookings','admin-bookings.html','รายการจอง','06'],['admin-scanner','admin-scanner.html','สแกนรับหนังสือ','07'],['admin-reports','admin-reports.html','รายงาน','08'],['admin-announcements','admin-announcements.html','ประกาศ','09']] : [
  ['home', 'home.html', 'หน้าหลัก', '01'], ['my-booking', 'my-booking.html', 'การจองของฉัน', '02'],
  ['books', 'books.html', 'รายการหนังสือ', '03'], ['profile', 'profile.html', 'ข้อมูลส่วนตัว', '04'], ['booking-slots', 'booking-slots.html', 'รอบรับหนังสือ', '05']
];

function bookRows(books) {
  return books.map((book, index) => `<div class="row"><div class="book-row"><span class="number">${index + 1}</span><div><h3>${escapeHtml(book.book_name)}</h3><p class="muted">${escapeHtml(book.book_code)}</p>${book.description ? `<p class="muted">${escapeHtml(book.description)}</p>` : ''}</div></div><span class="muted">1 เล่ม</span></div>`).join('');
}

function loginView() {
  const label = admin ? 'ชื่อผู้ใช้งาน' : 'รหัสนักศึกษา';
  return `<div class="login-layout"><section class="login-intro">${brand}
    <h1>รับหนังสือเป็นเวลา<br>เริ่มต้นการเรียนได้พร้อมกัน</h1>
    <p>ระบบจองคิวรับหนังสือออนไลน์สำหรับนักศึกษา</p><p>College Book Pickup Queue Booking System</p>
    <div class="section"><span class="badge">${admin ? 'สำหรับเจ้าหน้าที่' : 'สำหรับนักศึกษา'}</span></div>
    </section><main class="login-form-area" id="main"><div class="login-card">
    <span class="eyebrow">${admin ? 'ADMIN PORTAL' : 'STUDENT PORTAL'}</span>
    <h1>${admin ? 'เข้าสู่ระบบเจ้าหน้าที่' : 'ยินดีต้อนรับนักศึกษา'}</h1>
    <p class="muted">${admin ? 'จัดการข้อมูลการรับหนังสือของวิทยาลัย' : 'ดูชุดหนังสือและตรวจสอบคิวรับหนังสือของคุณ'}</p>
    ${admin ? notice : '<p class="muted">เข้าสู่ระบบด้วยรหัสนักศึกษาและรหัสผ่านของคุณ</p>'}
    <form id="login-form">
      <label for="username">${label}</label><input id="username" name="username" autocomplete="username" maxlength="${admin ? 50 : 20}" placeholder="${admin ? 'ชื่อผู้ใช้งานเจ้าหน้าที่' : 'เช่น 66309010001'}" required>
      <label for="password">รหัสผ่าน</label><div class="password-control"><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="กรอกรหัสผ่าน" required><button type="button" class="button secondary" id="toggle-password" aria-controls="password" aria-pressed="false">แสดง</button></div>
      <button class="button full" type="submit">เข้าสู่ระบบ</button>
      <p id="login-message" role="status" class="muted section"></p>
    </form>
    
    <div class="login-footer"><a href="${admin ? 'index.html' : 'admin-login.html'}">${admin ? 'กลับไปหน้าเข้าสู่ระบบนักศึกษา' : 'เข้าสู่ระบบสำหรับเจ้าหน้าที่'}</a></div>
    </div></main></div>`;
}

function homeView() {
  const labels={WAITING:'รอรับหนังสือ',CHECKED_IN:'เช็กอินแล้ว',RECEIVED:'รับหนังสือแล้ว',CANCELLED:'ยกเลิกแล้ว',NO_SHOW:'ไม่มาตามนัด'};
  const pending=ownBookings.filter(row=>['WAITING','CHECKED_IN'].includes(row.booking_status)).sort((a,b)=>(a.booking_date+' '+a.start_time).localeCompare(b.booking_date+' '+b.start_time));
  const current=pending[0]||ownBookings[0];
  return `<section class="card feature welcome"><span class="eyebrow">พร้อมสำหรับภาคเรียนใหม่</span><h2>สวัสดี ${fullName()}</h2><p class="muted">${studentText('department_name')} · ${studentText('education_level_name')} / ${studentText('classroom_name')}</p><div class="actions"><a class="button" href="booking-slots.html">จองคิวรับหนังสือ</a><a class="button secondary" href="my-booking.html">การจองของฉัน</a></div></section>
  <div class="grid two section"><section class="card"><span class="eyebrow">MY BOOK SETS</span><h2>ชุดหนังสือของฉัน</h2><p class="muted">${studentSets.length} ชุด · ${studentSets.reduce((n,set)=>n+set.books.length,0)} เล่ม รวมทุกชุดที่ได้รับการจัดสรร</p>${studentSets.length?studentSets.map(set=>`<div class="row"><div><h3>${escapeHtml(set.department_name||student?.department_name)}</h3><p class="muted">เทอม ${escapeHtml(set.semester)} / ${escapeHtml(set.academic_year)} · ${set.books.length} เล่ม</p></div></div>`).join(''):'<p>ยังไม่มีชุดหนังสือสำหรับบัญชีของคุณ</p>'}<a class="text-link" href="books.html">ดูรายละเอียดหนังสือ →</a></section>
  <section class="card"><span class="eyebrow">MY BOOKING</span><h2>สถานะการจอง</h2>${current?`<span class="badge status-${escapeHtml(current.booking_status)}">${escapeHtml(labels[current.booking_status]||current.booking_status)}</span><h3 class="home-queue">${escapeHtml(current.queue_number)}</h3><p>${slotPeriod(current)}</p><p class="muted">รอรับ / เช็กอินแล้ว ${pending.length} รายการ · ดู QR และประวัติได้ในการจองของฉัน</p>`:'<p class="empty-inline">ยังไม่มีการจอง<br><span class="muted">เลือกชุดหนังสือและรอบที่สะดวกเพื่อเริ่มต้น</span></p>'}<a class="button secondary" href="my-booking.html">ดูการจองของฉัน</a></section></div>
  <div class="section">${latestAnnouncementView()}</div><section class="card section"><h2>รับหนังสือใน 3 ขั้นตอน</h2><ol class="pickup-steps"><li><strong>เลือกชุดหนังสือ</strong><span>ตรวจสอบรายการที่จัดให้สาขาและห้องของคุณ</span></li><li><strong>จองวันและเวลา</strong><span>เลือกรอบที่ว่างและยืนยันเพื่อรับ QR Code</span></li><li><strong>มารับตามนัด</strong><span>แสดง QR Code พร้อมบัตรนักศึกษาต่อเจ้าหน้าที่</span></li></ol></section>`;
}

function bookingView() {
  return ownBookings.length ? ownBookingContent() : '<section class="card empty"><h2>ยังไม่มีการจอง</h2><p class="muted">เลือกชุดหนังสือและวันเวลารับหนังสือเพื่อเริ่มจอง</p><a class="button" href="booking-slots.html">จองคิวรับหนังสือ</a></section>';
}

function booksView() {
  if (!studentSets.length) return '<section class="card empty"><h2>ยังไม่มีชุดหนังสือสำหรับบัญชีของคุณ</h2><p class="muted">เมื่อเจ้าหน้าที่จัดชุดให้สาขา ระดับชั้น และห้องของคุณแล้ว รายการจะแสดงที่นี่</p></section>';
  return studentSets.map(set => `<section class="card section"><div class="row"><div><span class="eyebrow">ชุดหนังสือของฉัน</span><h2>${escapeHtml(set.department_name)}</h2><p class="muted">${escapeHtml(set.education_level_name)} · ${escapeHtml(set.classroom_name)} · ภาคเรียน ${set.semester === 3 ? 'ฤดูร้อน' : set.semester} / ${set.academic_year}</p></div><span class="badge">${set.books.length} เล่ม</span></div>${bookRows(set.books)}</section>`).join('');
}

function profileView() {
  return `<section class="card"><div class="profile-header"><span class="avatar" aria-hidden="true">${escapeHtml(student?.first_name?.slice(0, 1))}</span><div><h2>${fullName()}</h2><span class="badge neutral">ข้อมูลนักศึกษาจากบัญชีของคุณ</span></div></div><dl class="details">
    <div><dt>รหัสนักศึกษา</dt><dd>${studentText('student_code')}</dd></div><div><dt>ชื่อ–นามสกุล</dt><dd>${fullName()}</dd></div><div><dt>สาขาวิชา</dt><dd>${studentText('department_name')}</dd></div><div><dt>ระดับชั้น / ห้องเรียน</dt><dd>${studentText('education_level_name')} / ${studentText('classroom_name')}</dd></div><div><dt>เบอร์โทรศัพท์</dt><dd>${studentText('phone')}</dd></div><div><dt>อีเมล</dt><dd>${studentText('email')}</dd></div></dl></section>`;
}

function dashboardView() {
  return `${dashboardStatsView()}<h2 class="section">เครื่องมือเจ้าหน้าที่</h2><div class="grid two"><section class="card"><h2>จัดการหนังสือ</h2><p class="muted">เพิ่ม แก้ไข ค้นหา และลบหนังสือของวิทยาลัย</p><a class="button" href="admin-books.html">เปิดรายการหนังสือ</a></section><section class="card"><h2>จัดชุดหนังสือ</h2><p class="muted">กำหนดหนังสือตามสาขา ระดับชั้น ห้อง ภาคเรียน และปีการศึกษา</p><a class="button" href="admin-book-sets.html">เปิดชุดหนังสือ</a></section><section class="card"><h2>รอบรับหนังสือ</h2><p class="muted">กำหนดวัน เวลา จำนวนที่รับได้ และเปิดหรือปิดรอบ</p><a class="button" href="admin-slots.html">จัดการรอบรับหนังสือ</a></section><section class="card"><h2>สแกนรับหนังสือ</h2><p class="muted">อ่าน QR ตรวจรายละเอียด และยืนยันการส่งมอบหนังสือ</p><a class="button" href="admin-scanner.html">เปิดหน้าสแกน</a></section></div>`;
}

function shell(content) {
  return `<aside class="sidebar">${brand}<button class="menu-toggle" aria-expanded="false" aria-controls="navigation">เมนู</button><div class="nav-label">${admin ? 'พื้นที่เจ้าหน้าที่' : 'พื้นที่นักศึกษา'}</div><nav id="navigation" aria-label="เมนูหลัก">${menu.map(([id, href, title, icon]) => `<a href="${href}" ${id === page ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</a>`).join('')}<a href="${admin ? 'index.html' : 'admin-login.html'}">${admin ? 'หน้านักศึกษา' : 'หน้าเจ้าหน้าที่'}</a><a href="${admin ? 'admin-password.html' : 'change-password.html'}" ${['change-password','admin-password'].includes(page) ? 'aria-current="page"' : ''}>เปลี่ยนรหัสผ่าน</a><button type="button" class="button secondary" id="logout">ออกจากระบบ</button></nav><div class="sidebar-bottom">College Book Pickup<br>Queue Booking System</div></aside>
    <div class="workspace"><header class="topbar"><span>${admin ? 'ระบบสำหรับเจ้าหน้าที่' : 'ระบบจองคิวรับหนังสือออนไลน์'}</span><span><small>${admin ? escapeHtml(adminAccount?.name) : fullName()}</small><span class="avatar" aria-hidden="true">${admin ? 'AD' : escapeHtml(student?.first_name?.slice(0, 1))}</span></span></header><main id="main"><div class="page-heading"><span class="eyebrow">${admin ? 'ADMIN' : 'STUDENT'} / BOOK QUEUE</span><h1>${titles[page]}</h1></div>${notice}<p id="page-message" role="status"></p>${content}<footer>ระบบจองคิวรับหนังสือออนไลน์สำหรับนักศึกษา · โครงงานระดับ ปวส.  </footer></main></div>`;
}

function ownPasswordView(){return `<section class="card">${student?.must_change_password ? '<p role="alert">กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนใช้งานระบบ รหัสใหม่อย่างน้อย 6 ตัว และต้องไม่ใช่รหัสนักศึกษา</p>' : ''}${passwordFormView()}</section>`;}
const views = { 'change-password': ownPasswordView, 'admin-password': ownPasswordView, home: homeView, 'my-booking': bookingView, books: booksView, profile: profileView, dashboard: dashboardView, 'admin-books': adminBooksView, 'admin-book-sets': adminSetsView, 'admin-slots': slotsView, 'booking-slots': slotsView, 'admin-scanner': scannerView, 'admin-reports': () => reportsView(), 'admin-announcements': () => announcementsView(), 'admin-students': () => studentDirectoryView(), 'admin-bookings': () => dashboardStatsView() };
async function api(url, body, method) {
  const response = await fetch(url, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'ไม่สามารถดำเนินการได้'), { status: response.status });
  return data;
}

function bindUI() {
  bindPasswordForm();
  document.querySelector('.menu-toggle')?.addEventListener('click', (event) => {
    const open = event.currentTarget.getAttribute('aria-expanded') !== 'true';
    event.currentTarget.setAttribute('aria-expanded', String(open));
    document.getElementById('navigation').classList.toggle('is-open', open);
  });
  document.getElementById('toggle-password')?.addEventListener('click', (event) => {
    const input = document.getElementById('password');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'ซ่อน' : 'แสดง';
    event.currentTarget.setAttribute('aria-pressed', String(visible));
  });
  document.getElementById('login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('login-message');
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    message.textContent = 'กำลังเข้าสู่ระบบ…';
    try {
      await api(admin ? '/api/admin/auth/login' : '/api/auth/login', {
        [admin ? 'username' : 'student_code']: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value
      });
      window.location.replace(admin ? 'dashboard.html' : 'home.html');
    } catch (error) {
      message.textContent = error.status ? error.message : 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่';
    } finally {
      document.getElementById('password').value = '';
      submit.disabled = false;
    }
  });
  document.getElementById('logout')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(admin ? '/api/admin/auth/logout' : '/api/auth/logout', {});
      student = null;
      document.getElementById('app').textContent = 'ออกจากระบบแล้ว';
      window.location.replace(admin ? 'admin-login.html' : 'index.html');
    } catch {
      document.getElementById('page-message').textContent = 'ออกจากระบบไม่สำเร็จ กรุณาลองใหม่';
      button.disabled = false;
    }
  });
}

async function initialize() {
  resetScanner();
  const app = document.getElementById('app');
  bookingState.success = null; bookingState.uncertain = false; slotState.selected = null;
  if (!['login', 'admin-login'].includes(page)) {
    app.textContent = 'กำลังโหลดข้อมูล…';
    try {
      const data = await api(admin ? '/api/admin/auth/me' : '/api/auth/me');
      if (admin) { adminAccount = data.admin; if(page!=='admin-password') await loadCatalog(); }
      else {
        student = data.student;
        if(student.must_change_password && page!=='change-password'){
          window.location.replace('change-password.html');return;
        }
        if (['home', 'books'].includes(page)) studentSets = (await api('/api/student/book-sets')).book_sets;
      }
      if (['dashboard','admin-bookings','admin-reports'].includes(page)) { dashboardLookups=await api('/api/admin/lookups'); if(page!=='admin-reports') await loadDashboard(); else await loadReports(); }
      if (page === 'admin-students') await loadStudentDirectory();
      if (page === 'home') await loadLatestAnnouncement();
      if (page === 'admin-announcements') await loadAnnouncements();
      if (!admin && page === 'booking-slots') await loadBookingContext();
      if (!admin && ['home', 'my-booking'].includes(page)) ownBookings = (await api('/api/student/bookings')).bookings;
      if (['admin-slots', 'booking-slots'].includes(page)) await loadSlots();
    } catch (error) {
      student = null; adminAccount = null; studentSets = []; ownBookings = [];
      if (error.status === 401) { window.location.replace(admin ? 'admin-login.html' : 'index.html'); return; }
      app.innerHTML = `<main id="main"><h1>โหลดข้อมูลไม่สำเร็จ</h1><p>กรุณาตรวจการเชื่อมต่อ แล้วโหลดหน้าใหม่</p><a href="${admin ? 'admin-login.html' : 'index.html'}">กลับหน้าเข้าสู่ระบบ</a></main>`;
      return;
    }
  }
  app.innerHTML = page === 'login' || page === 'admin-login' ? loginView() : shell(views[page]());
  bindUI();
  if (page === 'admin-scanner') bindScannerUI();
  if (['dashboard','admin-bookings'].includes(page)) bindDashboardUI();
  if(page==='admin-students')bindStudentDirectory();
  if (page === 'admin-reports') bindReportsUI();
  if (page === 'admin-announcements') bindAnnouncementsUI();
  bindBookingQr();
  if (page === 'my-booking') bindCancellationUI();
  if (['admin-books', 'admin-book-sets'].includes(page)) bindCatalogUI();
  if (['admin-slots', 'booking-slots'].includes(page)) bindSlotsUI();
}
window.addEventListener('pageshow', (event) => { if (event.persisted) initialize(); });
initialize();
