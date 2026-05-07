/**
 * 家庭图书馆 · 图图馆长 · 主应用
 * 数据层：Supabase 云端 + localStorage 离线缓存
 */
import {
  booksDB, readersDB, logDB, librarianDB,
  exportData, exportBooksCSV, exportLogsCSV,
  generateRecommendations, parseNFCFromURL, generateNFCUrl,
} from './db.js';

// ── 状态 ─────────────────────────────────────
let currentPage = 'dashboard';
let bookFilter = 'all';
let bookView = 'grid';
let addBookTags = [];
let importFileData = null;
let isLoading = false;

const CATEGORIES = ['绘本', '科普', '文学故事', '历史文化', '自然博物', '工程科技', '艺术', '其他'];

// ── 初始化 ────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  librarianDB.updateLastVisit();
  bindNav();
  bindSidebar();
  bindTopbar();
  bindAddBook();
  bindAddLog();
  bindModals();
  bindSettings();
  bindMobileUI();

  // 先用缓存快速渲染，再拉云端数据刷新
  renderAllSync();
  await loadCloudData();
  checkNFCEntry();
});

// ── 云端数据加载 ──────────────────────────────
async function loadCloudData() {
  showGlobalLoading(true);
  try {
    await Promise.all([
      booksDB.getAll(),
      logDB.getAll(),
    ]);
    renderAllSync();
    hideGlobalLoading();
  } catch (e) {
    hideGlobalLoading();
    toast('网络异常，显示本地缓存数据', 'warn');
    console.warn('Supabase load error:', e);
  }
}

function showGlobalLoading(show) {
  isLoading = show;
  const el = document.getElementById('global-loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}
function hideGlobalLoading() { showGlobalLoading(false); }

// ── NFC 跳转检测 ──────────────────────────────
function checkNFCEntry() {
  const nfc = parseNFCFromURL();
  if (nfc) {
    setTimeout(() => openQuickLog(nfc.bookId), 200);
    history.replaceState(null, '', window.location.pathname);
  }
}

// ── 渲染（全部用缓存同步渲染）────────────────
function renderAllSync() {
  updateBadges();
  renderReaderCards();
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'books')     renderBooks();
  if (currentPage === 'jiejie')    renderReaderPage('jiejie');
  if (currentPage === 'didi')      renderReaderPage('didi');
  if (currentPage === 'logs')      renderLogs();
  if (currentPage === 'settings')  renderSettings();
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
  const titles = {
    dashboard: '图图馆长的书房', books: '藏书阁',
    jiejie: '姐姐的书单', didi: '弟弟的书单',
    logs: '阅读记录', settings: '设置 / 同步',
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  const addBtn = document.getElementById('btn-topbar-add');
  if (page === 'books')      { addBtn.style.display = 'flex'; addBtn.textContent = '＋ 录入新书'; addBtn.onclick = () => openAddBook(); }
  else if (page === 'logs')  { addBtn.style.display = 'flex'; addBtn.textContent = '＋ 记录阅读'; addBtn.onclick = () => openAddLog(); }
  else addBtn.style.display = 'none';
  renderAllSync();
}

function bindSidebar() {
  document.getElementById('btn-add-book-sidebar').addEventListener('click', () => openAddBook());
  document.getElementById('btn-add-log-sidebar').addEventListener('click', () => openAddLog());
}

function bindTopbar() {
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', e => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    if (!q) { if (currentPage === 'books') renderBooks(); return; }
    searchTimer = setTimeout(async () => {
      goPage('books');
      const books = await booksDB.search(q);
      renderBooksList(books);
    }, 300);
  });
}

function updateBadges() {
  const stats = booksDB.getStats();
  document.getElementById('badge-books').textContent = stats.total;
  const j = logDB.getReaderStatsCached('jiejie');
  const d = logDB.getReaderStatsCached('didi');
  document.getElementById('badge-jiejie').textContent = j.finished;
  document.getElementById('badge-didi').textContent = d.finished;
  document.getElementById('badge-logs').textContent = logDB.getAllCached().length;
}

