const emptyBookingFilters = () => ({q:'',department_id:'',education_level_id:'',classroom_id:'',date:'',status:''});
let dashboardLookups = null;
const dashboardState = { summary:null, list:null, filters:emptyBookingFilters(), group:'department', groupId:null, groupLabel:'ทุกรายการ', page:1, detail:null, busy:false, message:'' };
const dashboardStatuses = { WAITING:'รอรับหนังสือ',CHECKED_IN:'เช็กอินแล้ว',RECEIVED:'รับหนังสือแล้ว',CANCELLED:'ยกเลิกแล้ว',NO_SHOW:'ไม่มาตามนัด' };
function dashboardListUrl() {
  const params = new URLSearchParams({page:String(dashboardState.page)});
  if (dashboardState.groupId !== null) { params.set('group_by',dashboardState.group); params.set('group_id',dashboardState.groupId); }
  for(const [key,value] of Object.entries(dashboardState.filters)) if(value) params.set(key,value);
  return '/api/admin/bookings?' + params;
}
async function loadDashboard() {
  const [summary,list] = await Promise.all([api('/api/admin/dashboard?group_by='+dashboardState.group),api(dashboardListUrl())]);
  dashboardState.summary=summary; dashboardState.list=list; dashboardState.detail=null;
}
function dashboardStatsView() {
  const state=dashboardState, summary=state.summary;
  if (!summary) return '<section class="card"><p>ยังโหลดภาพรวมไม่ได้ กรุณาโหลดหน้าใหม่</p></section>';
  if(typeof page!=='undefined'&&page==='admin-bookings')return `<section id="dashboard-panel" aria-busy="${state.busy}"><p role="status">${escapeHtml(state.message)}</p>${dashboardBookingsView()}${dashboardDetailView()}</section>`;
  const totals=summary.totals;
  const cards=[['รายการจองทั้งหมด',totals.total],['นัดรับวันนี้',totals.today],['รับหนังสือแล้ว',totals.received],['ยังไม่รับ',totals.pending],['ยกเลิก',totals.cancelled],['ไม่มาตามนัด (No Show)',totals.no_show]];
  return `<section id="dashboard-panel" aria-busy="${state.busy}"><p class="muted">ข้อมูล ณ ${escapeHtml(summary.generated_at)} (เวลาไทย) · นักศึกษาไม่ซ้ำ ${totals.students} คน</p>
    <p class="muted">ยอดนับเป็นรายการจองทุกช่วงเวลา รวมประวัติที่ยกเลิก · วันนี้อิงวันนัดรับ ${escapeHtml(summary.today)} · ยังไม่รับ = รอรับ + เช็กอินแล้ว</p>
    <p role="status">${escapeHtml(state.message)}</p><div class="grid three section">${cards.map(([label,value])=>`<article class="card"><span class="stat-label">${label}</span><strong class="stat">${value}</strong></article>`).join('')}</div>
    <section class="card section"><div class="actions"><label for="dashboard-group">แยกข้อมูลตาม</label><select id="dashboard-group" ${state.busy?'disabled':''}>${[['department','สาขา'],['level','ระดับชั้น'],['classroom','ห้องเรียน'],['date','วันนัดรับ'],['book_set','ชุดหนังสือ']].map(([value,label])=>`<option value="${value}" ${state.group===value?'selected':''}>${label}</option>`).join('')}</select><button class="button secondary" data-dashboard-action="refresh" ${state.busy?'disabled':''}>โหลดข้อมูลใหม่</button></div>
    <div class="dashboard-table" tabindex="0" role="region" aria-label="ตารางข้อมูล เลื่อนแนวนอนเพื่อดูเพิ่มเติม"><table><caption>ยอดแยกตามกลุ่ม กดดูรายชื่อเพื่อเปิดรายการจองของกลุ่มนั้น</caption><thead><tr><th scope="col">กลุ่ม</th><th scope="col">ทั้งหมด</th><th scope="col">รับแล้ว</th><th scope="col">ยังไม่รับ</th><th scope="col">ยกเลิก</th><th scope="col">No Show</th><th scope="col">รายละเอียด</th></tr></thead><tbody>${summary.groups.map(row=>`<tr><th scope="row">${escapeHtml(row.label)}</th><td>${row.total}</td><td>${row.received}</td><td>${row.pending}</td><td>${row.cancelled}</td><td>${row.no_show}</td><td><button class="button secondary" data-dashboard-action="group" data-id="${escapeHtml(row.group_id)}" ${state.busy?'disabled':''}>ดูรายชื่อ</button></td></tr>`).join('') || '<tr><td colspan="7">ยังไม่มีการจอง</td></tr>'}</tbody></table></div></section>
    ${dashboardBookingsView()}${dashboardDetailView()}</section>`;
}
function dashboardBookingsView() {
  const state=dashboardState,list=state.list;
  if (!list) return '';
  return `<section class="card section"><h2>รายการจอง / ${escapeHtml(state.groupLabel)}</h2><p>${list.total} รายการตามเงื่อนไข · หน้า ${list.page}</p>${bookingFiltersView()}<button class="button secondary" data-dashboard-action="all" ${state.busy?'disabled':''}>ดูทุกรายการ</button>
    <div class="dashboard-table" tabindex="0" role="region" aria-label="ตารางข้อมูล เลื่อนแนวนอนเพื่อดูเพิ่มเติม"><table><caption>รายชื่อนักศึกษาและสถานะคิว</caption><thead><tr><th scope="col">เลขคิว / วันเวลา</th><th scope="col">นักศึกษา</th><th scope="col">กลุ่ม / ชุดหนังสือ</th><th scope="col">สถานะ</th><th scope="col">รายละเอียด</th></tr></thead><tbody>${list.bookings.map(row=>`<tr><td><strong>${escapeHtml(row.queue_number)}</strong><br>${slotPeriod(row)}</td><td>${escapeHtml(row.student_code)}<br>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</td><td>${escapeHtml(row.department_name)} / ${escapeHtml(row.education_level_name)} / ${escapeHtml(row.classroom_name)}<br>เทอม ${escapeHtml(row.semester)} / ${escapeHtml(row.academic_year)}</td><td><span class="badge status-${escapeHtml(row.booking_status)}">${escapeHtml(dashboardStatuses[row.booking_status])}</span></td><td><button class="button secondary" data-dashboard-action="detail" data-id="${row.booking_id}" ${state.busy?'disabled':''}>ดูรายละเอียด</button></td></tr>`).join('') || '<tr><td colspan="5">ไม่พบรายการจองในหน้านี้</td></tr>'}</tbody></table></div>
    <div class="actions section"><button class="button secondary" data-dashboard-action="previous" ${state.busy||list.page<=1?'disabled':''}>หน้าก่อน</button><button class="button secondary" data-dashboard-action="next" ${state.busy||list.page*list.page_size>=list.total?'disabled':''}>หน้าถัดไป</button></div></section>`;
}
function dashboardDetailView() {
  const row=dashboardState.detail;
  if (!row) return '';
  return `<section class="card section" id="dashboard-detail" tabindex="-1"><h2>รายละเอียดคิว ${escapeHtml(row.queue_number)}</h2><p>${escapeHtml(dashboardStatuses[row.booking_status])}</p><dl class="details"><div><dt>นักศึกษา</dt><dd>${escapeHtml(row.student_code)} · ${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</dd></div><div><dt>สาขา / ระดับชั้น / ห้อง</dt><dd>${escapeHtml(row.department_name)} / ${escapeHtml(row.education_level_name)} / ${escapeHtml(row.classroom_name)}</dd></div><div><dt>วันและเวลารับ</dt><dd>${slotPeriod(row)}</dd></div><div><dt>ชุดหนังสือ</dt><dd>เทอม ${escapeHtml(row.semester)} / ${escapeHtml(row.academic_year)}</dd></div><div><dt>เวลาจอง (ไทย)</dt><dd>${escapeHtml(row.created_at)}</dd></div><div><dt>เวลารับ (ไทย)</dt><dd>${escapeHtml(row.received_at)}</dd></div></dl>${bookRows(row.books)}<p class="muted section">ยืนยันส่งมอบหนังสือผ่านหน้าสแกน QR ตามขั้นตอนเดิม</p><a class="button" href="admin-scanner.html">เปิดหน้าสแกนรับหนังสือ</a></section>`;
}
function renderDashboard() {
  document.getElementById('dashboard-panel').outerHTML=dashboardStatsView();
  bindDashboardUI();
}
async function dashboardAction(action,id) {
  const state=dashboardState;
  if (state.busy) return;
  const prior={group:state.group,groupId:state.groupId,groupLabel:state.groupLabel,page:state.page,filters:{...state.filters}};
  state.busy=true; state.message='กำลังโหลดข้อมูล…'; state.detail=null;
  renderDashboard();
  try {
    if (action==='filter') {state.filters=id;state.page=1;}
    if (action==='all') state.filters=emptyBookingFilters();
    if (action==='dimension') {state.group=id;state.groupId=null;state.groupLabel='ทุกรายการ';state.page=1;}
    if (action==='group') {state.groupId=id;state.groupLabel=state.summary.groups.find(row=>String(row.group_id)===id)?.label || id;state.page=1;}
    if (action==='all') {state.groupId=null;state.groupLabel='ทุกรายการ';state.page=1;}
    if (action==='previous') state.page=Math.max(1,state.page-1);
    if (action==='next') state.page++;
    if (action==='detail') state.detail=(await api('/api/admin/bookings/'+Number(id))).booking;
    else await loadDashboard();
    state.message='โหลดข้อมูลแล้ว';
  } catch(error) {
    Object.assign(state,prior);
    if (error.status===401) {window.location.replace('admin-login.html');return;}
    state.message='โหลดข้อมูลล่าสุดไม่สำเร็จ ข้อมูลที่แสดงเป็นข้อมูลเดิม กรุณาลองใหม่';
  } finally { state.busy=false; }
  renderDashboard();
  if (state.detail) document.getElementById('dashboard-detail')?.focus();
}
function bindDashboardUI() {
  bindBookingFilters();
  document.getElementById('dashboard-group')?.addEventListener('change',event=>dashboardAction('dimension',event.target.value));
  document.getElementById('dashboard-panel')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-dashboard-action]');
    if (button && !button.disabled) dashboardAction(button.dataset.dashboardAction,button.dataset.id);
  });
}

