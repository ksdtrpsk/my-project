// Phase 6 adds book-set review and confirmation to the existing slot page.
const slotState = { rows: [], date: '', edit: null, selected: null, busy: false, message: '' };
async function loadSlots() {
  const data = await api((admin ? '/api/admin/' : '/api/student/') + 'booking-slots' + (slotState.date ? '?date=' + encodeURIComponent(slotState.date) : ''));
  slotState.rows = data.slots;
  if (!slotState.rows.some(row => row.slot_id === slotState.selected && row.availability === 'AVAILABLE')) slotState.selected = null;
}
function slotDate(value) {
  return new Date(value + 'T00:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
}
function slotPeriod(row) { return `${escapeHtml(slotDate(row.booking_date))} · ${escapeHtml(row.start_time)} – ${escapeHtml(row.end_time)}`; }
function slotsView() {
  const edit = slotState.edit;
  const labels = { AVAILABLE: 'มีคิวว่าง', FULL: 'คิวเต็ม', CLOSED: 'ปิดรอบ', PAST: 'เลยเวลาเริ่มรอบแล้ว' };
  return `<div id="slots-page"><p id="slots-message" role="status">${escapeHtml(slotState.message)}</p>
    ${admin ? `<section class="card"><h2>${edit ? 'แก้ไขรอบรับหนังสือ' : 'เพิ่มรอบรับหนังสือ'}</h2><p class="muted">เวลาไทย · วันที่ในแบบฟอร์มใช้ ค.ศ. · รอบที่มีประวัติจองเปลี่ยนวันและเวลาไม่ได้</p>
    <form id="slot-form"><div class="grid three">
      <div><label for="slot-date">วันที่รับหนังสือ</label><input id="slot-date" type="date" required value="${escapeHtml(edit?.booking_date || '')}" ${edit?.has_bookings ? 'disabled' : ''}></div>
      <div><label for="slot-start">เวลาเริ่ม</label><input id="slot-start" type="time" step="1" required value="${escapeHtml(edit?.start_time || '')}" ${edit?.has_bookings ? 'disabled' : ''}></div>
      <div><label for="slot-end">เวลาสิ้นสุด</label><input id="slot-end" type="time" step="1" required value="${escapeHtml(edit?.end_time || '')}" ${edit?.has_bookings ? 'disabled' : ''}></div>
      <div><label for="slot-capacity">จำนวนที่รับได้ (คน)</label><input id="slot-capacity" type="number" min="${Math.max(1, edit?.booked_count || 0)}" max="65535" step="1" required value="${edit?.max_students || 20}"></div>
      <div><label for="slot-status">สถานะรอบ</label><select id="slot-status"><option value="OPEN" ${edit?.status !== 'CLOSED' ? 'selected' : ''}>เปิดรอบ</option><option value="CLOSED" ${edit?.status === 'CLOSED' ? 'selected' : ''}>ปิดรอบ</option></select></div></div>
      <div class="actions"><button class="button" type="submit">${edit ? 'บันทึกการแก้ไข' : 'เพิ่มรอบ'}</button>${edit ? '<button class="button secondary" type="button" data-slot-action="cancel">ยกเลิกการแก้ไข</button>' : ''}</div></form></section>` : bookingSetsView()}
    <section class="card section"><h2>${admin ? 'รอบรับหนังสือทั้งหมด' : '2. เลือกวันที่และรอบรับหนังสือ'}</h2>
      <form id="slot-filter" class="search-row"><label for="filter-date">เลือกวันที่</label><input id="filter-date" type="date" value="${escapeHtml(slotState.date)}"><button class="button" type="submit">แสดงรอบ</button><button class="button secondary" type="button" data-slot-action="refresh">แสดงทั้งหมด / โหลดใหม่</button></form>
      <p class="muted section">จำนวนจองไม่นับรายการที่ยกเลิก · ข้อมูล ณ เวลาโหลดหน้านี้ กดแสดงรอบเพื่ออัปเดต</p>
      <div class="grid two section">${slotState.rows.map(row => `<article class="card slot-card"><h3>${slotPeriod(row)}</h3><span class="badge ${row.availability === 'AVAILABLE' ? '' : 'neutral'}">${labels[row.availability]}</span>
      <p class="section">จองแล้ว <strong>${row.booked_count} / ${row.max_students}</strong> คน</p><p>รับได้ ${row.max_students} คน · เหลือ <strong>${row.remaining}</strong> คิว</p>
      ${admin ? `<p class="muted">${row.status === 'OPEN' ? 'สถานะ: เปิดรอบ' : 'สถานะ: ปิดรอบ'}${row.has_bookings ? ' · มีประวัติการจอง' : ''}</p><div class="actions compact"><button class="button secondary" data-slot-action="edit" data-slot-id="${row.slot_id}">แก้ไข</button><button class="button secondary" data-slot-action="status" data-slot-id="${row.slot_id}">${row.status === 'OPEN' ? 'ปิดรอบ' : 'เปิดรอบ'}</button><button class="button danger" data-slot-action="delete" data-slot-id="${row.slot_id}" ${row.has_bookings ? 'disabled' : ''}>ลบ</button></div>` : `<button class="button" data-slot-action="select" data-slot-id="${row.slot_id}" aria-pressed="${slotState.selected === row.slot_id}" ${row.availability !== 'AVAILABLE' || !selectedBookSet()?.books.length || setAlreadyBooked(bookingState.setId) ? 'disabled' : ''}>${row.availability === 'AVAILABLE' ? (slotState.selected === row.slot_id ? 'เลือกรอบนี้แล้ว' : 'เลือกรอบนี้') : labels[row.availability]}</button>`}</article>`).join('') || '<p class="empty muted">ยังไม่มีรอบรับหนังสือสำหรับวันที่แสดง</p>'}</div>
      ${!admin ? bookingConfirmation() : ''}
    </section></div>`;
}
function renderSlots() {
  document.getElementById('slots-page').outerHTML = slotsView();
  bindSlotsUI();
  bindBookingQr(document.getElementById('slots-page'));
}
async function slotAction(action) {
  if (slotState.busy) return;
  slotState.busy = true;
  document.getElementById('slots-page').inert = true;
  slotState.message = '';
  try { await action(); }
  catch (error) {
    if (error.status === 401) { window.location.replace(admin ? 'admin-login.html' : 'index.html'); return; }
    slotState.message = error.status ? error.message : 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่';
  } finally {
    slotState.busy = false;
    renderSlots();
  }
}
function bindSlotsUI() {
  document.getElementById('booking-set')?.addEventListener('change', event => {
    if (slotState.busy) return;
    bookingState.setId = Number(event.target.value); bookingState.success = null; slotState.selected = null; renderSlots();
  });
  document.getElementById('slot-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const body = {
      booking_date: document.getElementById('slot-date').value,
      start_time: document.getElementById('slot-start').value,
      end_time: document.getElementById('slot-end').value,
      max_students: Number(document.getElementById('slot-capacity').value),
      status: document.getElementById('slot-status').value
    };
    const id = slotState.edit?.slot_id;
    return slotAction(async () => {
      await api('/api/admin/booking-slots' + (id ? '/' + id : ''), body, id ? 'PUT' : 'POST');
      slotState.edit = null;
      await loadSlots();
      slotState.message = 'บันทึกรอบรับหนังสือแล้ว';
    });
  });
  document.getElementById('slot-filter')?.addEventListener('submit', event => {
    event.preventDefault();
    return slotAction(async () => { slotState.date = document.getElementById('filter-date').value; await loadSlots(); });
  });
  document.getElementById('slots-page')?.addEventListener('click', event => {
    const button = event.target.closest('[data-slot-action]');
    if (!button || button.disabled || slotState.busy) return;
    const action = button.dataset.slotAction;
    const row = slotState.rows.find(item => item.slot_id === Number(button.dataset.slotId));
    if (action === 'confirm' && !admin) return slotAction(confirmBooking);
    if (action === 'cancel') { slotState.edit = null; renderSlots(); return; }
    if (action === 'edit' && row) { slotState.edit = row; renderSlots(); document.getElementById('slot-date').focus(); return; }
    if (action === 'select' && row?.availability === 'AVAILABLE' && selectedBookSet()?.books.length && !setAlreadyBooked(bookingState.setId)) { bookingState.success = null; slotState.selected = row.slot_id; renderSlots(); return; }
    if (action === 'refresh') return slotAction(async () => { slotState.date = ''; await loadSlots(); });
    if (!row) return;
    if (action === 'delete' && !window.confirm('ลบรอบ ' + slotDate(row.booking_date) + ' เวลา ' + row.start_time + ' ใช่หรือไม่?')) return;
    if (['status', 'delete'].includes(action)) return slotAction(async () => {
      await api('/api/admin/booking-slots/' + row.slot_id + (action === 'status' ? '/status' : ''), action === 'status' ? { status: row.status === 'OPEN' ? 'CLOSED' : 'OPEN' } : {}, action === 'status' ? 'PATCH' : 'DELETE');
      if (slotState.edit?.slot_id === row.slot_id) slotState.edit = null;
      await loadSlots();
      slotState.message = action === 'delete' ? 'ลบรอบแล้ว' : 'เปลี่ยนสถานะรอบแล้ว';
    });
  });
}