function renderReaderCards() {
  readersDB.getAll().forEach(r => {
    const stats = logDB.getReaderStatsCached(r.id);
    const el = document.getElementById(`reader-sidebar-${r.id}`);
    if (el) el.querySelector('.reader-sub').textContent = `已读 ${stats.finished} 本`;
  });
}

// ── Dashboard ─────────────────────────────────
function renderDashboard() {
  const stats = booksDB.getStats();
  const logs = logDB.getAllCached();
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-jiejie').textContent = stats.forJiejie;
  document.getElementById('stat-didi').textContent = stats.forDidi;
  document.getElementById('stat-read').textContent = logs.filter(l => l.status === 'finished').length;

  const greetings = [
    `书架上现在有 <strong>${stats.total}</strong> 本书啦～记得多给孩子们念念哦。`,
    `姐姐的书和弟弟的书都在等着被翻开，今晚要读哪一本呢？`,
    `每一本书都是一扇窗，推开它，就是一个新世界。`,
    `有新书要记录吗？把它们好好收进来，以后找起来方便多啦。`,
  ];
  document.getElementById('greeting-text').innerHTML = greetings[Math.floor(Math.random() * greetings.length)];

  const recent = booksDB.getAllCached().slice(0, 6);
  const recentEl = document.getElementById('dash-recent-books');
  recentEl.innerHTML = recent.length === 0
    ? emptyHTML('📚', '还没有书哦', '点击「录入新书」开始建立你的书库吧～')
    : `<div class="books-grid">${recent.map(b => bookCardHTML(b)).join('')}</div>`;
  if (recent.length) bindBookCardClicks(recentEl);

  const recentLogs = logs.slice(0, 4);
  const logEl = document.getElementById('dash-recent-logs');
  logEl.innerHTML = recentLogs.length === 0
    ? emptyHTML('📖', '还没有阅读记录', '读完一本书，来这里记录下吧～')
    : recentLogs.map(l => logItemHTML(l)).join('');
}

// ── 藏书阁 ────────────────────────────────────
function renderBooks() {
  let books = booksDB.getAllCached();
  if (bookFilter !== 'all') {
    if (['available', 'reading', 'read'].includes(bookFilter))
      books = books.filter(b => b.status === bookFilter);
    else books = booksDB.getByCategory(bookFilter);
  }
  renderBooksList(books);
}

function renderBooksList(books) {
  const container = document.getElementById('books-container');
  if (books.length === 0) { container.innerHTML = emptyHTML('📚', '这里还空着', '快去录入第一本书吧～'); return; }
  container.innerHTML = bookView === 'grid'
    ? `<div class="books-grid">${books.map(b => bookCardHTML(b)).join('')}</div>`
    : `<div class="books-list">${books.map(b => bookRowHTML(b)).join('')}</div>`;
  bindBookCardClicks(container);
}

