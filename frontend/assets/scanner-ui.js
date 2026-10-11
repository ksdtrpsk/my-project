const scannerState = { booking:null, token:'', busy:false, stream:null, starting:false, timer:null, generation:0, request:0, message:'' };
function scannerView() {
  return `<section id="scanner-page"><section class="card"><h2>อ่าน QR รับหนังสือ</h2><p class="muted">สแกนเพื่อดูชื่อและรายการหนังสือก่อน กดยืนยันหลังส่งมอบหนังสือแล้ว</p>
    <div class="actions"><button class="button" id="start-camera" type="button">เปิดกล้องสแกน</button><button class="button secondary" id="stop-camera" type="button" disabled>หยุดกล้อง</button></div>
    <video id="scanner-video" class="scanner-video" autoplay muted playsinline hidden></video>
    <label for="qr-file">หรือเลือกภาพ QR (PNG/JPEG/WebP ไม่เกิน 10 MB)</label><input id="qr-file" type="file" accept="image/png,image/jpeg,image/webp">
    <form id="scan-form"><label for="scan-token">ข้อความ QR จากเครื่องอ่าน</label><input id="scan-token" maxlength="68" autocomplete="off" spellcheck="false" placeholder="BQ1:…" required><button class="button secondary section" id="scan-submit" type="submit">ตรวจสอบ QR</button></form>
    <p id="scanner-message" role="status" class="section"></p></section><div id="scanner-result"></div></section>`;
}
function renderScanner() {
  const row = scannerState.booking;
  const result = document.getElementById('scanner-result');
  if (!result) return;
  document.getElementById('scanner-message').textContent = scannerState.message;
  for (const id of ['start-camera','qr-file','scan-token','scan-submit']) document.getElementById(id).disabled = scannerState.busy || scannerState.starting || (id === 'start-camera' && Boolean(scannerState.stream));
  document.getElementById('stop-camera').disabled = !scannerState.stream && !scannerState.starting;
  result.innerHTML = row ? `<article class="card section"><h2>คิว ${escapeHtml(row.queue_number)}</h2><p class="badge">${escapeHtml({WAITING:'รอรับหนังสือ',CHECKED_IN:'เช็กอินแล้ว',RECEIVED:'รับหนังสือแล้ว',CANCELLED:'ยกเลิกแล้ว',NO_SHOW:'ไม่มาตามนัด'}[row.booking_status] || row.booking_status)}</p>
    ${row.booking_status === 'RECEIVED' || row.received_at ? '<p role="status" class="section">รายการนี้รับหนังสือแล้ว</p>' : ''}
    <dl class="details section"><div><dt>ชื่อ–นามสกุล</dt><dd>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</dd></div><div><dt>รหัสนักศึกษา</dt><dd>${escapeHtml(row.student_code)}</dd></div><div><dt>สาขา</dt><dd>${escapeHtml(row.department_name)}</dd></div><div><dt>ระดับชั้น / ห้อง</dt><dd>${escapeHtml(row.education_level_name)} / ${escapeHtml(row.classroom_name)}</dd></div><div><dt>วันและเวลารับตามนัด</dt><dd>${slotPeriod(row)}</dd></div><div><dt>ภาคเรียน / ปี</dt><dd>${escapeHtml(row.semester)} / ${escapeHtml(row.academic_year)}</dd></div>${row.received_at ? `<div><dt>เวลารับจริง (เวลาไทย)</dt><dd>${escapeHtml(row.received_at)}</dd></div>` : ''}</dl>
    <h3 class="section">หนังสือที่ต้องส่งมอบ</h3>${bookRows(row.books)}<button id="confirm-pickup" class="button section" type="button" ${scannerState.busy || !['WAITING','CHECKED_IN'].includes(row.booking_status) || row.received_at ? 'disabled' : ''}>ยืนยันรับหนังสือ</button></article>` : '';
  document.getElementById('confirm-pickup')?.addEventListener('click', confirmPickup);
}
function stopScannerCamera() {
  scannerState.generation++;
  clearTimeout(scannerState.timer); scannerState.timer=null;
  scannerState.stream?.getTracks().forEach(track=>track.stop());
  scannerState.stream=null; scannerState.starting=false;
  const video=document.getElementById('scanner-video');
  if(video){video.srcObject=null;video.hidden=true;}
}
function resetScanner() {
  stopScannerCamera();scannerState.request++;scannerState.booking=null;scannerState.token='';scannerState.busy=false;scannerState.message='';
}
async function scanToken(value) {
  stopScannerCamera();
  const request=++scannerState.request;
  scannerState.booking=null;scannerState.token='';scannerState.busy=true;scannerState.message='กำลังตรวจสอบ QR…';renderScanner();
  try {
    const token=value.trim();
    if(!/^BQ1:[A-F0-9]{64}$/.test(token))throw new Error('QR ไม่ใช่รูปแบบของระบบนี้');
    const result=await api('/api/admin/pickup/lookup',{token});
    if(request!==scannerState.request)return;
    scannerState.booking=result.booking;scannerState.token=token;
    scannerState.message=result.booking.booking_status==='RECEIVED'?'รายการนี้รับหนังสือแล้ว':'ตรวจสอบชื่อและหนังสือก่อนยืนยันรับ';
  } catch(error){if(request!==scannerState.request)return;if(error.status===401)window.location.replace('admin-login.html');scannerState.message=error.message || 'อ่าน QR ไม่สำเร็จ';}
  finally {if(request===scannerState.request){scannerState.busy=false;renderScanner();}}
}
async function confirmPickup() {
  const row=scannerState.booking,token=scannerState.token;
  if(scannerState.busy || !row || row.received_at || !['WAITING','CHECKED_IN'].includes(row.booking_status))return;
  const request=++scannerState.request;
  scannerState.busy=true;scannerState.message='กำลังบันทึกการรับหนังสือ…';renderScanner();
  try {
    const result=await api('/api/admin/pickup/confirm',{token,booking_id:row.booking_id});
    if(request!==scannerState.request)return;
    scannerState.booking=result.booking;scannerState.message='ยืนยันรับหนังสือสำเร็จ';
  } catch(error) {
    if(request!==scannerState.request)return;
    scannerState.booking=null;
    if(error.status===401){window.location.replace('admin-login.html');return;}
    // A lost response may already be committed; lookup is read-only and safe to retry.
    try {const current=await api('/api/admin/pickup/lookup',{token});if(request!==scannerState.request)return;scannerState.booking=current.booking;scannerState.message=current.booking.booking_status==='RECEIVED'?'รายการนี้รับหนังสือแล้ว':error.message;}
    catch {scannerState.message='ยังตรวจผลไม่ได้ กรุณาสแกนใหม่ก่อนยืนยันอีกครั้ง';}
  } finally {if(request===scannerState.request){scannerState.busy=false;renderScanner();}}
}
function decodeScannerImage(source,width,height) {
  if(typeof jsQR!=='function')throw new Error('โหลดตัวอ่าน QR ไม่สำเร็จ กรุณาโหลดหน้าใหม่');
  const ratio=Math.min(1,1600/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  return jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data;
}
async function startScannerCamera() {
  if(scannerState.busy || scannerState.starting || scannerState.stream)return;
  stopScannerCamera();const generation=scannerState.generation;
  scannerState.booking=null;scannerState.token='';scannerState.starting=true;scannerState.message='กำลังขอเปิดกล้อง…';renderScanner();
  try {
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('browser นี้เปิดกล้องไม่ได้ ใช้ภาพ QR หรือข้อความจากเครื่องอ่านแทน');
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
    if(generation!==scannerState.generation){stream.getTracks().forEach(track=>track.stop());return;}
    scannerState.stream=stream;scannerState.starting=false;
    const video=document.getElementById('scanner-video');video.srcObject=stream;video.hidden=false;await video.play();
    if(generation!==scannerState.generation)return;
    scannerState.message='วาง QR ให้ชัดในกรอบกล้อง';renderScanner();
    async function frame() {
      if(generation!==scannerState.generation)return;
      try {
        if(video.readyState>=2){const token=decodeScannerImage(video,video.videoWidth,video.videoHeight);if(token){await scanToken(token);return;}}
        scannerState.timer=setTimeout(frame,250);
      } catch {stopScannerCamera();scannerState.message='อ่านกล้องไม่ได้ กรุณาเลือกภาพ QR แทน';renderScanner();}
    }
    frame();
  } catch(error) {
    if(generation!==scannerState.generation)return;
    stopScannerCamera();scannerState.message=error.name==='NotAllowedError'?'ไม่ได้รับสิทธิ์กล้อง กรุณาอนุญาตกล้องหรือเลือกภาพ QR':error.name==='NotFoundError'?'ไม่พบกล้อง กรุณาเลือกภาพ QR':error.message;renderScanner();
  }
}
async function scanImageFile(file) {
  if(!file || scannerState.busy)return;
  stopScannerCamera();const request=++scannerState.request;
  scannerState.booking=null;scannerState.token='';scannerState.busy=true;scannerState.message='กำลังอ่านภาพ QR…';renderScanner();
  let bitmap;
  try {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('เลือกภาพ PNG/JPEG/WebP ขนาดไม่เกิน 10 MB');
    bitmap=await createImageBitmap(file);
    if(request!==scannerState.request)return;
    const token=decodeScannerImage(bitmap,bitmap.width,bitmap.height);
    if(!token)throw new Error('ไม่พบ QR ในภาพ กรุณาเลือกภาพที่ชัดเจน');
    await scanToken(token);
  } catch(error){if(request===scannerState.request){scannerState.message=error.message;scannerState.busy=false;renderScanner();}}
  finally {bitmap?.close();}
}
function bindScannerUI() {
  document.getElementById('start-camera').addEventListener('click',startScannerCamera);
  document.getElementById('stop-camera').addEventListener('click',()=>{stopScannerCamera();scannerState.message='หยุดกล้องแล้ว';renderScanner();});
  document.getElementById('scan-form').addEventListener('submit',event=>{event.preventDefault();if(!scannerState.busy)return scanToken(document.getElementById('scan-token').value);});
  document.getElementById('qr-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';return scanImageFile(file);});
  document.getElementById('logout')?.addEventListener('click',resetScanner);
  renderScanner();
}
window.addEventListener('pagehide',resetScanner);
document.addEventListener?.('visibilitychange',()=>{if(document.hidden){stopScannerCamera();if(page==='admin-scanner')renderScanner();}});
