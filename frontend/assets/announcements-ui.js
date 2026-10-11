let latestAnnouncement=null, latestAnnouncementError='';
let announcementRows=[];
let announcementBusy=false, announcementRequest=null;
function announcementCard(row){
  return `<article class="card section announcement"><h3>${escapeHtml(row.title)}</h3><p class="muted">ประกาศเมื่อ ${escapeHtml(row.created_at)} (เวลาประเทศไทย)</p><p class="announcement-content">${escapeHtml(row.content)}</p></article>`;
}
async function loadLatestAnnouncement(){
  latestAnnouncement=null;latestAnnouncementError='';
  try { latestAnnouncement=(await api('/api/student/announcements/latest')).announcement??null; }
  catch(error){if(error.status===401)throw error;latestAnnouncementError='โหลดประกาศไม่สำเร็จ กรุณาโหลดหน้าใหม่';}
}
function latestAnnouncementView(){
  return `<section aria-label="ประกาศล่าสุด"><h2>ประกาศล่าสุด</h2>${latestAnnouncementError?`<p role="status">${escapeHtml(latestAnnouncementError)}</p>`:latestAnnouncement?announcementCard(latestAnnouncement):'<p class="muted">ยังไม่มีประกาศจากเจ้าหน้าที่</p>'}</section>`;
}
async function loadAnnouncements(){announcementRows=(await api('/api/admin/announcements')).announcements;}
function announcementHistory(){return announcementRows.length?announcementRows.map(announcementCard).join(''):'<p class="muted">ยังไม่มีประกาศ</p>';}
function announcementsView(){
  return `<section class="card"><h2>เพิ่มประกาศ</h2><p class="muted">เมื่อเผยแพร่ ประกาศนี้จะแสดงเป็นประกาศล่าสุดบนหน้าหลักนักศึกษาทันทีที่โหลดหน้า</p><form id="announcement-form"><label for="announcement-title">หัวข้อ</label><input id="announcement-title" name="title" maxlength="160" required><label for="announcement-content">เนื้อหา</label><textarea id="announcement-content" name="content" rows="6" maxlength="5000" required></textarea><p class="muted">หัวข้อไม่เกิน 160 ตัวอักษร · เนื้อหาไม่เกิน 5,000 ตัวอักษร</p><button class="button" type="submit">เผยแพร่ประกาศ</button><p id="announcement-message" role="status" aria-live="polite"></p></form></section><section class="section"><h2>ประกาศที่เผยแพร่แล้ว</h2><p class="muted">แสดงล่าสุดไม่เกิน 50 รายการ</p><div id="announcement-history">${announcementHistory()}</div></section>`;
}
function bindAnnouncementsUI(){
  document.getElementById('announcement-form')?.addEventListener('submit',async event=>{
    event.preventDefault();if(announcementBusy)return;
    const form=event.currentTarget,button=form.querySelector('[type="submit"]');
    const titleInput=document.getElementById('announcement-title'),contentInput=document.getElementById('announcement-content');
    const title=titleInput.value.trim(),content=contentInput.value.trim();
    const message=document.getElementById('announcement-message');
    if(!title||!content){message.textContent='กรุณากรอกหัวข้อและเนื้อหา';return;}
    if(!announcementRequest||announcementRequest.title!==title||announcementRequest.content!==content)announcementRequest={title,content,request_id:crypto.randomUUID()};
    announcementBusy=true;button.disabled=true;titleInput.disabled=true;contentInput.disabled=true;
    message.textContent='กำลังเผยแพร่…';
    try{
      await api('/api/admin/announcements',announcementRequest);
      announcementRequest=null;form.reset();message.textContent='เผยแพร่ประกาศสำเร็จ';
      try {await loadAnnouncements();document.getElementById('announcement-history').innerHTML=announcementHistory();}
      catch(error){
        if(error.status===401){window.location.replace('admin-login.html');return;}
        message.textContent='เผยแพร่สำเร็จแล้ว แต่โหลดรายการไม่สำเร็จ กรุณาโหลดหน้าใหม่';
      }
    }catch(error){
      if(error.status===401){window.location.replace('admin-login.html');return;}
      message.textContent=error.status?error.message:'ไม่ได้รับผลการบันทึก กรุณากดเผยแพร่ซ้ำด้วยข้อความเดิม ระบบจะไม่สร้างรายการซ้ำ';
    }finally{announcementBusy=false;button.disabled=false;titleInput.disabled=false;contentInput.disabled=false;}
  });
}