function bookCardHTML(b) {
  const rDots = readersDB.getAll()
    .filter(r => b.forReaders.includes(r.id) || b.forReaders.includes('all'))
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
  const statusMap = { available: ['status-available','在架'], reading: ['status-reading','阅读中'], read: ['status-read','已读完'] };
  const [cls, label] = statusMap[b.status] || ['status-available','在架'];
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

document.addEventListener('click', e => {
  const ftab = e.target.closest('.ftab[data-filter]');
  if (!ftab) return;
  bookFilter = ftab.dataset.filter;
  ftab.closest('.filter-row').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  ftab.classList.add('active');
  renderBooks();
});
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
  const stats = logDB.getReaderStatsCached(readerId);
  const el = document.getElementById(`page-${readerId}`);
  if (!el) return;

  el.querySelector('.rp-num-finished').textContent = stats.finished;
  el.querySelector('.rp-num-reading').textContent  = stats.reading;
  el.querySelector('.rp-num-rating').textContent   = stats.avgRating || '—';
  el.querySelector('.rp-interests').innerHTML = reader.interests.map(i => `<span class="interest-tag">${esc(i)}</span>`).join('');

  const recs = generateRecommendations(readerId);
  const recEl = el.querySelector('.rec-list');
  recEl.innerHTML = recs.length === 0
    ? emptyHTML('✨', '图图馆长还没有推荐', '多录入一些书，馆长就能帮你找到合适的了～')
    : `<div class="rec-grid">${recs.map(b => `
        <div class="rec-card" data-book-id="${b.id}">
          <div class="rec-spine" style="background:${b.coverColor}"></div>
          <div class="rec-title">${esc(b.title)}</div>
          <div class="rec-author">${esc(b.author || '—')}</div>
          <div class="rec-match">✦ 兴趣匹配</div>
        </div>`).join('')}</div>`;
  if (recs.length) bindBookCardClicks(el.querySelector('.rec-list'));

  const allLogs = logDB.getAllCached();
  const finished = allLogs.filter(l => l.readerId === readerId && l.status === 'finished');
  const readEl = el.querySelector('.read-list');
  readEl.innerHTML = finished.length === 0
    ? emptyHTML('📖', '还没有读完的书', '读完第一本书后记录在这里吧～')
    : `<div class="books-list">${finished.map(l => {
        const book = booksDB.getAllCached().find(b => b.id === l.bookId);
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
  if (finished.length) bindBookCardClicks(el.querySelector('.read-list'));
}

// ── 阅读记录 ──────────────────────────────────
function renderLogs() {
  const logs = logDB.getAllCached();
  const el = document.getElementById('logs-list');
  el.innerHTML = logs.length === 0
    ? emptyHTML('📖', '阅读记录是空的', '来记录一次阅读吧～')
    : logs.map(l => logItemHTML(l)).join('');
}

function logItemHTML(l) {
  const book   = booksDB.getAllCached().find(b => b.id === l.bookId);
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
  const catSel = document.getElementById('book-category');
  CATEGORIES.forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
    catSel.appendChild(opt);
  });
}

function openAddBook(bookId) {
  editBookId = bookId || null;
  addBookTags = [];
  document.getElementById('dup-warning').classList.remove('show');
  document.getElementById('modal-add-book-title').textContent = bookId ? '编辑书籍' : '录入新书';
  if (bookId) {
    const book = booksDB.getAllCached().find(b => b.id === bookId);
    if (book) {
      document.getElementById('book-title').value     = book.title;
      document.getElementById('book-author').value    = book.author;
      document.getElementById('book-publisher').value = book.publisher;
      document.getElementById('book-year').value      = book.year;
      document.getElementById('book-isbn').value      = book.isbn;
      document.getElementById('book-category').value  = book.category;
      document.getElementById('book-synopsis').value  = book.synopsis;
      addBookTags = [...(book.tags || [])];
      document.querySelectorAll('.reader-check').forEach(cb => { cb.checked = book.forReaders.includes(cb.value); });
      renderAddTags();
    }
  } else {
    ['book-title','book-author','book-publisher','book-year','book-isbn','book-synopsis'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('book-category').value = '绘本';
    document.querySelectorAll('.reader-check').forEach(cb => cb.checked = false);
    addBookTags = []; renderAddTags();
  }
  openModal('modal-add-book');
}
window.openEditBook = openAddBook;

function renderAddTags() {
  document.getElementById('book-tags-display').innerHTML = addBookTags.map((t, i) =>
    `<span class="tag-item">${esc(t)}<span class="tag-remove" onclick="removeBookTag(${i})">✕</span></span>`
  ).join('');
}
window.removeBookTag = i => { addBookTags.splice(i, 1); renderAddTags(); };

async function saveBook() {
  const title = document.getElementById('book-title').value.trim();
  if (!title) { toast('请填写书名', 'error'); return; }

  const saveBtn = document.getElementById('btn-save-book');
  saveBtn.disabled = true; saveBtn.textContent = '保存中…';

  const forReaders = [...document.querySelectorAll('.reader-check:checked')].map(cb => cb.value);
  const data = {
    title,
    author:    document.getElementById('book-author').value.trim(),
    publisher: document.getElementById('book-publisher').value.trim(),
    year:      document.getElementById('book-year').value.trim(),
    isbn:      document.getElementById('book-isbn').value.trim(),
    category:  document.getElementById('book-category').value,
    synopsis:  document.getElementById('book-synopsis').value.trim(),
    tags: [...addBookTags], forReaders,
  };

  try {
    if (editBookId) {
      await booksDB.update(editBookId, data);
      toast('书籍信息已更新 ✓', 'success');
    } else {
      const result = await booksDB.add(data);
      if (result.duplicate) {
        const warn = document.getElementById('dup-warning');
        warn.innerHTML = `📚 家里已经有一本《${esc(result.existing.title)}》了哦～要继续录入吗？`;
        warn.classList.add('show');
        warn.innerHTML += `<br><button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="forceSaveBook()">确认重复录入</button>`;
        window.forceSaveBook = async () => {
          const entry = { ...data, id: Date.now(), coverColor: randomColor(), status: 'available', addedAt: new Date().toISOString() };
          await sbDirectAdd(entry);
          toast('已强制录入 ✓', 'success');
          closeModal('modal-add-book');
          await loadCloudData();
        };
        saveBtn.disabled = false; saveBtn.textContent = '保存入库';
        return;
      }
      toast(`《${title}》已录入书库 ✓`, 'success');
    }
    closeModal('modal-add-book');
    renderAllSync();
  } catch (e) {
    toast('保存失败，请检查网络', 'error');
    console.error(e);
  }
  saveBtn.disabled = false; saveBtn.textContent = '保存入库';
}

// 强制录入时绕过重复检测直接写 Supabase
async function sbDirectAdd(entry) {
  const { sbBooks: sb } = await import('./supabase.js');
  // 复用 booksDB 的 add 路径，直接插入
  const { fromRow } = await import('./supabase.js');
  const rows = await fetch(`https://usvfteeznjfkvbnqjxlm.supabase.co/rest/v1/books`, {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmZ0ZWV6bmpma3ZibnFqeGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDY4ODUsImV4cCI6MjA5MzcyMjg4NX0.WMkERz3GKrLRDPR5PR0Gy6R8GaDWDvemt6w6k3AuYvU',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmZ0ZWV6bmpma3ZibnFqeGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDY4ODUsImV4cCI6MjA5MzcyMjg4NX0.WMkERz3GKrLRDPR5PR0Gy6R8GaDWDvemt6w6k3AuYvU`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      id: entry.id, title: entry.title, author: entry.author,
      isbn: entry.isbn, publisher: entry.publisher, year: entry.year,
      category: entry.category, tags: entry.tags, for_readers: entry.forReaders,
      cover_color: entry.coverColor, status: entry.status, synopsis: entry.synopsis,
    }),
  }).then(r => r.json());
  return rows;
}

