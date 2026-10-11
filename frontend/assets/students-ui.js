const directoryState={data:null,q:'',page:1,busy:false,message:''};
const studentManagement={mode:'',draft:{},detail:null,lookups:null,busy:false,csv:'',filename:'',preview:null,message:''};
function studentGroupOptions(selected){
 const l=studentManagement.lookups;if(!l)return '<option value="">กำลังโหลดกลุ่มเรียน</option>';
 return '<option value="">เลือกสาขา / ระดับชั้น / ห้อง</option>'+l.classrooms.map(c=>{
  const d=l.departments.find(d=>d.department_id===c.department_id),e=l.education_levels.find(e=>e.education_level_id===c.education_level_id);
  return `<option value="${c.classroom_id}" ${Number(selected)===c.classroom_id?'selected':''}>${escapeHtml(d?.department_name)} / ${escapeHtml(e?.education_level_name)} / ${escapeHtml(c.classroom_name)}</option>`;
 }).join('');
}
function studentManagementView(){
 const m=studentManagement;if(!m.mode)return '<p id="student-operation-message" role="status">'+escapeHtml(m.message)+'</p>';
 if(m.mode==='reset')return `<section class="student-editor section" aria-label="รีเซ็ตรหัสนักศึกษา"><h3>รีเซ็ตรหัสผ่านนักศึกษา</h3><p><strong>${escapeHtml(m.detail.student.student_code)} — ${escapeHtml(m.detail.student.first_name)} ${escapeHtml(m.detail.student.last_name)}</strong></p>${passwordFormView(true)}<button class="button secondary" type="button" data-student-action="close">ปิดแบบฟอร์ม</button><p id="student-operation-message" role="status"></p></section>`;
 const locked=m.detail?.has_bookings;
 const field=(key,label,max,type='text')=>`<div><label for="student-${key}">${label}</label><input id="student-${key}" name="${key}" type="${type}" maxlength="${max}" ${['student_code','first_name','last_name'].includes(key)?'required':''} ${key==='student_code'?'inputmode="numeric" pattern="[0-9]{1,20}"':''} ${key==='student_code'&&locked?'readonly':''} value="${escapeHtml(m.draft[key]||'')}"></div>`;
 let content;
 if(m.mode==='import'){
  content=`<h3>นำเข้านักศึกษาจาก CSV</h3><p>1. ดาวน์โหลดตัวอย่างและแก้ข้อมูล → 2. เลือกไฟล์เพื่อตรวจ → 3. ยืนยันนำเข้า</p><p class="muted">ใช้ CSV UTF-8 ไม่เกิน 200 KB ครั้งละ 100 คน ตั้งคอลัมน์รหัสนักศึกษาเป็นข้อความเพื่อรักษาเลขศูนย์นำหน้า กลุ่มเรียนที่ยังไม่มีจะสร้างเมื่อยืนยัน รหัสที่มีแล้วจะไม่นำเข้าซ้ำ</p><button type="button" class="button secondary" data-student-action="template">ดาวน์โหลดตัวอย่าง CSV</button><form id="student-import-form"><label for="student-csv">เลือกไฟล์ CSV</label><input id="student-csv" type="file" accept=".csv,text/csv"><p>${escapeHtml(m.filename)}</p><button type="button" class="button secondary" data-student-action="preview" ${m.csv?'':'disabled'}>ตรวจไฟล์อีกครั้ง</button><div id="student-preview">${studentPreviewView()}</div><p class="muted">แต่ละบัญชีใช้รหัสนักศึกษาของตนเองเป็นรหัสผ่านเริ่มต้น และต้องเปลี่ยนรหัสเมื่อเข้าสู่ระบบครั้งแรก (รหัสใหม่อย่างน้อย 6 ตัว)</p><div class="actions"><button id="student-import-confirm" class="button" ${m.preview?.valid?'':'disabled'}>${m.preview?.valid?'ยืนยันนำเข้า '+m.preview.total+' คน':'ยืนยันนำเข้า'}</button></div></form>`;
 }else{
  content=`<h3>${m.mode==='edit'?'แก้ไขข้อมูลนักศึกษา':'เพิ่มนักศึกษา'}</h3>${locked?'<p class="notice">มีประวัติจองแล้ว จึงเปลี่ยนรหัสและกลุ่มเรียนไม่ได้ แก้ชื่อและข้อมูลติดต่อได้ โดยชื่อใหม่จะแสดงในรายการจองด้วย</p>':''}<form id="student-form"><div class="grid two">${field('student_code','รหัสนักศึกษา',20)}${field('first_name','ชื่อ',100)}${field('last_name','นามสกุล',100)}<div><label for="student-classroom_id">กลุ่มเรียน (สาขา / ระดับชั้น / ห้อง)</label><select id="student-classroom_id" name="classroom_id" required ${locked?'disabled':''}>${studentGroupOptions(m.draft.classroom_id)}</select></div>${field('phone','โทรศัพท์ (ไม่บังคับ)',20,'tel')}${field('email','อีเมล (ไม่บังคับ)',254,'email')}</div>${m.mode==='new'?'<p class="muted">รหัสผ่านเริ่มต้นคือรหัสนักศึกษา ต้องเปลี่ยนเป็นรหัสใหม่อย่างน้อย 6 ตัวเมื่อเข้าสู่ระบบครั้งแรก</p>':''}<div class="actions"><button class="button">${m.mode==='edit'?'บันทึกการแก้ไข':'เพิ่มนักศึกษา'}</button></div></form>${locked?'':`<details class="section"><summary>ไม่พบกลุ่มเรียน? เพิ่มสาขา / ระดับชั้น / ห้อง</summary><p>หากชื่อมีอยู่แล้ว ระบบใช้กลุ่มเดิม กรุณาตรวจการสะกดก่อนเพิ่ม</p><form id="student-group-form"><label for="student-department-name">ชื่อสาขา</label><input id="student-department-name" required maxlength="100" list="student-departments"><datalist id="student-departments">${(m.lookups?.departments||[]).map(d=>`<option value="${escapeHtml(d.department_name)}"></option>`).join('')}</datalist><label for="student-level-name">ระดับชั้น</label><input id="student-level-name" required maxlength="30" list="student-levels"><datalist id="student-levels">${(m.lookups?.education_levels||[]).map(e=>`<option value="${escapeHtml(e.education_level_name)}"></option>`).join('')}</datalist><label for="student-classroom-name">ชื่อห้อง</label><input id="student-classroom-name" required maxlength="30"><div class="actions"><button class="button secondary">เพิ่มกลุ่มเรียน</button></div></form></details>`}`;
 }
 return `<section class="student-editor section" aria-label="แบบฟอร์มจัดการนักศึกษา">${content}<div class="actions"><button class="button secondary" type="button" data-student-action="close">ปิดแบบฟอร์ม</button></div><p id="student-operation-message" role="status">${escapeHtml(m.message)}</p></section>`;
}
function studentPreviewView(){
 const p=studentManagement.preview;if(!p)return '';
 return `<p role="status">พบ ${p.total} คน · ${p.valid?'ข้อมูลพร้อมนำเข้า (ยังไม่บันทึก)':'พบข้อผิดพลาด กรุณาแก้ไฟล์แล้วเลือกใหม่ ยังไม่บันทึกทั้งไฟล์'}</p><div class="table-wrap" tabindex="0" role="region" aria-label="ผลตรวจ CSV"><table><thead><tr><th>แถว</th><th>รหัส / ชื่อ</th><th>กลุ่มเรียน</th><th>ผลตรวจ</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td>${r.row}</td><td>${escapeHtml(r.student_code)}<br>${escapeHtml(r.first_name||'')} ${escapeHtml(r.last_name||'')}</td><td>${escapeHtml(r.department_name||'')} / ${escapeHtml(r.education_level_name||'')} / ${escapeHtml(r.classroom_name||'')}</td><td>${escapeHtml(r.errors.join(' · ')||(r.new_group?'ผ่าน · จะสร้างกลุ่มเรียนใหม่':'ผ่าน'))}</td></tr>`).join('')}</tbody></table></div>`;
}
function studentMessage(message){studentManagement.message=message;const el=document.getElementById('student-operation-message');if(el)el.textContent=message;}
function studentBusy(value){
 studentManagement.busy=value;
 const root=document.getElementById('student-directory');
 // Preserve disabled states (history locks and invalid previews) while a request is pending.
 root?.querySelectorAll('button,input,select').forEach(el=>{if(value){el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}else{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;}});
 root?.setAttribute('aria-busy',String(value));
}
function studentDraft(){const m=studentManagement;for(const key of ['student_code','first_name','last_name','phone','email'])m.draft[key]=document.getElementById('student-'+key).value;m.draft.classroom_id=Number(document.getElementById('student-classroom_id').value);return {...m.draft};}
function studentFailure(error){
 if(error.status===401){window.location.replace('admin-login.html');return;}
 studentMessage(error.status?error.message:'การเชื่อมต่อขัดข้อง หากกดบันทึกแล้วให้ตรวจรายชื่อก่อนลองซ้ำ');
}
async function studentOpen(action,id){
 const m=studentManagement;if(m.busy||directoryState.busy)return;
 if(action==='close'){Object.assign(m,{mode:'',draft:{},detail:null,csv:'',filename:'',preview:null,message:''});renderDirectory();return;}
 if(action==='template'){downloadStudentTemplate();return;}
 if(action==='preview'){await studentCheckCsv();return;}
 studentBusy(true);studentMessage('กำลังเปิดแบบฟอร์ม…');
 try{
  const lookups=action==='import'?null:await api('/api/admin/lookups');
  const detail=['edit','reset'].includes(action)?await api('/api/admin/students/'+id):null;
  Object.assign(m,{mode:action,draft:detail?{...detail.student}:{},detail,lookups,csv:'',filename:'',preview:null,message:''});
 }catch(error){studentFailure(error);}finally{studentBusy(false);}
 renderDirectory();document.getElementById(action==='import'?'student-csv':action==='reset'?'reset-current-password':'student-first_name')?.focus();
}
async function studentSave(event){
 event.preventDefault();const m=studentManagement;if(m.busy)return;
 const raw=studentDraft(),body={};for(const key of ['student_code','first_name','last_name','phone','email','classroom_id'])body[key]=raw[key];
 if(m.mode==='edit')body.version=m.detail.version;
 studentBusy(true);studentMessage('กำลังบันทึก…');let saved=false;
 try{await api('/api/admin/students'+(m.mode==='edit'?'/'+m.detail.student.student_id:''),body,m.mode==='edit'?'PUT':'POST');saved=true;}catch(error){studentFailure(error);}finally{studentBusy(false);}
 if(saved)await studentSaved('บันทึกนักศึกษาแล้ว',raw.student_code);
}
async function studentSaved(message,code=''){
 const m=studentManagement;Object.assign(m,{mode:'',draft:{},detail:null,csv:'',filename:'',preview:null,message});
 directoryState.q=code;directoryState.page=1;
 try{await loadStudentDirectory();directoryState.message='';}catch{m.message+=' แต่โหลดรายชื่อไม่สำเร็จ กรุณากดค้นหาหรือโหลดหน้าใหม่';}
 renderDirectory();
}
async function studentAddGroup(event){
 event.preventDefault();const m=studentManagement;if(m.busy)return;studentDraft();
 const body={department_name:document.getElementById('student-department-name').value,education_level_name:document.getElementById('student-level-name').value,classroom_name:document.getElementById('student-classroom-name').value};
 studentBusy(true);studentMessage('กำลังเพิ่มกลุ่มเรียน…');
 try{const data=await api('/api/admin/students/groups',body);m.lookups=await api('/api/admin/lookups');m.draft.classroom_id=data.group.classroom_id;document.getElementById('student-classroom_id').innerHTML=studentGroupOptions(m.draft.classroom_id);studentMessage('เพิ่มกลุ่มเรียนแล้ว เลือกกลุ่มนี้ให้ในแบบฟอร์มแล้ว');}catch(error){studentFailure(error);}finally{studentBusy(false);}
}
async function studentChooseCsv(event){
 const m=studentManagement;if(m.busy)return;const file=event.target.files?.[0];
 m.csv='';m.preview=null;m.filename=file?.name||'';
 if(!file){renderDirectory();return;}
 studentBusy(true);studentMessage('กำลังอ่านไฟล์…');
 try{if(file.size>204800)throw Error('เลือก CSV ขนาดไม่เกิน 200 KB');m.csv=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());m.message='';}catch{m.message='อ่านไฟล์ไม่ได้ กรุณาบันทึกเป็น CSV UTF-8 ขนาดไม่เกิน 200 KB';}finally{studentBusy(false);}
 renderDirectory();if(m.csv)await studentCheckCsv();
}
async function studentCheckCsv(){
 const m=studentManagement;if(m.busy||!m.csv)return;m.preview=null;studentBusy(true);studentMessage('กำลังตรวจไฟล์ ยังไม่บันทึก…');
 try{m.preview=await api('/api/admin/students/import/preview',{csv:m.csv});m.message=m.preview.valid?'ตรวจข้อมูลแล้ว กรุณาตรวจชื่อและกลุ่มก่อนยืนยัน':'แก้ข้อผิดพลาดในไฟล์ แล้วเลือกไฟล์ใหม่';}catch(error){studentFailure(error);}finally{studentBusy(false);}
 renderDirectory();
}
async function studentImport(event){
 event.preventDefault();const m=studentManagement;if(m.busy||!m.preview?.valid)return;
 const body={csv:m.csv};
 studentBusy(true);studentMessage('กำลังนำเข้าและสร้างบัญชี กรุณารอ…');let result;
 try{result=await api('/api/admin/students/import',body);}catch(error){m.preview=null;studentFailure(error);}finally{studentBusy(false);}
 if(result)await studentSaved(result.message);else renderDirectory();
}
function downloadStudentTemplate(){
 const csv='\uFEFFstudent_code,first_name,last_name,department_name,education_level_name,classroom_name,phone,email\r\n00990001,นักศึกษาตัวอย่าง,ทดสอบ,เทคโนโลยีสารสนเทศ,ปวส.2,ปวส.2/1,,\r\n00990002,นักศึกษาตัวอย่าง,ทดสอบ,บัญชี,ปวส.2,ปวส.2/1,,\r\n';
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='students-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindStudentManagement(){
 document.getElementById('student-directory')?.addEventListener('click',event=>{const b=event.target.closest('[data-student-action]');if(b&&!b.disabled)studentOpen(b.dataset.studentAction,b.dataset.studentId);});
 document.getElementById('student-form')?.addEventListener('submit',studentSave);
 document.getElementById('student-group-form')?.addEventListener('submit',studentAddGroup);
 document.getElementById('student-csv')?.addEventListener('change',studentChooseCsv);
 document.getElementById('student-import-form')?.addEventListener('submit',studentImport);
}
async function loadStudentDirectory(){directoryState.data=await api('/api/admin/students?'+new URLSearchParams({q:directoryState.q,page:String(directoryState.page)}));}
function studentDirectoryView(){
 const s=directoryState,d=s.data;
 return `<section id="student-directory" class="card" aria-busy="${s.busy}"><h2>จัดการนักศึกษา</h2><div class="actions"><button type="button" class="button" data-student-action="new">เพิ่มนักศึกษา</button><button type="button" class="button secondary" data-student-action="import">นำเข้า CSV</button></div>${studentManagementView()}<p class="muted">ข้อมูลบัญชีนักศึกษาทั้งหมด รวมผู้ที่ยังไม่ได้จองคิว</p><form id="student-search"><label for="student-query">ค้นหาจากรหัสนักศึกษาหรือชื่อ–นามสกุล</label><div class="search-row"><input id="student-query" maxlength="100" value="${escapeHtml(s.q)}" placeholder="กรอกรหัสหรือชื่อ" ${s.busy?'disabled':''}><button class="button" ${s.busy?'disabled':''}>ค้นหา</button><button class="button secondary" type="button" data-directory-action="clear" ${s.busy?'disabled':''}>ล้าง</button></div></form><p role="status" class="section">${escapeHtml(s.message)}</p><p class="muted">${d?.total??0} คน · หน้า ${d?.page??1}</p><div class="table-wrap" tabindex="0" role="region" aria-label="รายชื่อนักศึกษา เลื่อนแนวนอนเพื่อดูข้อมูล"><table><caption class="sr-only">รายชื่อนักศึกษาและกลุ่มเรียน</caption><thead><tr><th scope="col">รหัสนักศึกษา</th><th scope="col">ชื่อ–นามสกุล</th><th scope="col">สาขา</th><th scope="col">ระดับชั้น / ห้อง</th><th scope="col">จัดการ</th></tr></thead><tbody>${(d?.students||[]).map(row=>`<tr><td>${escapeHtml(row.student_code)}</td><td class="wrap-cell">${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</td><td class="wrap-cell">${escapeHtml(row.department_name)}</td><td>${escapeHtml(row.education_level_name)} / ${escapeHtml(row.classroom_name)}</td><td><div class="actions compact"><button type="button" class="button secondary" data-student-action="edit" data-student-id="${row.student_id}">แก้ไข</button><button type="button" class="button secondary" data-student-action="reset" data-student-id="${row.student_id}">รีเซ็ตรหัสผ่าน</button></div></td></tr>`).join('')||'<tr><td colspan="5">ไม่พบรายชื่อตามเงื่อนไข</td></tr>'}</tbody></table></div><div class="actions"><button class="button secondary" data-directory-action="previous" ${s.busy||!d||d.page<=1?'disabled':''}>หน้าก่อน</button><button class="button secondary" data-directory-action="next" ${s.busy||!d||d.page*d.page_size>=d.total?'disabled':''}>หน้าถัดไป</button></div></section>`;
}
function renderDirectory(){document.getElementById('student-directory').outerHTML=studentDirectoryView();bindStudentDirectory();}
async function directoryAction(action){
 const s=directoryState;if(s.busy||studentManagement.busy)return;const prior={q:s.q,page:s.page};
 if(action==='search'){s.q=document.getElementById('student-query').value.trim();s.page=1;}
 if(action==='clear'){s.q='';s.page=1;}
 if(action==='next')s.page++;if(action==='previous')s.page=Math.max(1,s.page-1);
 s.busy=true;s.message='กำลังโหลดข้อมูล…';renderDirectory();
 try{await loadStudentDirectory();s.message='โหลดข้อมูลแล้ว';}catch(error){Object.assign(s,prior);if(error.status===401){window.location.replace('admin-login.html');return;}s.message='โหลดข้อมูลไม่สำเร็จ ข้อมูลที่แสดงเป็นข้อมูลเดิม กรุณาลองใหม่';}finally{s.busy=false;}
 renderDirectory();document.getElementById('student-query')?.focus();
}
function bindStudentDirectory(){
 bindStudentManagement();
 if(studentManagement.mode==='reset')bindPasswordForm(true,studentManagement.detail.student);
 document.getElementById('student-search')?.addEventListener('submit',event=>{event.preventDefault();directoryAction('search');});
 document.getElementById('student-directory')?.addEventListener('click',event=>{const button=event.target.closest('[data-directory-action]');if(button&&!button.disabled)directoryAction(button.dataset.directoryAction);});
}
