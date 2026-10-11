const bookingState = { setId: null, success: null, uncertain: false };
let ownBookings = [];
function selectedBookSet() { return studentSets.find(set => set.book_set_id === bookingState.setId); }
function setAlreadyBooked(setId) { return ownBookings.some(row => row.book_set_id === setId && row.booking_status !== 'CANCELLED'); }
async function loadBookingContext() {
  const [sets, bookings] = await Promise.all([api('/api/student/book-sets'), api('/api/student/bookings')]);
  studentSets = sets.book_sets;
  ownBookings = bookings.bookings;
  if (!studentSets.some(set => set.book_set_id === bookingState.setId)) bookingState.setId = studentSets.find(set => !setAlreadyBooked(set.book_set_id))?.book_set_id ?? studentSets[0]?.book_set_id ?? null;
}
function bookingSetsView() {
  const set = selectedBookSet();
  return `<section class="card"><h2>1. ตรวจสอบชุดหนังสือของคุณ</h2><p class="muted">${fullName()} · ${studentText('student_code')} · ${studentText('department_name')} · ${studentText('education_level_name')} / ${studentText('classroom_name')}</p>
    ${studentSets.length ? `<label for="booking-set">ชุดหนังสือ / ภาคเรียน / ปีการศึกษา</label><select id="booking-set">${studentSets.map(item => `<option value="${item.book_set_id}" ${item.book_set_id === bookingState.setId ? 'selected' : ''}>ภาคเรียน ${item.semester === 3 ? 'ฤดูร้อน' : item.semester} / ${item.academic_year}${setAlreadyBooked(item.book_set_id) ? ' · จองแล้ว' : ''}</option>`).join('')}</select>${set ? bookRows(set.books) : ''}` : '<p class="section">ยังไม่มีชุดหนังสือตรงกับบัญชี กรุณาติดต่อเจ้าหน้าที่ก่อนจอง</p>'}
    ${set && !set.books.length ? '<p>ชุดนี้ยังไม่มีหนังสือ จองไม่ได้</p>' : ''}
    ${setAlreadyBooked(bookingState.setId) ? '<p class="section">คุณจองชุดนี้แล้ว <a href="my-booking.html">ดูการจองของฉัน</a></p>' : ''}</section>`;
}
function bookingQrView(row) {
  if (!['WAITING', 'CHECKED_IN'].includes(row.booking_status)) return '<p class="muted section">รายการนี้ไม่แสดง QR สำหรับรับหนังสือ</p>';
  if (!Number.isSafeInteger(row.booking_id) || row.booking_id < 1) return '';
  return `<figure class="booking-qr"><img data-booking-qr src="/api/student/bookings/${row.booking_id}/qr" alt="QR Code สำหรับการจองคิว ${escapeHtml(row.queue_number)}" width="328" height="328">
    <p data-qr-error hidden role="alert">โหลด QR ไม่สำเร็จ กรุณา <a href="my-booking.html">เปิดการจองของฉันใหม่</a> หาก Session หมดอายุให้เข้าสู่ระบบอีกครั้ง</p>
    <figcaption>แสดง QR นี้ต่อเจ้าหน้าที่ในวันรับหนังสือ</figcaption><a class="button secondary section" data-qr-download href="/api/student/bookings/${row.booking_id}/qr" download="booking-${row.booking_id}-qr.png">บันทึกภาพ QR</a></figure>`;
}
function bindBookingQr(root = document) {
  for (const img of root.querySelectorAll?.('img[data-booking-qr]') || []) {
    const failed = () => {
      img.hidden = true;
      img.parentElement.querySelector('[data-qr-error]').hidden = false;
      const download = img.parentElement.querySelector('[data-qr-download]');
      if (download) download.hidden = true;
    };
    img.addEventListener('error', failed, { once: true });
    if (img.complete && img.naturalWidth === 0) failed();
  }
}
function bookingReceipt(row) {
  const status = { WAITING: 'รอรับหนังสือ', CHECKED_IN: 'เช็กอินแล้ว', RECEIVED: 'รับหนังสือแล้ว', CANCELLED: 'ยกเลิกแล้ว', NO_SHOW: 'ไม่มาตามนัด' };
  return `<article class="card section"><span class="eyebrow">เลขคิวประจำรอบ</span><h2 class="booking-queue">${escapeHtml(row.queue_number)}</h2><span class="badge status-${escapeHtml(row.booking_status)}">${escapeHtml(status[row.booking_status] || row.booking_status)}</span>
    ${row.received_at ? `<p class="section">รับหนังสือเมื่อ (เวลาไทย): ${escapeHtml(row.received_at)}</p>` : ''}${bookingQrView(row)}${page === 'my-booking' ? bookingCancelView(row) : ''}<dl class="details section"><div><dt>ชื่อ–นามสกุล</dt><dd>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</dd></div><div><dt>รหัสนักศึกษา</dt><dd>${escapeHtml(row.student_code)}</dd></div><div><dt>สาขา</dt><dd>${escapeHtml(row.department_name)}</dd></div><div><dt>ระดับชั้น / ห้อง</dt><dd>${escapeHtml(row.education_level_name)} / ${escapeHtml(row.classroom_name)}</dd></div><div><dt>วันที่และเวลา</dt><dd>${slotPeriod(row)}</dd></div><div><dt>ชุดหนังสือ</dt><dd>ภาคเรียน ${escapeHtml(row.semester)} / ${escapeHtml(row.academic_year)}</dd></div></dl>${bookRows(row.books)}<p class="muted section">เลขคิวใช้คู่กับวันที่และเวลารอบรับหนังสือ</p></article>`;
}
function bookingConfirmation() {
  if (bookingState.success) return `<section class="section" role="status"><h2>จองสำเร็จ</h2>${bookingReceipt(bookingState.success)}<a class="button" href="my-booking.html">ดูการจองของฉัน</a></section>`;
  const row = slotState.rows.find(item => item.slot_id === slotState.selected);
  const set = selectedBookSet();
  if (!row) return '';
  const allowed = set?.books.length && !setAlreadyBooked(set.book_set_id) && row.availability === 'AVAILABLE' && !bookingState.uncertain;
  return `<section class="card section"><h2>3. ยืนยันการจอง</h2><p>${slotPeriod(row)}</p><p>ภาคเรียน ${escapeHtml(set?.semester)} / ${escapeHtml(set?.academic_year)}</p><p class="muted">ยังไม่ได้บันทึกการจองจนกว่าจะกดยืนยัน ระบบตรวจคิวว่างอีกครั้งเมื่อบันทึก</p>
    ${bookingState.uncertain ? '<p role="alert">ยังยืนยันผลไม่ได้ กรุณา <a href="my-booking.html">ตรวจการจองของฉัน</a> หรือโหลดหน้าใหม่ก่อนลองอีกครั้ง</p>' : ''}
    <button class="button" type="button" data-slot-action="confirm" ${allowed ? '' : 'disabled'}>ยืนยันจองคิว</button></section>`;
}
async function confirmBooking() {
  const set = selectedBookSet();
  const slot = slotState.rows.find(row => row.slot_id === slotState.selected);
  if (!set?.books.length || setAlreadyBooked(set.book_set_id) || slot?.availability !== 'AVAILABLE' || bookingState.uncertain) return;
  try {
    const result = await api('/api/student/bookings', { book_set_id: set.book_set_id, slot_id: slot.slot_id });
    bookingState.success = result.booking;
    ownBookings = [result.booking, ...ownBookings.filter(row => row.booking_id !== result.booking.booking_id)];
    slotState.selected = null;
    slotState.message = 'บันทึกการจองสำเร็จ';
    try { await loadSlots(); } catch { slotState.message = 'จองสำเร็จ แต่โหลดจำนวนคิวล่าสุดไม่ได้ ดูเลขคิวด้านล่าง'; }
  } catch (error) {
    if (error.status === 401) throw error;
    // A lost response may have committed. Recover from owned receipts before enabling another request.
    try {
      await loadBookingContext();
      const saved = ownBookings.find(row => row.book_set_id === set.book_set_id && row.booking_status !== 'CANCELLED');
      if (saved) { bookingState.success = saved; slotState.selected = null; slotState.message = 'พบการจองที่บันทึกแล้ว'; }
      else slotState.message = error.status ? error.message : 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจการจองของฉันก่อนลองใหม่';
      if (!error.status || error.status >= 500) bookingState.uncertain = !saved;
      try { await loadSlots(); } catch { /* Keep the confirmed receipt or failure message visible. */ }
    } catch { bookingState.uncertain = true; slotState.message = 'ยังตรวจผลการจองไม่ได้ กรุณาดูการจองของฉันหรือโหลดหน้าใหม่'; }
  }
}