window.deleteBook = async id => {
  if (!confirm('确认删除这本书？相关阅读记录不会删除。')) return;
  try {
    await booksDB.remove(id);
    toast('已删除', 'error');
    renderAllSync();
  } catch { toast('删除失败', 'error'); }
};

// ── 图书详情 Modal ────────────────────────────
function openBookDetail(bookId) {
  const book = booksDB.getAllCached().find(b => b.id === bookId);
  if (!book) return;
  const logs = logDB.getAllCached().filter(l => l.bookId === bookId);
  const nfcUrl = generateNFCUrl(bookId);
  const statusMap = { available: '在架', reading: '阅读中', read: '已读完' };
  const el = document.getElementById('book-detail-body');
  el.innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:20px;">
      <div style="width:80px;height:110px;border-radius:4px 10px 10px 4px;background:${book.coverColor};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.9);font-family:var(--font-serif);font-size:12px;text-align:center;padding:8px;box-shadow:var(--shadow-md);flex-shrink:0;">${esc(book.title)}</div>
      <div style="flex:1;">
        <div style="font-family:var(--font-serif);font-size:18px;font-weight:bold;color:var(--brown-dark);margin-bottom:4px;">${esc(book.title)}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">${esc(book.author || '—')} ${book.publisher ? '· '+esc(book.publisher) : ''} ${book.year ? '· '+esc(book.year) : ''}</div>
        <span class="status-badge status-${book.status}">${statusMap[book.status]}</span>
        <div style="margin-top:10px;">${(book.tags||[]).map(t=>`<span class="book-tag">${esc(t)}</span>`).join(' ')}</div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          ${readersDB.getAll().filter(r=>book.forReaders.includes(r.id)||book.forReaders.includes('all'))
            .map(r=>`<div class="reader-dot" style="background:${r.color}25;width:24px;height:24px;font-size:13px;">${r.avatar}</div>`).join('')}
        </div>
      </div>
    </div>
    ${book.synopsis ? `<p style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:16px;">${esc(book.synopsis)}</p>` : ''}
    ${logs.length ? `
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px;">阅读记录</div>
      ${logs.map(l => logItemHTML(l)).join('')}` : ''}
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
      <button class="btn btn-outline btn-sm" onclick="openEditBook(${book.id});closeModal('modal-book-detail')">编辑</button>
      <button class="btn btn-green btn-sm" onclick="openAddLog(${book.id});closeModal('modal-book-detail')">记录阅读</button>
      <button class="btn btn-ghost btn-sm" onclick="copyNFCUrl(${book.id})">📋 复制 NFC 链接</button>
    </div>
    <div id="nfc-url-display-${book.id}" style="display:none;margin-top:10px;padding:10px;background:var(--bg);border-radius:8px;font-size:11px;word-break:break-all;color:var(--text-muted);">${esc(nfcUrl)}</div>
  `;
  openModal('modal-book-detail');
}
window.openBookDetail = openBookDetail;

window.copyNFCUrl = bookId => {
  const url = generateNFCUrl(bookId);
  navigator.clipboard.writeText(url).then(() => {
    toast('NFC 链接已复制 ✓', 'success');
    const el = document.getElementById(`nfc-url-display-${bookId}`);
    if (el) el.style.display = 'block';
  }).catch(() => {
    const el = document.getElementById(`nfc-url-display-${bookId}`);
    if (el) el.style.display = 'block';
    toast('请手动复制上方链接', 'warn');
  });
};

// ── 快速登记 Modal（NFC 孩子端）──────────────
function openQuickLog(bookId) {
  const book = booksDB.getAllCached().find(b => b.id === bookId);
  if (!book) return;
  const readers = readersDB.getAll();
  const el = document.getElementById('quick-log-body');
  el.innerHTML = `
    <div class="quick-book-info">
      <div class="quick-book-cover" style="background:${book.coverColor}">${esc(book.title)}</div>
      <div class="quick-book-name">${esc(book.title)}</div>
      <div class="quick-book-author">${esc(book.author || '')}</div>
    </div>
    <div class="quick-section-label">我是谁？</div>
    <div class="quick-reader-btns">
      ${readers.map(r => `
        <button class="quick-reader-btn" data-reader="${r.id}" style="--reader-color:${r.color}">
          <span class="quick-reader-avatar">${r.avatar}</span>
          <span class="quick-reader-name">${r.name}</span>
        </button>`).join('')}
    </div>
    <div class="quick-section-label" style="margin-top:20px;">我要做什么？</div>
    <div class="quick-action-btns" id="quick-action-btns" style="display:none;">
      <button class="quick-action-btn reading" onclick="submitQuickLog(${bookId},'reading')">
        <span class="quick-action-icon">📖</span><span>我开始读啦</span>
      </button>
      <button class="quick-action-btn finished" onclick="submitQuickLog(${bookId},'finished')">
        <span class="quick-action-icon">✅</span><span>我读完了！</span>
      </button>
    </div>
    <div id="quick-log-result" style="display:none;text-align:center;padding:20px 0;">
      <div style="font-size:48px;margin-bottom:12px;">🎉</div>
      <div style="font-size:18px;font-weight:bold;color:var(--brown-dark);">记录成功！</div>
      <div id="quick-log-result-msg" style="font-size:14px;color:var(--text-muted);margin-top:6px;"></div>
      <button class="btn btn-primary" style="margin-top:16px;" onclick="closeModal('modal-quick-log')">好的～</button>
    </div>
  `;
  let selectedReader = null;
  el.querySelectorAll('.quick-reader-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.quick-reader-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedReader = btn.dataset.reader;
      document.getElementById('quick-action-btns').style.display = 'grid';
    });
  });
  window._quickSelectedReader = () => selectedReader;
  openModal('modal-quick-log');
}
window.openQuickLog = openQuickLog;

window.submitQuickLog = async (bookId, status) => {
  const readerId = window._quickSelectedReader?.();
  if (!readerId) { toast('请先选择是谁在读书', 'error'); return; }
  const reader = readersDB.get(readerId);
  const book = booksDB.getAllCached().find(b => b.id === bookId);
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    await logDB.add({ bookId, readerId, status, startDate: todayStr, endDate: status === 'finished' ? todayStr : null, note: '', rating: 0 });
    renderAllSync();
    document.querySelector('.quick-reader-btns').style.display = 'none';
    document.getElementById('quick-action-btns').style.display = 'none';
    document.querySelectorAll('.quick-section-label').forEach(el => el.style.display = 'none');
    document.getElementById('quick-log-result').style.display = 'block';
    const msg = status === 'finished'
      ? `${reader?.avatar || ''} ${reader?.name || ''} 读完了《${book?.title || ''}》，太棒了！`
      : `${reader?.avatar || ''} ${reader?.name || ''} 开始读《${book?.title || ''}》啦，加油！`;
    document.getElementById('quick-log-result-msg').textContent = msg;
    toast(msg, 'success');
  } catch { toast('记录失败，请检查网络', 'error'); }
};

// ── 阅读记录 Modal ────────────────────────────
function bindAddLog() {
  document.getElementById('btn-save-log').addEventListener('click', saveLog);
  const bookSel = document.getElementById('log-book');
  window._updateLogBookOptions = () => {
    bookSel.innerHTML = '<option value="">请选择书籍…</option>';
    booksDB.getAllCached().forEach(b => {
      const opt = document.createElement('option'); opt.value = b.id; opt.textContent = b.title;
      bookSel.appendChild(opt);
    });
  };
  document.getElementById('btn-add-log-topbar')?.addEventListener('click', () => openAddLog());
}

function openAddLog(bookId) {
  window._updateLogBookOptions();
  document.getElementById('log-reader').innerHTML = readersDB.getAll().map(r => `<option value="${r.id}">${r.avatar} ${r.name}</option>`).join('');
  if (bookId) document.getElementById('log-book').value = bookId;
  document.getElementById('log-status').value = 'reading';
  document.getElementById('log-start').value  = new Date().toISOString().split('T')[0];
  document.getElementById('log-end').value    = '';
  document.getElementById('log-note').value   = '';
  document.getElementById('log-rating').value = '0';
  openModal('modal-add-log');
}
window.openAddLog = openAddLog;

async function saveLog() {
  const bookId   = Number(document.getElementById('log-book').value);
  const readerId = document.getElementById('log-reader').value;
  if (!bookId) { toast('请选择书籍', 'error'); return; }
  const saveBtn = document.getElementById('btn-save-log');
  saveBtn.disabled = true; saveBtn.textContent = '保存中…';
  try {
    await logDB.add({
      bookId, readerId,
      status:    document.getElementById('log-status').value,
      startDate: document.getElementById('log-start').value,
      endDate:   document.getElementById('log-end').value || null,
      note:      document.getElementById('log-note').value.trim(),
      rating:    Number(document.getElementById('log-rating').value),
    });
    toast('阅读记录已保存 ✓', 'success');
    closeModal('modal-add-log');
    renderAllSync();
  } catch { toast('保存失败，请检查网络', 'error'); }
  saveBtn.disabled = false; saveBtn.textContent = '保存记录';
}

// ── 设置页 ─────────────────────────────────────
function bindSettings() {
  document.getElementById('btn-export').addEventListener('click', () => {
    downloadBlob(new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' }), `家庭图书馆备份-${today()}.json`);
    toast('备份已导出 ✓', 'success');
  });
  document.getElementById('btn-export-books-csv').addEventListener('click', () => {
    downloadBlob(new Blob(['\uFEFF' + exportBooksCSV()], { type: 'text/csv;charset=utf-8' }), `书籍台账-${today()}.csv`);
    toast('书籍 CSV 已导出，可直接导入飞书多维表格 ✓', 'success');
  });
  document.getElementById('btn-export-logs-csv').addEventListener('click', () => {
    downloadBlob(new Blob(['\uFEFF' + exportLogsCSV()], { type: 'text/csv;charset=utf-8' }), `阅读记录-${today()}.csv`);
    toast('阅读记录 CSV 已导出 ✓', 'success');
  });
  document.getElementById('btn-refresh-cloud').addEventListener('click', async () => {
    toast('正在同步云端数据…', 'warn');
    await loadCloudData();
    toast('同步完成 ✓', 'success');
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
  document.getElementById('btn-import').addEventListener('click', async () => {
    if (!importFileData || !confirm('确认导入到云端？将批量写入 Supabase。')) return;
    const btn = document.getElementById('btn-import');
    btn.disabled = true; btn.textContent = '导入中…';
    try {
      for (const book of (importFileData.books || [])) {
        try { await booksDB.add(book); } catch {}
      }
      for (const log of (importFileData.logs || [])) {
        try { await logDB.add(log); } catch {}
      }
      toast('数据已导入云端 ✓', 'success');
      await loadCloudData();
    } catch { toast('导入失败', 'error'); }
    btn.disabled = false; btn.textContent = '⬆ 导入并覆盖';
  });
}

function renderSettings() {
  const books = booksDB.getAllCached();
  const nfcList = document.getElementById('nfc-book-list');
  if (!nfcList) return;
  nfcList.innerHTML = books.length === 0
    ? `<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">还没有书，先录入书籍再生成 NFC 链接吧～</div>`
    : books.map(b => `
        <div class="nfc-list-row">
          <div class="nfc-spine" style="background:${b.coverColor}"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:500;color:var(--text-primary);">${esc(b.title)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${esc(b.author || '—')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="copyNFCUrl(${b.id})">📋 复制链接</button>
        </div>`).join('');
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
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.closeModal = closeModal;

// ── Helpers ───────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function emptyHTML(icon, title, desc) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
}
function starsHTML(n) { return '★'.repeat(Math.round(n||0)) + '☆'.repeat(5-Math.round(n||0)); }
function randomColor() {
  const c = ['#C8866A','#7DB5A0','#D4A853','#8B6F9E','#6B8FAB','#C17B5A','#5F8C6F'];
  return c[Math.floor(Math.random() * c.length)];
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 2800);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}
function today() { return new Date().toISOString().split('T')[0]; }

