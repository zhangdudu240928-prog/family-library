/**
 * 家庭图书馆小程序 · Supabase 数据层
 * 用 wx.request 替代 fetch，适配微信小程序环境
 */

const SUPABASE_URL = 'https://usvfteeznjfkvbnqjxlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmZ0ZWV6bmpma3ZibnFqeGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDY4ODUsImV4cCI6MjA5MzcyMjg4NX0.WMkERz3GKrLRDPR5PR0Gy6R8GaDWDvemt6w6k3AuYvU';

const BASE_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// 封装 wx.request 为 Promise
function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${path}`,
      method: options.method || 'GET',
      header: { ...BASE_HEADERS, ...(options.header || {}) },
      data: options.data || undefined,
      timeout: 15000, // 15 秒超时
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || []);
        } else {
          reject(new Error(`Supabase ${res.statusCode}: ${JSON.stringify(res.data)}`));
        }
      },
      fail(err) {
        // errMsg 包含 'timeout' 时是超时，包含 'fail' 时是网络不通
        const msg = (err && err.errMsg) || JSON.stringify(err);
        if (msg.includes('timeout')) {
          reject(new Error('网络超时：请检查「不校验合法域名」是否已开启，或网络是否正常'));
        } else {
          reject(new Error(`网络错误：${msg}`));
        }
      },
    });
  });
}

// ── 书籍表 ────────────────────────────────────
const sbBooks = {
  getAll() {
    return req('books?order=added_at.desc');
  },

  add(book) {
    return req('books', {
      method: 'POST',
      data: toRow(book),
    }).then(rows => Array.isArray(rows) ? rows[0] : rows);
  },

  update(id, changes) {
    return req(`books?id=eq.${id}`, {
      method: 'PATCH',
      data: toRow(changes),
    }).then(rows => Array.isArray(rows) ? rows[0] : rows);
  },

  remove(id) {
    return req(`books?id=eq.${id}`, { method: 'DELETE' });
  },

  search(query) {
    const q = encodeURIComponent(query);
    return req(`books?or=(title.ilike.*${q}*,author.ilike.*${q}*)&order=added_at.desc`);
  },
};

// ── 阅读记录表 ────────────────────────────────
const sbLogs = {
  getAll() {
    return req('reading_logs?order=created_at.desc');
  },

  add(log) {
    return req('reading_logs', {
      method: 'POST',
      data: toLogRow(log),
    }).then(rows => Array.isArray(rows) ? rows[0] : rows);
  },

  getByReader(readerId) {
    return req(`reading_logs?reader_id=eq.${readerId}&order=created_at.desc`);
  },

  getByBook(bookId) {
    return req(`reading_logs?book_id=eq.${bookId}&order=created_at.desc`);
  },

  getFinished(readerId) {
    return req(`reading_logs?reader_id=eq.${readerId}&status=eq.finished&order=created_at.desc`);
  },
};

// ── 数据转换：前端格式 → 数据库行 ─────────────
function toRow(book) {
  const row = {};
  if (book.id !== undefined)         row.id          = book.id;
  if (book.title !== undefined)      row.title       = book.title;
  if (book.author !== undefined)     row.author      = book.author || null;
  if (book.isbn !== undefined)       row.isbn        = book.isbn || null;
  if (book.publisher !== undefined)  row.publisher   = book.publisher || null;
  if (book.year !== undefined)       row.year        = book.year || null;
  if (book.category !== undefined)   row.category    = book.category || '未分类';
  if (book.tags !== undefined)       row.tags        = book.tags || [];
  if (book.forReaders !== undefined) row.for_readers = book.forReaders || [];
  if (book.coverColor !== undefined) row.cover_color = book.coverColor;
  if (book.status !== undefined)     row.status      = book.status;
  if (book.synopsis !== undefined)   row.synopsis    = book.synopsis || null;
  if (book.addedAt !== undefined)    row.added_at    = book.addedAt;
  return row;
}

function toLogRow(log) {
  const row = {};
  if (log.id !== undefined)        row.id         = log.id;
  if (log.bookId !== undefined)    row.book_id    = log.bookId;
  if (log.readerId !== undefined)  row.reader_id  = log.readerId;
  if (log.status !== undefined)    row.status     = log.status;
  if (log.startDate !== undefined) row.start_date = log.startDate || null;
  if (log.endDate !== undefined)   row.end_date   = log.endDate || null;
  if (log.note !== undefined)      row.note       = log.note || null;
  if (log.rating !== undefined)    row.rating     = log.rating || 0;
  if (log.createdAt !== undefined) row.created_at = log.createdAt;
  return row;
}

// ── 数据转换：数据库行 → 前端格式 ─────────────
function fromRow(row) {
  return {
    id:         row.id,
    title:      row.title,
    author:     row.author || '',
    isbn:       row.isbn || '',
    publisher:  row.publisher || '',
    year:       row.year || '',
    category:   row.category || '未分类',
    tags:       row.tags || [],
    forReaders: row.for_readers || [],
    coverColor: row.cover_color || '#8B6F47',
    status:     row.status || 'available',
    synopsis:   row.synopsis || '',
    addedAt:    row.added_at,
  };
}

function fromLogRow(row) {
  return {
    id:        row.id,
    bookId:    row.book_id,
    readerId:  row.reader_id,
    status:    row.status,
    startDate: row.start_date || '',
    endDate:   row.end_date || null,
    note:      row.note || '',
    rating:    row.rating || 0,
    createdAt: row.created_at,
  };
}

module.exports = { sbBooks, sbLogs, fromRow, fromLogRow };
