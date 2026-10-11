// Phase 4 admin forms. Shared escapeHtml/api helpers are defined in app.js.
const catalogState = { books: [], sets: [], lookups: { departments: [], education_levels: [], classrooms: [] }, search: '', editBook: null, editSet: null, busy: false, message: '' };
async function loadCatalog() {
  if (page === 'admin-books') catalogState.books = (await api('/api/admin/books?q=' + encodeURIComponent(catalogState.search))).books;
  if (page === 'admin-book-sets') {
    const [books, sets, lookups] = await Promise.all([api('/api/admin/books'), api('/api/admin/book-sets'), api('/api/admin/lookups')]);
    catalogState.books = books.books; catalogState.sets = sets.book_sets; catalogState.lookups = lookups;
  }
}
function adminBooksView() {
  const edit = catalogState.editBook;
  return `<div id="catalog-page"><p id="catalog-message" role="status">${escapeHtml(catalogState.message)}</p>
    <div class="grid two catalog-layout"><section class="card"><h2>${edit ? 'แก้ไขหนังสือ' : 'เพิ่มหนังสือ'}</h2>
    <form id="book-form"><label for="book-code">รหัสหนังสือ</label><input id="book-code" name="book_code" required maxlength="30" value="${escapeHtml(edit?.book_code || '')}">
    <label for="book-name">ชื่อหนังสือ</label><input id="book-name" name="book_name" required maxlength="200" value="${escapeHtml(edit?.book_name || '')}">
    <label for="book-description">รายละเอียด (ไม่บังคับ)</label><textarea id="book-description" name="description" rows="4" maxlength="5000">${escapeHtml(edit?.description || '')}</textarea>
    <div class="actions"><button class="button" type="submit">${edit ? 'บันทึกการแก้ไข' : 'เพิ่มหนังสือ'}</button>${edit ? '<button type="button" class="button secondary" data-action="cancel-book">ยกเลิกการแก้ไข</button>' : ''}</div></form></section>
    <section class="card"><h2>รายการหนังสือ</h2><form id="book-search" class="search-row"><label class="sr-only" for="search-books">ค้นหาชื่อหรือรหัสหนังสือ</label><input id="search-books" maxlength="100" placeholder="ค้นหาชื่อหรือรหัสหนังสือ" value="${escapeHtml(catalogState.search)}"><button class="button" type="submit">ค้นหา</button><button class="button secondary" type="button" data-action="clear-search">ล้าง</button></form>
    <p class="muted section">พบ ${catalogState.books.length} เล่ม</p><div class="table-wrap" tabindex="0" role="region" aria-label="ตารางข้อมูล เลื่อนแนวนอนเพื่อดูเพิ่มเติม"><table><thead><tr><th scope="col">หนังสือ</th><th scope="col">จัดการ</th></tr></thead><tbody>${catalogState.books.map(book => `<tr><td class="wrap-cell"><strong>${escapeHtml(book.book_name)}</strong><br><span class="muted">${escapeHtml(book.book_code)}</span>${book.description ? `<p class="muted">${escapeHtml(book.description)}</p>` : ''}</td><td><div class="actions compact"><button class="button secondary" data-action="edit-book" data-id="${book.book_id}">แก้ไข</button><button class="button danger" data-action="delete-book" data-id="${book.book_id}">ลบ</button></div></td></tr>`).join('')}</tbody></table></div>${catalogState.books.length ? '' : '<p class="empty muted">ยังไม่พบหนังสือ ลองเพิ่มหนังสือหรือเปลี่ยนคำค้นหา</p>'}</section></div></div>`;
}
function options(rows, key, label, selected) {
  return '<option value="">เลือกข้อมูล</option>' + rows.map(row => `<option value="${row[key]}" ${row[key] === selected ? 'selected' : ''}>${escapeHtml(row[label])}</option>`).join('');
}
function classroomOptions(department, level, selected) {
  return options(catalogState.lookups.classrooms.filter(row => row.department_id === department && row.education_level_id === level), 'classroom_id', 'classroom_name', selected);
}
function adminSetsView() {
  const edit = catalogState.editSet;
  const selected = new Set(edit?.books.map(book => book.book_id) || []);
  return `<div id="catalog-page"><p id="catalog-message" role="status">${escapeHtml(catalogState.message)}</p><section class="card"><h2>${edit ? 'แก้ไขชุดหนังสือ' : 'สร้างชุดหนังสือ'}</h2>
    <form id="set-form"><div class="grid three"><div><label for="set-department">สาขาวิชา</label><select id="set-department" required>${options(catalogState.lookups.departments, 'department_id', 'department_name', edit?.department_id)}</select></div>
    <div><label for="set-level">ระดับชั้น</label><select id="set-level" required>${options(catalogState.lookups.education_levels, 'education_level_id', 'education_level_name', edit?.education_level_id)}</select></div>
    <div><label for="set-classroom">ห้องเรียน</label><select id="set-classroom" required>${classroomOptions(edit?.department_id, edit?.education_level_id, edit?.classroom_id)}</select></div>
    <div><label for="set-semester">ภาคเรียน</label><select id="set-semester"><option value="1" ${edit?.semester === 1 ? 'selected' : ''}>1</option><option value="2" ${edit?.semester === 2 ? 'selected' : ''}>2</option><option value="3" ${edit?.semester === 3 ? 'selected' : ''}>ฤดูร้อน</option></select></div>
    <div><label for="set-year">ปีการศึกษา (พ.ศ.)</label><input id="set-year" type="number" min="2500" max="2999" step="1" required value="${edit?.academic_year || new Date().getFullYear() + 543}"></div></div>
    <fieldset class="book-picker section"><legend>เลือกหนังสือในชุด (1–200 เล่ม)</legend>${catalogState.books.map(book => `<label><input type="checkbox" name="book_ids" value="${book.book_id}" ${selected.has(book.book_id) ? 'checked' : ''}><span>${escapeHtml(book.book_code)} · ${escapeHtml(book.book_name)}</span></label>`).join('') || '<p>ยังไม่มีหนังสือ กรุณาเพิ่มที่เมนูจัดการหนังสือก่อน</p>'}</fieldset>
    <div class="actions"><button class="button" type="submit" ${catalogState.books.length ? '' : 'disabled'}>${edit ? 'บันทึกการแก้ไข' : 'สร้างชุดหนังสือ'}</button>${edit ? '<button class="button secondary" type="button" data-action="cancel-set">ยกเลิกการแก้ไข</button>' : ''}</div></form></section>
    <section class="section"><h2>ชุดหนังสือทั้งหมด (${catalogState.sets.length} ชุด)</h2>${catalogState.sets.map(set => `<article class="card section"><div class="row"><div><h3>${escapeHtml(set.department_name)} · ${escapeHtml(set.classroom_name)}</h3><p class="muted">${escapeHtml(set.education_level_name)} · ภาคเรียน ${set.semester === 3 ? 'ฤดูร้อน' : set.semester} / ${set.academic_year}</p></div><span class="badge">${set.books.length} เล่ม</span></div>
    <details><summary>ดูรายชื่อหนังสือ</summary><ul>${set.books.map(book => `<li>${escapeHtml(book.book_code)} · ${escapeHtml(book.book_name)}</li>`).join('')}</ul></details>
    ${set.has_bookings ? '<p class="muted">มีประวัติการจองแล้ว จึงไม่สามารถแก้ไขหรือลบได้</p>' : ''}<div class="actions"><button class="button secondary" data-action="edit-set" data-id="${set.book_set_id}" ${set.has_bookings ? 'disabled' : ''}>แก้ไขชุด</button><button class="button danger" data-action="delete-set" data-id="${set.book_set_id}" ${set.has_bookings ? 'disabled' : ''}>ลบชุด</button></div></article>`).join('') || '<div class="card empty">ยังไม่มีชุดหนังสือ เริ่มสร้างชุดแรกด้านบน</div>'}</section></div>`;
}
function renderCatalog() {
  document.getElementById('catalog-page').outerHTML = page === 'admin-books' ? adminBooksView() : adminSetsView();
  bindCatalogUI();
}
async function catalogAction(action) {
  if (catalogState.busy) return;
  catalogState.busy = true;
  document.getElementById('catalog-page').inert = true;
  try { await action(); renderCatalog(); }
  catch (error) {
    if (error.status === 401) { window.location.replace('admin-login.html'); return; }
    document.getElementById('catalog-message').textContent = error.status ? error.message : 'ติดต่อระบบไม่ได้ กรุณาลองใหม่';
  } finally {
    catalogState.busy = false;
    document.getElementById('catalog-page').inert = false;
  }
}
function bindCatalogUI() {
  const root = document.getElementById('catalog-page');
  if (!root) return;
  document.getElementById('book-search')?.addEventListener('submit', event => {
    event.preventDefault(); catalogState.search = document.getElementById('search-books').value.trim();
    catalogAction(async () => { await loadCatalog(); catalogState.message = ''; });
  });
  document.getElementById('book-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const body = { book_code: document.getElementById('book-code').value, book_name: document.getElementById('book-name').value, description: document.getElementById('book-description').value };
    catalogAction(async () => {
      const id = catalogState.editBook?.book_id;
      await api('/api/admin/books' + (id ? '/' + id : ''), body, id ? 'PUT' : 'POST');
      catalogState.editBook = null; await loadCatalog(); catalogState.message = 'บันทึกหนังสือแล้ว';
    });
  });
  for (const id of ['set-department', 'set-level']) document.getElementById(id)?.addEventListener('change', () => {
    document.getElementById('set-classroom').innerHTML = classroomOptions(Number(document.getElementById('set-department').value), Number(document.getElementById('set-level').value));
  });
  document.getElementById('set-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const body = { department_id: Number(document.getElementById('set-department').value), education_level_id: Number(document.getElementById('set-level').value), classroom_id: Number(document.getElementById('set-classroom').value), semester: Number(document.getElementById('set-semester').value), academic_year: Number(document.getElementById('set-year').value), book_ids: [...root.querySelectorAll('input[name="book_ids"]:checked')].map(input => Number(input.value)) };
    catalogAction(async () => {
      const id = catalogState.editSet?.book_set_id;
      await api('/api/admin/book-sets' + (id ? '/' + id : ''), body, id ? 'PUT' : 'POST');
      catalogState.editSet = null; await loadCatalog(); catalogState.message = 'บันทึกชุดหนังสือแล้ว';
    });
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || catalogState.busy) return;
    const action = button.dataset.action, id = Number(button.dataset.id);
    if (action === 'edit-book') catalogState.editBook = catalogState.books.find(book => book.book_id === id);
    if (action === 'cancel-book') catalogState.editBook = null;
    if (action === 'edit-set') catalogState.editSet = catalogState.sets.find(set => set.book_set_id === id);
    if (action === 'cancel-set') catalogState.editSet = null;
    if (action === 'clear-search') { catalogState.search = ''; catalogAction(loadCatalog); return; }
    if (action === 'delete-book' || action === 'delete-set') {
      const isBook = action === 'delete-book';
      const name = isBook ? catalogState.books.find(book => book.book_id === id)?.book_name : 'ชุดหนังสือที่เลือก';
      if (!window.confirm(`ยืนยันลบ ${name}?`)) return;
      catalogAction(async () => {
        await api('/api/admin/' + (isBook ? 'books/' : 'book-sets/') + id, {}, 'DELETE');
        if (catalogState.editBook?.book_id === id && isBook) catalogState.editBook = null;
        if (catalogState.editSet?.book_set_id === id && !isBook) catalogState.editSet = null;
        await loadCatalog(); catalogState.message = 'ลบข้อมูลแล้ว';
      });
      return;
    }
    catalogState.message = ''; renderCatalog();
    document.getElementById('catalog-page').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
