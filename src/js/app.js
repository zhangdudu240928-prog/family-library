/**
 * 家庭图书馆 · 图图馆长 · 主应用
 */
import { booksDB, readersDB, logDB, librarianDB, exportData, importData, generateRecommendations } from './db.js';

// ── 状态 ─────────────────────────────────────
let currentPage = 'dashboard';
let currentReader = null;   // null = 全家视角
let bookFilter = 'all';
let bookView = 'grid';      // grid | list
let addBookTags = [];
let importFileData = null;

const CATEGORIES = ['绘本', '科普', '文学故事', '历史文化', '自然博物', '工程科技', '艺术', '其他'];

// ── 初始化 ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  librarianDB.updateLastVisit();
  bindNav();
  bindSidebar();
  bindTopbar();
  bindAddBook();
  bindAddLog();
  bindModals();
  bindExport();
  renderAll();
});

// ── 渲染总入口 ────────────────────────────────
function renderAll() {
  updateBadges();
  renderReaderCards();
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'books') renderBooks();
  if (currentPage === 'jiejie') renderReaderPage('jiejie');
  if (currentPage === 'didi') renderReaderPage('didi');
  if (currentPage === 'logs') renderLogs();
}

// ── 导航 ─────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => goPage(el.dataset.page));
  });
  document.querySelectorAll('.reader-card[data-reader]').forEach(el => {
    el.addEventListener('click', () => goPage(el.dataset.reader));
  });
}

function goPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item[data-page], .reader-card[data-reader]').forEach(el => {
    const key = el.dataset.page || el.dataset.reader;
    el.classList.toggle('active', key === page);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  const titles = { dashboard: '图图馆长的书房', books: '藏书阁', jiejie: '姐姐的书单', didi: '弟弟的书单', logs: '阅读记录', settings: '设置' };
  document.getElementById('page-title').textContent = titles[page] || page;
  const addBtn = document.getElementById('btn-topbar-add');
  if (page === 'books') { addBtn.style.display = 'flex'; addBtn.textContent = '＋ 录入新书'; addBtn.onclick = () => openAddBook(); }
  else if (page === 'logs') { addBtn.style.display = 'flex'; addBtn.textContent = '＋ 记录阅读'; addBtn.onclick = () => openAddLog(); }
  else addBtn.style.display = 'none';
  if (page === 'dashboard') renderDashboard();
  if (page === 'books') renderBooks();
  if (page === 'jiejie') renderReaderPage('jiejie');
  if (page === 'didi') renderReaderPage('didi');
  if (page === 'logs') renderLogs();
}

function bindSidebar() {
  document.getElementById('btn-add-book-sidebar').addEventListener('click', () => { openAddBook(); });
  document.getElementById('btn-add-log-sidebar').addEventListener('click', () => { openAddLog(); });
}

function bindTopbar() {
  document.getElementById('search-input').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (!q) { if (currentPage === 'books') renderBooks(); return; }
    goPage('books');
    renderBooksList(booksDB.search(q));
  });
}

function updateBadges() {
  const stats = booksDB.getStats();
  document.getElementById('badge-books').textContent = stats.total;
  const jStats = logDB.getReaderStats('jiejie');
  const dStats = logDB.getReaderStats('didi');
  document.getElementById('badge-jiejie').textContent = jStats.finished;
  document.getElementById('badge-didi').textContent = dStats.finished;
  document.getElementById('badge-logs').textContent = logDB.getAll().length;
}

function renderReaderCards() {
  const readers = readersDB.getAll();
  readers.forEach(r => {
    const jStats = logDB.getReaderStats(r.id);
    const el = document.getElementById(`reader-sidebar-${r.id}`);
    if (el) el.querySelector('.reader-sub').textContent = `已读 ${jStats.finished} 本`;
  });
}

