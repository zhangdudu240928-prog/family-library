/**
 * 家庭图书馆小程序 · 数据管理层
 * 主存储：Supabase（云端）
 * 离线缓存：wx.Storage（替代 localStorage）
 */

const { sbBooks, sbLogs, fromRow, fromLogRow } = require('./supabase');

// ── 默认读者档案 ──────────────────────────────
const DEFAULT_READERS = [
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
const CACHE_KEY_BOOKS = 'lib_cache_books';
const CACHE_KEY_LOGS  = 'lib_cache_logs';

function getCache(key) {
  try {
    return wx.getStorageSync(key) || [];
  } catch (e) {
    return [];
  }
}

function setCache(key, val) {
  try {
    wx.setStorageSync(key, val);
  } catch (e) {}
}

// ── 工具函数 ──────────────────────────────────
function randomCoverColor() {
  const colors = ['#C8866A', '#7DB5A0', '#D4A853', '#8B6F9E', '#6B8FAB', '#C17B5A', '#5F8C6F', '#A85A5A', '#7A8F6B', '#8B7355'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || '未分类';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── 图书 ──────────────────────────────────────
const booksDB = {
  async getAll() {
    try {
      const rows = await sbBooks.getAll();
      const books = rows.map(fromRow);
      setCache(CACHE_KEY_BOOKS, books);
      return books;
    } catch (e) {
      return getCache(CACHE_KEY_BOOKS);
    }
  },

  async add(book) {
    const all = await this.getAll();
    const dup = all.find(b =>
      b.title.trim().toLowerCase() === (book.title || '').trim().toLowerCase() &&
      (b.author || '').trim().toLowerCase() === (book.author || '').trim().toLowerCase()
    );
    if (dup) return { duplicate: true, existing: dup };

    const entry = {
      id:         Date.now(),
      title:      book.title || '',
      author:     book.author || '',
      isbn:       book.isbn || '',
      publisher:  book.publisher || '',
      year:       book.year || '',
      category:   book.category || '未分类',
      tags:       book.tags || [],
      forReaders: book.forReaders || [],
      coverColor: book.coverColor || randomCoverColor(),
      status:     'available',
      synopsis:   book.synopsis || '',
      addedAt:    new Date().toISOString(),
    };
    const row = await sbBooks.add(entry);
    const saved = row ? fromRow(row) : entry;
    const cached = getCache(CACHE_KEY_BOOKS);
    setCache(CACHE_KEY_BOOKS, [saved, ...cached]);
    return { duplicate: false, entry: saved };
  },

  async update(id, changes) {
    await sbBooks.update(id, changes);
    const cached = getCache(CACHE_KEY_BOOKS);
    const idx = cached.findIndex(b => b.id === id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...changes };
      setCache(CACHE_KEY_BOOKS, cached);
    }
  },

  async remove(id) {
    await sbBooks.remove(id);
    setCache(CACHE_KEY_BOOKS, getCache(CACHE_KEY_BOOKS).filter(b => b.id !== id));
  },

  async search(query) {
    try {
      const rows = await sbBooks.search(query);
      return rows.map(fromRow);
    } catch (e) {
      const q = query.toLowerCase();
      return getCache(CACHE_KEY_BOOKS).filter(b =>
        b.title.toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
  },

  getAllCached() { return getCache(CACHE_KEY_BOOKS); },

  getStats() {
    const all = this.getAllCached();
    return {
      total:      all.length,
      byCategory: groupBy(all, 'category'),
      forJiejie:  all.filter(b => b.forReaders.includes('jiejie') || b.forReaders.includes('all')).length,
      forDidi:    all.filter(b => b.forReaders.includes('didi') || b.forReaders.includes('all')).length,
    };
  },

  getByCategory(cat) { return this.getAllCached().filter(b => b.category === cat); },
};

// ── 阅读记录 ──────────────────────────────────
const logDB = {
  async getAll() {
    try {
      const rows = await sbLogs.getAll();
      const logs = rows.map(fromLogRow);
      setCache(CACHE_KEY_LOGS, logs);
      return logs;
    } catch (e) {
      return getCache(CACHE_KEY_LOGS);
    }
  },

  async add(entry) {
    const log = {
      id:        Date.now(),
      bookId:    entry.bookId,
      readerId:  entry.readerId,
      status:    entry.status || 'reading',
      startDate: entry.startDate || today(),
      endDate:   entry.endDate || null,
      note:      entry.note || '',
      rating:    entry.rating || 0,
      createdAt: new Date().toISOString(),
    };
    const row = await sbLogs.add(log);
    const saved = row ? fromLogRow(row) : log;
    if (entry.status === 'finished') await booksDB.update(entry.bookId, { status: 'read' });
    else if (entry.status === 'reading') await booksDB.update(entry.bookId, { status: 'reading' });
    const cached = getCache(CACHE_KEY_LOGS);
    setCache(CACHE_KEY_LOGS, [saved, ...cached]);
    return saved;
  },

  getAllCached() { return getCache(CACHE_KEY_LOGS); },

  getReaderStatsCached(readerId) {
    const logs     = getCache(CACHE_KEY_LOGS).filter(l => l.readerId === readerId);
    const finished = logs.filter(l => l.status === 'finished');
    const reading  = logs.filter(l => l.status === 'reading');
    const avgRating = finished.length
      ? (finished.reduce((s, l) => s + (l.rating || 0), 0) / finished.length).toFixed(1)
      : 0;
    return { total: logs.length, finished: finished.length, reading: reading.length, avgRating };
  },
};

// ── 读者档案 ──────────────────────────────────
const readersDB = {
  getAll() { return DEFAULT_READERS; },
  get(id)  { return DEFAULT_READERS.find(r => r.id === id); },
};

// ── 推荐引擎 ──────────────────────────────────
function generateRecommendations(readerId) {
  const reader = readersDB.get(readerId);
  if (!reader) return [];
  const allBooks = booksDB.getAllCached();
  const allLogs  = logDB.getAllCached();
  const finishedIds = new Set(allLogs.filter(l => l.readerId === readerId && l.status === 'finished').map(l => l.bookId));
  const readingIds  = new Set(allLogs.filter(l => l.readerId === readerId && l.status === 'reading').map(l => l.bookId));
  return allBooks
    .filter(b => !finishedIds.has(b.id) && !readingIds.has(b.id))
    .map(b => {
      const matchScore =
        (b.tags || []).filter(t => reader.interests.some(i => t.includes(i) || i.includes(t))).length +
        (b.forReaders.includes(readerId) ? 2 : 0) +
        (b.forReaders.includes('all') ? 1 : 0);
      return { ...b, matchScore };
    })
    .filter(b => b.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);
}

module.exports = { booksDB, logDB, readersDB, generateRecommendations, DEFAULT_READERS, today };
