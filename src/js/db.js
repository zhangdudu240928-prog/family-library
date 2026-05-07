/**
 * 家庭图书馆 · 数据管理层
 * localStorage 持久化
 */

const KEYS = {
  BOOKS: 'lib_books',
  READERS: 'lib_readers',
  READING_LOG: 'lib_reading_log',
  LIBRARIAN: 'lib_librarian',
};

// ── 默认读者档案 ──────────────────────────────
const DEFAULT_READERS = [
  {
    id: 'jiejie',
    name: '姐姐',
    age: 9,
    avatar: '🌿',
    color: '#7DB5A0',
    interests: ['历史', '文物', '植物', '动物', '冒险故事', '温情故事'],
    readCount: 0,
  },
  {
    id: 'didi',
    name: '弟弟',
    age: 6,
    avatar: '🚂',
    color: '#E8956D',
    interests: ['工程', '火车', '可爱故事', '温暖故事'],
    readCount: 0,
  },
];

// ── 通用读写 ──────────────────────────────────
function get(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; }
  catch { return def; }
}
function set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── 图书 ──────────────────────────────────────
export const booksDB = {
  getAll() { return get(KEYS.BOOKS, []); },
  save(list) { set(KEYS.BOOKS, list); },

  add(book) {
    const list = this.getAll();
    // 重复检测：同名同作者
    const dup = list.find(b =>
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
      forReaders: book.forReaders || [],    // ['jiejie', 'didi', 'all']
      coverColor: book.coverColor || randomCoverColor(),
      status: 'available',                   // available | reading | read
      synopsis: book.synopsis || '',
      addedAt: new Date().toISOString(),
    };
    list.unshift(entry);
    this.save(list);
    return { duplicate: false, entry };
  },

  update(id, changes) {
    const list = this.getAll();
    const idx = list.findIndex(b => b.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...changes }; this.save(list); }
  },

  remove(id) { this.save(this.getAll().filter(b => b.id !== id)); },

  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (b.category || '').toLowerCase().includes(q)
    );
  },

  getByCategory(cat) { return this.getAll().filter(b => b.category === cat); },
  getByReader(rid) { return this.getAll().filter(b => b.forReaders.includes(rid) || b.forReaders.includes('all')); },
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: groupBy(all, 'category'),
      forJiejie: all.filter(b => b.forReaders.includes('jiejie') || b.forReaders.includes('all')).length,
      forDidi: all.filter(b => b.forReaders.includes('didi') || b.forReaders.includes('all')).length,
    };
  }
};

// ── 读者 ──────────────────────────────────────
export const readersDB = {
  getAll() { return get(KEYS.READERS, DEFAULT_READERS); },
  save(list) { set(KEYS.READERS, list); },
  get(id) { return this.getAll().find(r => r.id === id); },
  update(id, changes) {
    const list = this.getAll();
    const idx = list.findIndex(r => r.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...changes }; this.save(list); }
  },
};

// ── 阅读记录 ──────────────────────────────────
export const logDB = {
  getAll() { return get(KEYS.READING_LOG, []); },
  save(list) { set(KEYS.READING_LOG, list); },

  add(entry) {
    const list = this.getAll();
    const log = {
      id: Date.now(),
      bookId: entry.bookId,
      readerId: entry.readerId,
      status: entry.status || 'reading',   // reading | finished | gave-up
      startDate: entry.startDate || new Date().toISOString().split('T')[0],
      endDate: entry.endDate || null,
      note: entry.note || '',
      rating: entry.rating || 0,           // 0-5颗星
      createdAt: new Date().toISOString(),
    };
    list.unshift(log);
    this.save(list);
    // 更新书籍状态
    if (entry.status === 'finished') booksDB.update(entry.bookId, { status: 'read' });
    else if (entry.status === 'reading') booksDB.update(entry.bookId, { status: 'reading' });
    return log;
  },

  getByReader(readerId) { return this.getAll().filter(l => l.readerId === readerId); },
  getByBook(bookId) { return this.getAll().filter(l => l.bookId === bookId); },
  getFinished(readerId) { return this.getAll().filter(l => l.readerId === readerId && l.status === 'finished'); },

  getReaderStats(readerId) {
    const logs = this.getByReader(readerId);
    const finished = logs.filter(l => l.status === 'finished');
    const reading = logs.filter(l => l.status === 'reading');
    const avgRating = finished.length
      ? (finished.reduce((s, l) => s + (l.rating || 0), 0) / finished.length).toFixed(1)
      : 0;
    return { total: logs.length, finished: finished.length, reading: reading.length, avgRating };
  }
};

// ── 馆长设置 ──────────────────────────────────
export const librarianDB = {
  get() {
    return get(KEYS.LIBRARIAN, {
      name: '图图馆长',
      greeting: '欢迎来到这间小书房～',
      lastVisit: null,
    });
  },
  save(data) { set(KEYS.LIBRARIAN, data); },
  updateLastVisit() {
    const d = this.get();
    d.lastVisit = new Date().toISOString();
    this.save(d);
  }
};

// ── 工具函数 ──────────────────────────────────
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || '未分类';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function randomCoverColor() {
  const colors = [
    '#C8866A','#7DB5A0','#D4A853','#8B6F9E','#6B8FAB',
    '#C17B5A','#5F8C6F','#A85A5A','#7A8F6B','#8B7355',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ── 备份/恢复 ─────────────────────────────────
export function exportData() {
  return {
    books: booksDB.getAll(),
    readers: readersDB.getAll(),
    logs: logDB.getAll(),
    librarian: librarianDB.get(),
    exportedAt: new Date().toISOString(),
  };
}
export function importData(data) {
  if (data.books) set(KEYS.BOOKS, data.books);
  if (data.readers) set(KEYS.READERS, data.readers);
  if (data.logs) set(KEYS.READING_LOG, data.logs);
  if (data.librarian) set(KEYS.LIBRARIAN, data.librarian);
}

// ── 馆长推荐引擎 ──────────────────────────────
export function generateRecommendations(readerId) {
  const reader = readersDB.get(readerId);
  if (!reader) return [];
  const allBooks = booksDB.getAll();
  const finishedIds = new Set(logDB.getFinished(readerId).map(l => l.bookId));
  const readingIds = new Set(logDB.getByReader(readerId).filter(l => l.status === 'reading').map(l => l.bookId));

  // 还没读过的书中，与兴趣标签匹配的
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
