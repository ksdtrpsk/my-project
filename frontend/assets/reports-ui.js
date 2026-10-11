const reportLabels={all:'รายชื่อผู้จองทั้งหมด',received:'รายชื่อผู้รับหนังสือแล้ว',pending:'รายชื่อผู้ยังไม่รับหนังสือ',no_show:'รายชื่อ No Show'};
const reportState={filters:{...emptyBookingFilters(),report:'all'},page:1,data:null,busy:false,csvReady:false,message:''};
function reportUrl(exporting=false) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(reportState.filters))if(value)params.set(key,value);
  if(!exporting)params.set('page',String(reportState.page));
  return '/api/admin/reports/bookings'+(exporting?'.csv':'')+'?'+params;
}
async function loadReports(){reportState.data=await api(reportUrl());}
function reportsView(){
  const state=reportState,f=state.filters,data=state.data;
  return `<section id="reports-panel" aria-busy="${state.busy}"><p role="status">${escapeHtml(state.message)}</p><section class="card"><h2>เลือกรายงาน</h2><p class="muted">ทั้งหมดรวมประวัติยกเลิก · ยังไม่รับ = รอรับ + เช็กอินแล้ว · No Show ตามสถานะที่บันทึก</p>
    <form id="report-filters"><fieldset ${state.busy?'disabled':''}><legend>เงื่อนไขรายงาน</legend><div class="grid three">
    <div><label for="report-type">ประเภทรายงาน</label><select name="report" id="report-type">${Object.entries(reportLabels).map(([key,label])=>`<option value="${key}" ${f.report===key?'selected':''}>${label}</option>`).join('')}</select></div>
    <div><label for="report-search">คำค้นหา</label><input id="report-search" name="q" maxlength="100" value="${escapeHtml(f.q)}" placeholder="รหัสนักศึกษา ชื่อ หรือเลขคิว"></div>
    <div><label for="report-department">สาขา</label><select name="department_id" id="report-department">${bookingFilterOptions(dashboardLookups.departments,'department_id','department_name',f.department_id)}</select></div>
    <div><label for="report-level">ระดับชั้น</label><select name="education_level_id" id="report-level">${bookingFilterOptions(dashboardLookups.education_levels,'education_level_id','education_level_name',f.education_level_id)}</select></div>
    <div><label for="report-classroom">ห้องเรียน</label><select name="classroom_id" id="report-classroom">${bookingFilterOptions(bookingFilterClassrooms(f.department_id,f.education_level_id),'classroom_id','label',f.classroom_id)}</select></div>
    <div><label for="report-date">วันนัดรับ</label><input type="date" name="date" id="report-date" value="${escapeHtml(f.date)}"></div>
    <div><label for="report-status">สถานะเพิ่มเติม</label><select name="status" id="report-status"><option value="">ทั้งหมดในประเภทรายงาน</option>${Object.entries(dashboardStatuses).map(([key,label])=>`<option value="${key}" ${f.status===key?'selected':''}>${label}</option>`).join('')}</select></div></div>
    <div class="actions section"><button class="button" type="submit">แสดงรายงาน</button><button class="button secondary" type="button" data-report-action="clear">ล้างเงื่อนไข</button></div></fieldset></form></section>
    ${data?`<section class="card section"><h2>${escapeHtml(reportLabels[data.report])}</h2><p>${data.total} รายการตามเงื่อนไข · ข้อมูล ณ ${escapeHtml(data.generated_at)} (เวลาไทย)</p><p class="muted">กดแสดงรายงานเพื่อใช้เงื่อนไขที่แก้ไขก่อนดาวน์โหลด CSV ส่งออกครบตามเงื่อนไขที่ใช้ล่าสุด สูงสุด 10,000 รายการ</p>
    <button class="button" type="button" data-report-action="download" ${state.busy?'disabled':''}>ดาวน์โหลด CSV</button>${state.csvReady ? `<p class="section">หากไฟล์ไม่เริ่มดาวน์โหลด <a href="${escapeHtml(reportUrl(true))}" download>ดาวน์โหลด CSV โดยตรง</a></p>` : ''}<p class="muted section">Excel: ใช้ Data → From Text/CSV เลือก UTF-8 และตั้งคอลัมน์รหัสนักศึกษาเป็น Text เพื่อเก็บเลขศูนย์นำหน้า</p>
    <div class="dashboard-table" tabindex="0" role="region" aria-label="ตารางข้อมูล เลื่อนแนวนอนเพื่อดูเพิ่มเติม"><table><caption>รายชื่อเรียงตามสาขา ระดับชั้น ห้อง และวันนัดรับ</caption><thead><tr><th scope="col">นักศึกษา</th><th scope="col">กลุ่ม / ชุดหนังสือ</th><th scope="col">คิว / วันนัดรับ</th><th scope="col">สถานะ / เวลารับ</th></tr></thead><tbody>${data.bookings.map(row=>`<tr><td>${escapeHtml(row.student_code)}<br>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</td><td>${escapeHtml(row.department_name)} / ${escapeHtml(row.education_level_name)} / ${escapeHtml(row.classroom_name)}<br>ชุด ${row.book_set_id} · เทอม ${row.semester} / ${row.academic_year}</td><td>${escapeHtml(row.queue_number)}<br>${slotPeriod(row)}</td><td>${escapeHtml(dashboardStatuses[row.booking_status])}<br>${escapeHtml(row.received_at)}</td></tr>`).join('')||'<tr><td colspan="4">ไม่พบรายการตามเงื่อนไข</td></tr>'}</tbody></table></div>
    <div class="actions section"><button class="button secondary" type="button" data-report-action="previous" ${state.busy||data.page<=1?'disabled':''}>หน้าก่อน</button><span>หน้า ${data.page}</span><button class="button secondary" type="button" data-report-action="next" ${state.busy||data.page*data.page_size>=data.total?'disabled':''}>หน้าถัดไป</button></div></section>`:''}</section>`;
}
function renderReports(){document.getElementById('reports-panel').outerHTML=reportsView();bindReportsUI();}
async function reportAction(action,filters){
  const state=reportState;if(state.busy)return;
  const prior={filters:{...state.filters},page:state.page};state.busy=true;state.csvReady=false;state.message='กำลังดำเนินการ…';renderReports();
  try{
    if(action==='download'){
      const response=await fetch(reportUrl(true),{credentials:'same-origin',cache:'no-store'});
      if(!response.ok){const error=await response.json();throw Object.assign(new Error(error.message),{status:response.status});}
      if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new Error('รูปแบบไฟล์ตอบกลับไม่ถูกต้อง');
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='bookings-'+state.filters.report+'.csv';document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      state.csvReady=true;state.message='เตรียมไฟล์ CSV แล้ว ตรวจไฟล์ดาวน์โหลดของ browser';
    }else{
      if(action==='filter'){state.filters=filters;state.page=1;}
      if(action==='clear'){state.filters={...emptyBookingFilters(),report:'all'};state.page=1;}
      if(action==='next')state.page++;
      if(action==='previous')state.page=Math.max(1,state.page-1);
      await loadReports();state.message='แสดงรายงานแล้ว';
    }
  }catch(error){
    Object.assign(state,prior);
    if(error.status===401){window.location.replace('admin-login.html');return;}
    state.message=action==='download'?'ดาวน์โหลดไม่สำเร็จ: '+error.message:'โหลดรายงานไม่สำเร็จ ข้อมูลที่แสดงเป็นข้อมูลเดิม กรุณาลองใหม่';
  }finally{state.busy=false;}
  renderReports();
}
function bindReportsUI(){
  const form=document.getElementById('report-filters');
  form.addEventListener('submit',event=>{event.preventDefault();const filters=Object.fromEntries(Object.keys(reportState.filters).map(key=>[key,form.elements.namedItem(key).value.trim()]));reportAction('filter',filters);});
  const updateRooms=()=>{const room=form.elements.namedItem('classroom_id');const rows=bookingFilterClassrooms(form.elements.namedItem('department_id').value,form.elements.namedItem('education_level_id').value);room.innerHTML=bookingFilterOptions(rows,'classroom_id','label',rows.some(row=>String(row.classroom_id)===room.value)?room.value:'');};
  form.elements.namedItem('department_id').addEventListener('change',updateRooms);form.elements.namedItem('education_level_id').addEventListener('change',updateRooms);
  document.getElementById('reports-panel').addEventListener('click',event=>{const button=event.target.closest('[data-report-action]');if(button&&!button.disabled)reportAction(button.dataset.reportAction);});
}