const cancellationState = { busy: false, message: '' };
function bookingCancelView(row) {
  if (row.can_cancel) return `<div class="section"><p class="muted">ยกเลิกได้ก่อนเวลาเริ่มรอบ (เวลาไทย)</p><button type="button" class="button secondary" data-cancel-booking="${row.booking_id}">ยกเลิกการจอง</button></div>`;
  return row.booking_status === 'WAITING' ? '<p class="muted section">ถึงเวลาเริ่มรอบแล้ว ไม่สามารถยกเลิกได้</p>' : '';
}
function ownBookingContent() {
  const current = ownBookings.filter(row => ['WAITING','CHECKED_IN'].includes(row.booking_status));
  const history = ownBookings.filter(row => !['WAITING','CHECKED_IN'].includes(row.booking_status));
  return '<p id="cancel-message" role="status">' + escapeHtml(cancellationState.message) + '</p><h2>การจองปัจจุบัน</h2>' +
    (current.length ? current.map(bookingReceipt).join('') : '<p class="muted">ไม่มีคิวที่รอรับหนังสือ</p>') +
    '<p class="section"><a class="button" href="booking-slots.html">จองคิวรับหนังสือ</a></p>' +
    (history.length ? '<h2 class="section">ประวัติการจอง</h2>' + history.map(bookingReceipt).join('') : '');
}
async function cancelOwnBooking(id) {
  if (cancellationState.busy || !ownBookings.some(row => row.booking_id === id && row.can_cancel)) return;
  if (!window.confirm('ยืนยันยกเลิกคิวนี้? ระบบจะคืนคิวว่างและ QR นี้จะใช้รับหนังสือไม่ได้')) return;
  cancellationState.busy = true;
  for (const button of document.querySelectorAll('[data-cancel-booking]')) button.disabled = true;
  try {
    const { booking } = await api('/api/student/bookings/' + id + '/cancel', {});
    ownBookings = ownBookings.map(row => row.booking_id === id ? booking : row);
    cancellationState.message = 'ยกเลิกการจองแล้ว คืนคิวว่างให้รอบเดิมแล้ว คุณสามารถจองใหม่ได้';
  } catch (error) {
    if (error.status === 401) { window.location.replace('index.html'); return; }
    // Never retry a mutation blindly after losing its response.
    try {
      ownBookings = (await api('/api/student/bookings')).bookings;
      cancellationState.message = ownBookings.some(row => row.booking_id === id && row.booking_status === 'CANCELLED') ? 'รายการนี้ยกเลิกแล้ว คืนคิวว่างแล้ว' : error.message;
    } catch {
      ownBookings = ownBookings.map(row => ({ ...row, can_cancel: false }));
      cancellationState.message = 'ยังตรวจผลไม่ได้ กรุณาโหลดหน้าใหม่ก่อนทำรายการอีกครั้ง';
    }
  } finally { cancellationState.busy = false; }
  document.getElementById('app').innerHTML = shell(bookingView());
  bindUI(); bindBookingQr(); bindCancellationUI();
}
function bindCancellationUI() {
  for (const button of document.querySelectorAll('[data-cancel-booking]')) {
    button.addEventListener('click', () => cancelOwnBooking(Number(button.dataset.cancelBooking)));
  }
}
