/**
 * 家庭图书馆 · 数据管理层
 * 主存储：Supabase（云端，多设备同步）
 * 离线缓存：localStorage（网络异常时可用）
 */

import { sbBooks, sbLogs, fromRow, fromLogRow } from './supabase.js';

// ── 默认读者档案 ──────────────────────────────
export const DEFAULT_READERS = [
  {
    id: 'jiejie',
    name: '姐姐',
    age: 9,
    avatar: '🌿',
    color: '#7DB5A0',
    interests: ['历史', '文物', '植物', '动物', '冒险故事', '温情故事'],
  },
  {
    id: 'didi',
    name: '弟弟',
    age: 6,
    avatar: '🚂',
    color: '#E8956D',
    interests: ['工程', '火车', '可爱故事', '温暖故事'],
  },
];

// ── 本地缓存读写（离线备用）────────────────────
const CACHE = {
  books: 'lib_cache_books',
  logs:  'lib_cache_logs',
};
function getCache(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}
function setCache(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── 图书 ──────────────────────────────────────
export const booksDB = {
  // 从 Supabase 拉取，失败时用缓存
  async getAll() {
    try {
      const rows = await sbBooks.getAll();
      const books = rows.map(fromRow);
      setCache(CACHE.books, books);
      return books;
    } catch {
      return getCache(CACHE.books);
    }
  },

  async add(book) {
    // 重复检测
    const all = await this.getAll();
    const dup = all.find(b =>
      b.title.trim().toLowerCase() === book.title.trim().toLowerCase() &&
      (b.author || '').trim().toLowerCase() === (book.author || '').trim().toLowerCase()
    );
    if (dup) return { duplicate: true, existing: dup };

    const entry = {
      id: Date.now(),
      title: book.title || '',
      author: book.author || '',
      isbn: book.isbn || '',
      publisher: book.publisher || '',
      year: book.year || '',
      category: book.category || '未分类',
      tags: book.tags || [],
      forReaders: book.forReaders || [],
      coverColor: book.coverColor || randomCoverColor(),
      status: 'available',
      synopsis: book.synopsis || '',
      addedAt: new Date().toISOString(),
    };
    const row = await sbBooks.add(entry);
    const saved = row ? fromRow(row) : entry;
    // 更新缓存
    const cached = getCache(CACHE.books);
    setCache(CACHE.books, [saved, ...cached]);
    return { duplicate: false, entry: saved };
  },

  async update(id, changes) {
    await sbBooks.update(id, changes);
    // 更新缓存
    const cached = getCache(CACHE.books);
    const idx = cached.findIndex(b => b.id === id);
    if (idx !== -1) { cached[idx] = { ...cached[idx], ...changes }; setCache(CACHE.books, cached); }
  },

  async remove(id) {
    await sbBooks.remove(id);
    setCache(CACHE.books, getCache(CACHE.books).filter(b => b.id !== id));
  },

  async search(query) {
    try {
      const rows = await sbBooks.search(query);
      return rows.map(fromRow);
    } catch {
      const q = query.toLowerCase();
      return getCache(CACHE.books).filter(b =>
        b.title.toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
  },

  // 同步方法（用本地缓存，供不需要await的地方快速读取）
  getAllCached() { return getCache(CACHE.books); },

  getStats() {
    const all = this.getAllCached();
    return {
      total: all.length,
      byCategory: groupBy(all, 'category'),
      forJiejie: all.filter(b => b.forReaders.includes('jiejie') || b.forReaders.includes('all')).length,
      forDidi:   all.filter(b => b.forReaders.includes('didi') || b.forReaders.includes('all')).length,
    };
  },

  getByCategory(cat) { return this.getAllCached().filter(b => b.category === cat); },
};

// ── 阅读记录 ──────────────────────────────────
export const logDB = {
  async getAll() {
    try {
      const rows = await sbLogs.getAll();
      const logs = rows.map(fromLogRow);
      setCache(CACHE.logs, logs);
      return logs;
    } catch {
      return getCache(CACHE.logs);
    }
  },

  async add(entry) {
    const log = {
      id: Date.now(),
      bookId:    entry.bookId,
      readerId:  entry.readerId,
      status:    entry.status || 'reading',
      startDate: entry.startDate || new Date().toISOString().split('T')[0],
      endDate:   entry.endDate || null,
      note:      entry.note || '',
      rating:    entry.rating || 0,
      createdAt: new Date().toISOString(),
    };
    const row = await sbLogs.add(log);
    const saved = row ? fromLogRow(row) : log;
    // 同步更新书籍状态
    if (entry.status === 'finished') await booksDB.update(entry.bookId, { status: 'read' });
    else if (entry.status === 'reading') await booksDB.update(entry.bookId, { status: 'reading' });
    // 更新日志缓存
    const cached = getCache(CACHE.logs);
    setCache(CACHE.logs, [saved, ...cached]);
    return saved;
  },

  async getByReader(readerId) {
    try {
      const rows = await sbLogs.getByReader(readerId);
      return rows.map(fromLogRow);
    } catch {
      return getCache(CACHE.logs).filter(l => l.readerId === readerId);
    }
  },

  async getByBook(bookId) {
    try {
      const rows = await sbLogs.getByBook(bookId);
      return rows.map(fromLogRow);
    } catch {
      return getCache(CACHE.logs).filter(l => l.bookId === bookId);
    }
  },

  async getFinished(readerId) {
    try {
      const rows = await sbLogs.getFinished(readerId);
      return rows.map(fromLogRow);
    } catch {
      return getCache(CACHE.logs).filter(l => l.readerId === readerId && l.status === 'finished');
    }
  },

  // 同步方法（用缓存）
  getAllCached() { return getCache(CACHE.logs); },

  getReaderStatsCached(readerId) {
    const logs = getCache(CACHE.logs).filter(l => l.readerId === readerId);
    const finished = logs.filter(l => l.status === 'finished');
    const reading  = logs.filter(l => l.status === 'reading');
    const avgRating = finished.length
      ? (finished.reduce((s, l) => s + (l.rating || 0), 0) / finished.length).toFixed(1) : 0;
    return { total: logs.length, finished: finished.length, reading: reading.length, avgRating };
  },
};

// ── 读者档案（本地固定，不存云端）──────────────
export const readersDB = {
  getAll() { return DEFAULT_READERS; },
  get(id)  { return DEFAULT_READERS.find(r => r.id === id); },
};

// ── 馆长设置（本地）──────────────────────────
export const librarianDB = {
  get() {
    try {
      return JSON.parse(localStorage.getItem('lib_librarian')) || { name: '图图馆长', lastVisit: null };
    } catch { return { name: '图图馆长', lastVisit: null }; }
  },
  updateLastVisit() {
    const d = this.get();
    d.lastVisit = new Date().toISOString();
    localStorage.setItem('lib_librarian', JSON.stringify(d));
  },
};

// ── CSV 导出（用于飞书多维表格）────────────────
export function exportBooksCSV() {
  const books = booksDB.getAllCached();
  const headers = ['书名', '作者', 'ISBN', '出版社', '出版年份', '分类', '标签', '适合谁读', '状态', '简介', '录入时间'];
  const statusMap = { available: '在架', reading: '阅读中', read: '已读完' };
  const readerMap = { jiejie: '姐姐', didi: '弟弟', all: '全家' };
  const rows = books.map(b => [
    b.title, b.author || '', b.isbn || '', b.publisher || '', b.year || '',
    b.category || '',
    (b.tags || []).join('、'),
    (b.forReaders || []).map(r => readerMap[r] || r).join('、'),
    statusMap[b.status] || b.status,
    b.synopsis || '',
    b.addedAt ? b.addedAt.split('T')[0] : '',
  ]);
  return toCsvString([headers, ...rows]);
}

export function exportLogsCSV() {
  const logs = logDB.getAllCached();
  const books = booksDB.getAllCached();
  const readerMap = { jiejie: '姐姐', didi: '弟弟' };
  const statusMap = { reading: '阅读中', finished: '已读完', 'gave-up': '暂时放下' };
  const headers = ['书名', '读者', '状态', '开始日期', '完成日期', '评分', '读后感', '记录时间'];
  const rows = logs.map(l => {
    const book = books.find(b => b.id === l.bookId);
    return [
      book ? book.title : `(书籍ID:${l.bookId})`,
      readerMap[l.readerId] || l.readerId,
      statusMap[l.status] || l.status,
      l.startDate || '', l.endDate || '',
      l.rating ? `${l.rating}星` : '',
      l.note || '',
      l.createdAt ? l.createdAt.split('T')[0] : '',
    ];
  });
  return toCsvString([headers, ...rows]);
}

function toCsvString(rows) {
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n'))
        return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',')
  ).join('\n');
}

// ── NFC 链接 ──────────────────────────────────
export function parseNFCFromURL() {
  const hash = window.location.hash;
  if (!hash.startsWith('#nfc')) return null;
  const params = new URLSearchParams(hash.slice(5));
  const bookId = Number(params.get('bookId'));
  if (!bookId) return null;
  const book = booksDB.getAllCached().find(b => b.id === bookId);
  return book ? { bookId, book } : null;
}

export function generateNFCUrl(bookId, baseUrl) {
  const base = baseUrl || window.location.href.split('#')[0];
  return `${base}#nfc?bookId=${bookId}`;
}

// ── 完整备份导出（JSON）─────────────────────────
export function exportData() {
  return {
    books:     booksDB.getAllCached(),
    logs:      logDB.getAllCached(),
    readers:   readersDB.getAll(),
    exportedAt: new Date().toISOString(),
  };
}

// ── 推荐引擎 ──────────────────────────────────
export function generateRecommendations(readerId) {
  const reader = readersDB.get(readerId);
  if (!reader) return [];
  const allBooks = booksDB.getAllCached();
  const allLogs = logDB.getAllCached();
  const finishedIds = new Set(allLogs.filter(l => l.readerId === readerId && l.status === 'finished').map(l => l.bookId));
  const readingIds  = new Set(allLogs.filter(l => l.readerId === readerId && l.status === 'reading').map(l => l.bookId));
  return allBooks
    .filter(b => !finishedIds.has(b.id) && !readingIds.has(b.id))
    .map(b => {
      const matchScore = (b.tags || []).filter(t =>
        reader.interests.some(i => t.includes(i) || i.includes(t))
      ).length + (b.forReaders.includes(readerId) ? 2 : 0) + (b.forReaders.includes('all') ? 1 : 0);
      return { ...b, matchScore };
    })
    .filter(b => b.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);
}

// ── 工具函数 ──────────────────────────────────
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || '未分类';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function randomCoverColor() {
  const colors = ['#C8866A','#7DB5A0','#D4A853','#8B6F9E','#6B8FAB','#C17B5A','#5F8C6F','#A85A5A','#7A8F6B','#8B7355'];
  return colors[Math.floor(Math.random() * colors.length)];
}