// ── 手机端 UI ──────────────────────────────────
function bindMobileUI() {
  const isMobile = () => window.innerWidth <= 640;

  // 底部导航：绑定点击
  document.querySelectorAll('.mobile-nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => goPage(el.dataset.page));
  });

  // FAB 按钮：根据当前页面决定行为
  const fab = document.getElementById('fab-add');
  fab.addEventListener('click', () => {
    if (currentPage === 'logs') openAddLog();
    else openAddBook();
  });

  // 搜索按钮 + 弹层
  const searchBtn = document.getElementById('mobile-search-btn');
  const searchOverlay = document.getElementById('mobile-search-overlay');
  const searchInput = document.getElementById('mobile-search-input');
  searchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('open');
    setTimeout(() => searchInput.focus(), 100);
  });
  searchOverlay.addEventListener('click', e => {
    if (e.target === searchOverlay) searchOverlay.classList.remove('open');
  });
  let mSearchTimer;
  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim();
    clearTimeout(mSearchTimer);
    if (!q) { if (currentPage === 'books') renderBooks(); return; }
    mSearchTimer = setTimeout(async () => {
      searchOverlay.classList.remove('open');
      goPage('books');
      const books = await booksDB.search(q);
      renderBooksList(books);
    }, 400);
  });

  // 响应窗口大小变化，动态显隐手机端元素
  function applyMobileLayout() {
    const m = isMobile();
    document.getElementById('mobile-nav').style.display = m ? 'flex' : 'none';
    document.getElementById('fab-add').style.display = m ? 'flex' : 'none';
    document.getElementById('mobile-search-btn').style.display = m ? 'flex' : 'none';
    if (!m) searchOverlay.classList.remove('open');
  }
  applyMobileLayout();
  window.addEventListener('resize', applyMobileLayout);
}

// 扩展 goPage，同时更新底部导航高亮
const _goPageOrig = goPage;
window.goPage = function(page) {
  _goPageOrig(page);
  document.querySelectorAll('.mobile-nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // FAB：在设置页隐藏，其他页显示
  const fab = document.getElementById('fab-add');
  if (fab && fab.style.display !== 'none') {
    fab.style.opacity = page === 'settings' ? '0' : '1';
    fab.style.pointerEvents = page === 'settings' ? 'none' : 'auto';
  }
};
