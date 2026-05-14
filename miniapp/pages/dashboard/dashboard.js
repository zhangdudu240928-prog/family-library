const { booksDB, logDB, readersDB } = require('../../utils/db');

const GREETINGS = [
  '书架上每一本书，都是孩子们的小宇宙入口。',
  '姐姐的书和弟弟的书都在等着被翻开，今晚要读哪一本呢？',
  '每一本书都是一扇窗，推开它，就是一个新世界。',
  '有新书要记录吗？把它们好好收进来吧～',
  '最好的睡前仪式，是一本好书陪伴的夜晚。',
];

const STATUS_MAP = {
  reading: '📖 阅读中',
  finished: '✅ 已读完',
  'gave-up': '⏸ 暂停了',
};

function starsText(n) {
  const r = Math.round(n || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

Page({
  data: {
    greetingText: '',
    stats: { total: 0, forJiejie: 0, forDidi: 0, readCount: 0 },
    jiejieStats: { finished: 0 },
    didiStats: { finished: 0 },
    recentBooks: [],
    recentLogs: [],
    fabOpen: false,
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(0);
    }
    this.refresh();
  },

  refresh() {
    const books = booksDB.getAllCached();
    const logs  = logDB.getAllCached();
    const stats = booksDB.getStats();

    this.setData({
      greetingText: GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
      stats: {
        total:      stats.total,
        forJiejie:  stats.forJiejie,
        forDidi:    stats.forDidi,
        readCount:  logs.filter(l => l.status === 'finished').length,
      },
      jiejieStats: logDB.getReaderStatsCached('jiejie'),
      didiStats:   logDB.getReaderStatsCached('didi'),
      recentBooks: books.slice(0, 8),
      recentLogs:  this._enrichLogs(logs.slice(0, 5)),
    });
  },

  _enrichLogs(logs) {
    const books   = booksDB.getAllCached();
    return logs.map(l => {
      const book   = books.find(b => b.id === l.bookId);
      const reader = readersDB.get(l.readerId);
      return {
        ...l,
        bookTitle:   book ? book.title : '未知书籍',
        readerName:  reader ? reader.name : l.readerId,
        readerAvatar: reader ? reader.avatar : '👤',
        readerColor:  reader ? reader.color : '#999',
        statusText:  STATUS_MAP[l.status] || l.status,
        starsText:   starsText(l.rating),
      };
    });
  },

  goBooks() {
    wx.switchTab({ url: '/pages/books/books' });
  },

  goLogs() {
    wx.switchTab({ url: '/pages/logs/logs' });
  },

  goReader(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/reader/reader?id=${id}` });
  },

  goBookDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/book-detail/book-detail?id=${id}` });
  },

  toggleFab() {
    this.setData({ fabOpen: !this.data.fabOpen });
  },

  closeFab() {
    this.setData({ fabOpen: false });
  },

  goAddBook() {
    this.setData({ fabOpen: false });
    wx.navigateTo({ url: '/pages/book-detail/book-detail' });
  },

  goAddLog() {
    this.setData({ fabOpen: false });
    wx.navigateTo({ url: '/pages/logs/logs?openAdd=1' });
  },
});