// ── Dashboard ─────────────────────────────────
function renderDashboard() {
  const stats = booksDB.getStats();
  const logs = logDB.getAll();
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-jiejie').textContent = stats.forJiejie;
  document.getElementById('stat-didi').textContent = stats.forDidi;
  document.getElementById('stat-read').textContent = logs.filter(l => l.status === 'finished').length;

  // 馆长寄语
  const greetings = [
    `书架上现在有 <strong>${stats.total}</strong> 本书啦～记得多给孩子们念念哦。`,
    `姐姐的书和弟弟的书都在等着被翻开，今晚要读哪一本呢？`,
    `每一本书都是一扇窗，推开它，就是一个新世界。`,
    `有新书要记录吗？把它们好好收进来，以后找起来方便多啦。`,
  ];
  document.getElementById('greeting-text').innerHTML = greetings[Math.floor(Math.random() * greetings.length)];

  // 最近录入
  const recent = booksDB.getAll().slice(0, 6);
  const recentEl = document.getElementById('dash-recent-books');
  if (recent.length === 0) {
    recentEl.innerHTML = emptyHTML('📚', '还没有书哦', '点击「录入新书」开始建立你的书库吧～');
  } else {
    recentEl.innerHTML = `<div class="books-grid">${recent.map(b => bookCardHTML(b)).join('')}</div>`;
    bindBookCardClicks(recentEl);
  }

  // 最近阅读
  const recentLogs = logDB.getAll().slice(0, 4);
  const logEl = document.getElementById('dash-recent-logs');
  if (recentLogs.length === 0) {
    logEl.innerHTML = emptyHTML('📖', '还没有阅读记录', '读完一本书，来这里记录下吧～');
  } else {
    logEl.innerHTML = recentLogs.map(l => logItemHTML(l)).join('');
  }
}

// ── 藏书阁 ────────────────────────────────────
function renderBooks() {
  let books = booksDB.getAll();
  if (bookFilter !== 'all') {
    if (bookFilter === 'available') books = books.filter(b => b.status === 'available');
    else if (bookFilter === 'reading') books = books.filter(b => b.status === 'reading');
    else if (bookFilter === 'read') books = books.filter(b => b.status === 'read');
    else books = booksDB.getByCategory(bookFilter);
  }
  renderBooksList(books);
}

function renderBooksList(books) {
  const container = document.getElementById('books-container');
  if (books.length === 0) {
    container.innerHTML = emptyHTML('📚', '这里还空着', '快去录入第一本书吧～');
    return;
  }
  if (bookView === 'grid') {
    container.innerHTML = `<div class="books-grid">${books.map(b => bookCardHTML(b)).join('')}</div>`;
  } else {
    container.innerHTML = `<div class="books-list">${books.map(b => bookRowHTML(b)).join('')}</div>`;
  }
  bindBookCardClicks(container);
}

function bookCardHTML(b) {
  const readers = readersDB.getAll();
  const rDots = readers.filter(r => b.forReaders.includes(r.id) || b.forReaders.includes('all'))
    .map(r => `<div class="reader-dot" style="background:${r.color}20">${r.avatar}</div>`).join('');
  const tags = (b.tags || []).slice(0, 2).map(t => `<span class="book-tag">${esc(t)}</span>`).join('');
  return `
    <div class="book-card" data-book-id="${b.id}">
      <div class="book-cover" style="background:${b.coverColor}18">
        <div class="book-cover-inner" style="background:${b.coverColor}">${esc(b.title)}</div>
      </div>
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-author">${esc(b.author || '—')}</div>
        ${tags ? `<div class="book-tags">${tags}</div>` : ''}
        <div class="book-readers">${rDots}</div>
      </div>
    </div>`;
}

function bookRowHTML(b) {
  const statusMap = { available: ['status-available', '在架'], reading: ['status-reading', '阅读中'], read: ['status-read', '已读完'] };
  const [cls, label] = statusMap[b.status] || ['status-available', '在架'];
  return `
    <div class="book-row" data-book-id="${b.id}">
      <div class="book-row-spine" style="background:${b.coverColor}"></div>
      <div class="book-row-info">
        <div class="book-row-title">${esc(b.title)}</div>
        <div class="book-row-meta">${esc(b.author || '—')} · ${esc(b.category)}</div>
      </div>
      <span class="status-badge ${cls}">${label}</span>
      <div class="book-row-actions">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openEditBook(${b.id})">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteBook(${b.id})">删除</button>
      </div>
    </div>`;
}

function bindBookCardClicks(container) {
  container.querySelectorAll('[data-book-id]').forEach(el => {
    el.addEventListener('click', () => openBookDetail(Number(el.dataset.bookId)));
  });
}

// Filter tabs
document.addEventListener('click', e => {
  const ftab = e.target.closest('.ftab[data-filter]');
  if (!ftab) return;
  bookFilter = ftab.dataset.filter;
  ftab.closest('.filter-row').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  ftab.classList.add('active');
  renderBooks();
});

// View toggle
document.addEventListener('click', e => {
  const vbtn = e.target.closest('.view-btn[data-view]');
  if (!vbtn) return;
  bookView = vbtn.dataset.view;
  vbtn.closest('.view-toggle').querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  vbtn.classList.add('active');
  renderBooks();
});

