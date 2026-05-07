/**
 * 家庭图书馆 · Supabase 数据层
 * 封装所有与 Supabase REST API 的交互
 */

const SUPABASE_URL = 'https://usvfteeznjfkvbnqjxlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmZ0ZWV6bmpma3ZibnFqeGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDY4ODUsImV4cCI6MjA5MzcyMjg4NX0.WMkERz3GKrLRDPR5PR0Gy6R8GaDWDvemt6w6k3AuYvU';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function req(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ── 书籍表 ────────────────────────────────────
export const sbBooks = {
  async getAll() {
    return req('books?order=added_at.desc');
  },

  async add(book) {
    const rows = await req('books', {
      method: 'POST',
      body: JSON.stringify(toRow(book)),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  async update(id, changes) {
    const rows = await req(`books?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(toRow(changes)),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  async remove(id) {
    return req(`books?id=eq.${id}`, { method: 'DELETE' });
  },

  async search(query) {
    // 用 ilike 模糊匹配书名和作者
    return req(`books?or=(title.ilike.*${encodeURIComponent(query)}*,author.ilike.*${encodeURIComponent(query)}*)&order=added_at.desc`);
  },
};

// ── 阅读记录表 ────────────────────────────────
export const sbLogs = {
  async getAll() {
    return req('reading_logs?order=created_at.desc');
  },

  async add(log) {
    const rows = await req('reading_logs', {
      method: 'POST',
      body: JSON.stringify(toLogRow(log)),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  async getByReader(readerId) {
    return req(`reading_logs?reader_id=eq.${readerId}&order=created_at.desc`);
  },

  async getByBook(bookId) {
    return req(`reading_logs?book_id=eq.${bookId}&order=created_at.desc`);
  },

  async getFinished(readerId) {
    return req(`reading_logs?reader_id=eq.${readerId}&status=eq.finished&order=created_at.desc`);
  },
};

// ── 数据转换：前端格式 → 数据库行 ─────────────
function toRow(book) {
  const row = {};
  if (book.id !== undefined)        row.id           = book.id;
  if (book.title !== undefined)     row.title        = book.title;
  if (book.author !== undefined)    row.author       = book.author || null;
  if (book.isbn !== undefined)      row.isbn         = book.isbn || null;
  if (book.publisher !== undefined) row.publisher    = book.publisher || null;
  if (book.year !== undefined)      row.year         = book.year || null;
  if (book.category !== undefined)  row.category     = book.category || '未分类';
  if (book.tags !== undefined)      row.tags         = book.tags || [];
  if (book.forReaders !== undefined) row.for_readers = book.forReaders || [];
  if (book.coverColor !== undefined) row.cover_color = book.coverColor;
  if (book.status !== undefined)    row.status       = book.status;
  if (book.synopsis !== undefined)  row.synopsis     = book.synopsis || null;
  if (book.addedAt !== undefined)   row.added_at     = book.addedAt;
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
export function fromRow(row) {
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

export function fromLogRow(row) {
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
