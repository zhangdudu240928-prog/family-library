const { booksDB, logDB, readersDB, today } = require('../../utils/db');

const STATUS_OPTIONS = [
  { key: 'reading',   label: '📖 阅读中' },
  { key: 'finished',  label: '✅ 已读完' },
  { key: 'gave-up',   label: '⏸ 暂时放下' },
];
const RATING_OPTIONS = [
  { key: 0, label: '无评分' },
  { key: 1, label: '★ 一般' },
  { key: 2, label: '★★ 还好' },
  { key: 3, label: '★★★ 不错' },
  { key: 4, label: '★★★★ 很好看' },
  { key: 5, label: '★★★★★ 太喜欢了！' },
];

const LOG_STATUS_MAP = {
  reading:   '📖 阅读中',
  finished:  '✅ 已读完',
  'gave-up': '⏸ 暂停了',
};

function starsText(n) {
  const r = Math.round(n || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function emptyForm(bookId) {
  const readers = readersDB.getAll();
  const books   = booksDB.getAllCached();
  const bookIdx = bookId ? books.findIndex(b => String(b.id) === String(bookId)) : -1;
  return {
    bookIndex:   bookIdx >= 0 ? bookIdx : (books.length > 0 ? 0 : -1),
    readerIndex: 0,
    statusIndex: 0,
    ratingIndex: 0,
    startDate:   today(),
    endDate:     '',
    note:        '',
  };
}

Page({
  data: {
    logs: [],
    showAddModal: false,
    form: {},
    bookOptions: [],
    readerOptions: [],
    statusOptions: STATUS_OPTIONS,
    ratingOptions: RATING_OPTIONS,
    saving: false,
  },

  onLoad(options) {
    this.refresh();
    if (options.openAdd) {
      this.openAddLog(options.bookId);
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(2);
    }
    this.refresh();
  },

  refresh() {
    const logs   = logDB.getAllCached();
    const books  = booksDB.getAllCached();
    const enriched = logs.map(l => {
      const book   = books.find(b => b.id === l.bookId);
      const reader = readersDB.get(l.readerId);
      return {
        ...l,
        bookTitle:    book ? book.title : '未知书籍',
        readerName:   reader ? reader.name : l.readerId,
        readerAvatar: reader ? reader.avatar : '👤',
        readerColor:  reader ? reader.color : '#999',
        statusText:   LOG_STATUS_MAP[l.status] || l.status,
        starsText:    starsText(l.rating),
      };
    });
    this.setData({ logs: enriched });
  },

  openAddLog(bookId) {
    const books   = booksDB.getAllCached();
    const readers = readersDB.getAll();
    this.setData({
      showAddModal: true,
      bookOptions:   books,
      readerOptions: readers,
      form: emptyForm(bookId),
    });
  },

  closeModal() {
    this.setData({ showAddModal: false });
  },

  onBookChange(e) {
    this.setData({ form: { ...this.data.form, bookIndex: Number(e.detail.value) } });
  },
  onReaderChange(e) {
    this.setData({ form: { ...this.data.form, readerIndex: Number(e.detail.value) } });
  },
  onStatusChange(e) {
    this.setData({ form: { ...this.data.form, statusIndex: Number(e.detail.value) } });
  },
  onRatingChange(e) {
    this.setData({ form: { ...this.data.form, ratingIndex: Number(e.detail.value) } });
  },
  onStartChange(e) {
    this.setData({ form: { ...this.data.form, startDate: e.detail.value } });
  },
  onEndChange(e) {
    this.setData({ form: { ...this.data.form, endDate: e.detail.value } });
  },
  onNoteInput(e) {
    this.setData({ form: { ...this.data.form, note: e.detail.value } });
  },

  async saveLog() {
    if (this.data.saving) return;
    const { form, bookOptions, readerOptions, statusOptions, ratingOptions } = this.data;
    if (form.bookIndex < 0 || !bookOptions[form.bookIndex]) {
      wx.showToast({ title: '请选择书籍', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const book   = bookOptions[form.bookIndex];
      const reader = readerOptions[form.readerIndex];
      const status = statusOptions[form.statusIndex].key;
      await logDB.add({
        bookId:    book.id,
        readerId:  reader.id,
        status,
        startDate: form.startDate,
        endDate:   form.endDate || null,
        note:      form.note,
        rating:    ratingOptions[form.ratingIndex].key,
      });
      wx.showToast({ title: '记录已保存 ✓', icon: 'success' });
      this.setData({ showAddModal: false });
      this.refresh();
    } catch (e) {
      wx.showToast({ title: '保存失败，检查网络', icon: 'none' });
      console.error(e);
    }
    this.setData({ saving: false });
  },
});