// ── 读者页 ────────────────────────────────────
function renderReaderPage(readerId) {
  const reader = readersDB.get(readerId);
  if (!reader) return;
  const stats = logDB.getReaderStats(readerId);
  const el = document.getElementById(`page-${readerId}`);
  if (!el) return;

  // Profile header
  el.querySelector('.rp-num-finished').textContent = stats.finished;
  el.querySelector('.rp-num-reading').textContent = stats.reading;
  el.querySelector('.rp-num-rating').textContent = stats.avgRating || '—';

  // Interests
  const intEl = el.querySelector('.rp-interests');
  intEl.innerHTML = reader.interests.map(i => `<span class="interest-tag">${esc(i)}</span>`).join('');

  // 推荐书单
  const recs = generateRecommendations(readerId);
  const recEl = el.querySelector('.rec-list');
  if (recs.length === 0) {
    recEl.innerHTML = emptyHTML('✨', '图图馆长还没有推荐', '多录入一些书，馆长就能帮你找到合适的了～');
  } else {
    recEl.innerHTML = `<div class="rec-grid">${recs.map(b => `
      <div class="rec-card" data-book-id="${b.id}">
        <div class="rec-spine" style="background:${b.coverColor}"></div>
        <div class="rec-title">${esc(b.title)}</div>
        <div class="rec-author">${esc(b.author || '—')}</div>
        <div class="rec-match">✦ 兴趣匹配</div>
      </div>`).join('')}</div>`;
    bindBookCardClicks(el.querySelector('.rec-list'));
  }

  // 已读书单
  const finished = logDB.getFinished(readerId);
  const readEl = el.querySelector('.read-list');
  if (finished.length === 0) {
    readEl.innerHTML = emptyHTML('📖', '还没有读完的书', '读完第一本书后记录在这里吧～');
  } else {
    readEl.innerHTML = `<div class="books-list">${finished.map(l => {
      const book = booksDB.getAll().find(b => b.id === l.bookId);
      if (!book) return '';
      return `<div class="book-row" data-book-id="${book.id}">
        <div class="book-row-spine" style="background:${book.coverColor}"></div>
        <div class="book-row-info">
          <div class="book-row-title">${esc(book.title)}</div>
          <div class="book-row-meta">${esc(book.author || '—')} · 读完于 ${l.endDate || '—'}</div>
          ${l.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;font-style:italic;">${esc(l.note)}</div>` : ''}
        </div>
        <div>${starsHTML(l.rating)}</div>
      </div>`;
    }).join('')}</div>`;
    bindBookCardClicks(el.querySelector('.read-list'));
  }
}

// ── 阅读记录 ──────────────────────────────────
function renderLogs() {
  const logs = logDB.getAll();
  const el = document.getElementById('logs-list');
  if (logs.length === 0) {
    el.innerHTML = emptyHTML('📖', '阅读记录是空的', '来记录一次阅读吧～');
    return;
  }
  el.innerHTML = logs.map(l => logItemHTML(l)).join('');
}

function logItemHTML(l) {
  const book = booksDB.getAll().find(b => b.id === l.bookId);
  const reader = readersDB.get(l.readerId);
  if (!book || !reader) return '';
  const statusMap = { reading: '📖 阅读中', finished: '✅ 已读完', 'gave-up': '⏸ 暂停了' };
  return `
    <div class="log-item">
      <div class="log-reader-dot" style="background:${reader.color}25">${reader.avatar}</div>
      <div class="log-content">
        <div class="log-title">${esc(book.title)}</div>
        <div class="log-meta">${esc(reader.name)} · ${statusMap[l.status] || l.status} · ${l.startDate}${l.endDate ? ' → ' + l.endDate : ''}</div>
        ${l.note ? `<div class="log-note">"${esc(l.note)}"</div>` : ''}
        ${l.rating ? `<div class="stars">${starsHTML(l.rating)}</div>` : ''}
      </div>
    </div>`;
}

// ── 录入新书 Modal ────────────────────────────
let editBookId = null;

function bindAddBook() {
  document.getElementById('btn-add-book-topbar')?.addEventListener('click', () => openAddBook());
  document.getElementById('btn-save-book').addEventListener('click', saveBook);
  document.getElementById('book-tag-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v && !addBookTags.includes(v)) { addBookTags.push(v); renderAddTags(); e.target.value = ''; }
    }
  });

  // 分类渲染
  const catSel = document.getElementById('book-category');
  CATEGORIES.forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
    catSel.appendChild(opt);
  });
}