function bookingFilterOptions(rows,key,label,selected) {
  return '<option value="">ทั้งหมด</option>'+rows.map(row=>`<option value="${row[key]}" ${String(row[key])===String(selected)?'selected':''}>${escapeHtml(row[label])}</option>`).join('');
}
function bookingFilterClassrooms(department,level) {
  return (dashboardLookups?.classrooms || []).filter(row=>(!department || String(row.department_id)===department) && (!level || String(row.education_level_id)===level)).map(row=>({...row,label:[dashboardLookups.departments.find(item=>item.department_id===row.department_id)?.department_name,dashboardLookups.education_levels.find(item=>item.education_level_id===row.education_level_id)?.education_level_name,row.classroom_name].join(' / ')}));
}
function bookingFiltersView() {
  if(!dashboardLookups)return '';
  const f=dashboardState.filters;
  return `<form id="booking-filters" class="section"><fieldset ${dashboardState.busy?'disabled':''}><legend>ค้นหาและกรองรายการจอง</legend><p class="muted">ค้นจากรหัสนักศึกษา ชื่อ–นามสกุล หรือเลขคิว · เงื่อนไขใช้ร่วมกันกับกลุ่มที่เลือก · ยอดภาพรวมดูได้ที่เมนูภาพรวม</p>
    <div class="grid three"><div><label for="booking-search">คำค้นหา</label><input id="booking-search" name="q" maxlength="100" value="${escapeHtml(f.q)}" placeholder="รหัสนักศึกษา ชื่อ หรือเลขคิว"></div>
    <div><label for="filter-department">สาขา</label><select id="filter-department" name="department_id">${bookingFilterOptions(dashboardLookups.departments,'department_id','department_name',f.department_id)}</select></div>
    <div><label for="filter-level">ระดับชั้น</label><select id="filter-level" name="education_level_id">${bookingFilterOptions(dashboardLookups.education_levels,'education_level_id','education_level_name',f.education_level_id)}</select></div>
    <div><label for="filter-classroom">ห้องเรียน</label><select id="filter-classroom" name="classroom_id">${bookingFilterOptions(bookingFilterClassrooms(f.department_id,f.education_level_id),'classroom_id','label',f.classroom_id)}</select></div>
    <div><label for="filter-booking-date">วันนัดรับ</label><input id="filter-booking-date" name="date" type="date" value="${escapeHtml(f.date)}"></div>
    <div><label for="filter-booking-status">สถานะ</label><select id="filter-booking-status" name="status"><option value="">ทั้งหมด</option>${Object.entries(dashboardStatuses).map(([key,label])=>`<option value="${key}" ${f.status===key?'selected':''}>${label}</option>`).join('')}</select></div></div>
    <div class="actions section"><button class="button" type="submit">ค้นหา / ใช้ตัวกรอง</button><button class="button secondary" type="button" data-dashboard-action="all">ล้างการค้นหาและกลุ่ม</button></div></fieldset></form>`;
}
function bindBookingFilters() {
  const form=document.getElementById('booking-filters');
  if(!form)return;
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const filters=Object.fromEntries(Object.keys(emptyBookingFilters()).map(key=>[key,form.elements.namedItem(key).value.trim()]));
    dashboardAction('filter',filters);
  });
  const updateRooms=()=>{
    const department=form.elements.namedItem('department_id').value,level=form.elements.namedItem('education_level_id').value;
    const room=form.elements.namedItem('classroom_id');
    const rows=bookingFilterClassrooms(department,level);
    room.innerHTML=bookingFilterOptions(rows,'classroom_id','label',rows.some(row=>String(row.classroom_id)===room.value)?room.value:'');
  };
  form.elements.namedItem('department_id').addEventListener('change',updateRooms);
  form.elements.namedItem('education_level_id').addEventListener('change',updateRooms);
}