function openAddBook(bookId) {
  editBookId = bookId || null;
  addBookTags = [];
  const titleEl = document.getElementById('modal-add-book-title');
  document.getElementById('dup-warning').classList.remove('show');
  if (bookId) {
    titleEl.textContent = '编辑书籍';
    const book = booksDB.getAll().find(b => b.id === bookId);
    if (book) {
      document.getElementById('book-title').value = book.title;
      document.getElementById('book-author').value = book.author;
      document.getElementById('book-publisher').value = book.publisher;
      document.getElementById('book-year').value = book.year;
      document.getElementById('book-isbn').value = book.isbn;
      document.getElementById('book-category').value = book.category;
      document.getElementById('book-synopsis').value = book.synopsis;
      addBookTags = [...(book.tags || [])];
      document.querySelectorAll('.reader-check').forEach(cb => {
        cb.checked = book.forReaders.includes(cb.value);
      });
      renderAddTags();
    }
  } else {
    titleEl.textContent = '录入新书';
    ['book-title','book-author','book-publisher','book-year','book-isbn','book-synopsis'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('book-category').value = '绘本';
    document.querySelectorAll('.reader-check').forEach(cb => cb.checked = false);
    addBookTags = [];
    renderAddTags();
  }
  openModal('modal-add-book');
}

window.openEditBook = openAddBook;

function renderAddTags() {
  const el = document.getElementById('book-tags-display');
  el.innerHTML = addBookTags.map((t, i) => `
    <span class="tag-item">${esc(t)}<span class="tag-remove" onclick="removeBookTag(${i})">✕</span></span>
  `).join('');
}
window.removeBookTag = i => { addBookTags.splice(i, 1); renderAddTags(); };

function saveBook() {
  const title = document.getElementById('book-title').value.trim();
  if (!title) { toast('请填写书名', 'error'); return; }

  const forReaders = [...document.querySelectorAll('.reader-check:checked')].map(cb => cb.value);
  const data = {
    title,
    author: document.getElementById('book-author').value.trim(),
    publisher: document.getElementById('book-publisher').value.trim(),
    year: document.getElementById('book-year').value.trim(),
    isbn: document.getElementById('book-isbn').value.trim(),
    category: document.getElementById('book-category').value,
    synopsis: document.getElementById('book-synopsis').value.trim(),
    tags: [...addBookTags],
    forReaders,
  };

  if (editBookId) {
    booksDB.update(editBookId, data);
    toast('书籍信息已更新 ✓', 'success');
  } else {
    const result = booksDB.add(data);
    if (result.duplicate) {
      const warn = document.getElementById('dup-warning');
      warn.innerHTML = `📚 家里已经有一本《${esc(result.existing.title)}》了哦～要继续录入吗？`;
      warn.classList.add('show');
      warn.querySelector || (warn.onclick = () => { forceSaveBook(data); closeModal('modal-add-book'); });
      // Add force button
      warn.innerHTML += `<br><button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="forceSaveBook()">确认重复录入</button>`;
      window.forceSaveBook = () => {
        const list = booksDB.getAll();
        const entry = { id: Date.now(), ...data, coverColor: randomColor(), status: 'available', addedAt: new Date().toISOString() };
        list.unshift(entry);
        booksDB.save(list);
        toast('已强制录入 ✓', 'success');
        closeModal('modal-add-book');
        renderAll();
      };
      return;
    }
    toast(`《${title}》已录入书库 ✓`, 'success');
  }
  closeModal('modal-add-book');
  renderAll();
}

window.deleteBook = id => {
  if (!confirm('确认删除这本书？相关阅读记录不会删除。')) return;
  booksDB.remove(id);
  toast('已删除', 'error');
  renderAll();
};

// ── 图书详情 Modal ────────────────────────────
function openBookDetail(bookId) {
  const book = booksDB.getAll().find(b => b.id === bookId);
  if (!book) return;
  const readers = readersDB.getAll();
  const logs = logDB.getByBook(bookId);
  const statusMap = { available: '在架', reading: '阅读中', read: '已读完' };
  const el = document.getElementById('book-detail-body');
  el.innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:20px;">
      <div style="width:80px;height:110px;border-radius:4px 10px 10px 4px;background:${book.coverColor};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.9);font-family:var(--font-serif);font-size:12px;text-align:center;padding:8px;box-shadow:var(--shadow-md);flex-shrink:0;">${esc(book.title)}</div>
      <div style="flex:1;">
        <div style="font-family:var(--font-serif);font-size:18px;font-weight:bold;color:var(--brown-dark);margin-bottom:4px;">${esc(book.title)}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">${esc(book.author || '—')} ${book.publisher ? '· ' + esc(book.publisher) : ''} ${book.year ? '· ' + esc(book.year) : ''}</div>
        <span class="status-badge status-${book.status}">${statusMap[book.status]}</span>
        <div style="margin-top:10px;">${(book.tags || []).map(t => `<span class="book-tag">${esc(t)}</span>`).join(' ')}</div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          ${readers.filter(r => book.forReaders.includes(r.id) || book.forReaders.includes('all'))
            .map(r => `<div class="reader-dot" style="background:${r.color}25;width:24px;height:24px;font-size:13px;">${r.avatar}</div>`).join('')}
        </div>
      </div>
    </div>
    ${book.synopsis ? `<p style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:16px;">${esc(book.synopsis)}</p>` : ''}
    ${logs.length > 0 ? `
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px;">阅读记录</div>
      ${logs.map(l => {
        const reader = readersDB.get(l.readerId);
        return reader ? `<div class="log-item" style="margin-bottom:6px;">${logItemHTML(l)}</div>` : '';
      }).join('')}` : ''}
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn btn-outline btn-sm" onclick="openEditBook(${book.id});closeModal('modal-book-detail')">编辑</button>
      <button class="btn btn-green btn-sm" onclick="openAddLog(${book.id});closeModal('modal-book-detail')">记录阅读</button>
    </div>
  `;
  openModal('modal-book-detail');
}
window.openBookDetail = openBookDetail;

// ── 阅读记录 Modal ────────────────────────────
let preselectedBookId = null;

function bindAddLog() {
  document.getElementById('btn-save-log').addEventListener('click', saveLog);
  // Populate book select
  const bookSel = document.getElementById('log-book');
  const updateBookOptions = () => {
    bookSel.innerHTML = '<option value="">请选择书籍…</option>';
    booksDB.getAll().forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.title;
      bookSel.appendChild(opt);
    });
  };
  document.getElementById('btn-add-log-topbar')?.addEventListener('click', () => openAddLog());
  window._updateLogBookOptions = updateBookOptions;
}

function openAddLog(bookId) {
  preselectedBookId = bookId || null;
  window._updateLogBookOptions();
  const readers = readersDB.getAll();
  const rSel = document.getElementById('log-reader');
  rSel.innerHTML = readers.map(r => `<option value="${r.id}">${r.avatar} ${r.name}</option>`).join('');
  if (bookId) document.getElementById('log-book').value = bookId;
  document.getElementById('log-status').value = 'reading';
  document.getElementById('log-start').value = new Date().toISOString().split('T')[0];
  document.getElementById('log-end').value = '';
  document.getElementById('log-note').value = '';
  document.getElementById('log-rating').value = '0';
  openModal('modal-add-log');
}
window.openAddLog = openAddLog;

function saveLog() {
  const bookId = Number(document.getElementById('log-book').value);
  const readerId = document.getElementById('log-reader').value;
  if (!bookId) { toast('请选择书籍', 'error'); return; }
  logDB.add({
    bookId, readerId,
    status: document.getElementById('log-status').value,
    startDate: document.getElementById('log-start').value,
    endDate: document.getElementById('log-end').value || null,
    note: document.getElementById('log-note').value.trim(),
    rating: Number(document.getElementById('log-rating').value),
  });
  toast('阅读记录已保存 ✓', 'success');
  closeModal('modal-add-log');
  renderAll();
}

// ── Modal 控制 ────────────────────────────────
function bindModals() {
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(m => closeModal(m.id));
  });
}
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.closeModal = closeModal;

// ── Export/Import ─────────────────────────────
function bindExport() {
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `家庭图书馆备份-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast('备份已导出 ✓', 'success');
  });

  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    document.getElementById('import-filename').textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => {
      try { importFileData = JSON.parse(ev.target.result); document.getElementById('btn-import').disabled = false; }
      catch { toast('文件格式错误', 'error'); }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    if (!importFileData || !confirm('确认导入？将覆盖当前所有数据。')) return;
    importData(importFileData);
    toast('数据已恢复 ✓', 'success');
    renderAll();
  });
}

// ── Helpers ───────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function emptyHTML(icon, title, desc) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
}
function starsHTML(n) {
  return '★'.repeat(Math.round(n || 0)) + '☆'.repeat(5 - Math.round(n || 0));
}
function randomColor() {
  const c = ['#C8866A','#7DB5A0','#D4A853','#8B6F9E','#6B8FAB','#C17B5A','#5F8C6F'];
  return c[Math.floor(Math.random() * c.length)];
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 2600);
}
