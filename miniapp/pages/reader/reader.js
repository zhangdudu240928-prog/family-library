const { booksDB, logDB, readersDB, generateRecommendations } = require('../../utils/db');

function starsText(n) {
  const r = Math.round(n || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

Page({
  data: {
    readerId: '',
    reader: {},
    stats: { finished: 0, reading: 0, avgRating: 0 },
    recommendations: [],
    finishedBooks: [],
  },

  onLoad(options) {
    const id = options.id || 'jiejie';
    const reader = readersDB.get(id);
    this.setData({ readerId: id, reader: reader || {} });
    wx.setNavigationBarTitle({ title: `${reader ? reader.name : ''}的书单` });
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const { readerId } = this.data;
    const stats = logDB.getReaderStatsCached(readerId);
    const recs  = generateRecommendations(readerId);
    const books = booksDB.getAllCached();
    const logs  = logDB.getAllCached().filter(l => l.readerId === readerId && l.status === 'finished');

    const finishedBooks = logs.map(l => {
      const book = books.find(b => b.id === l.bookId);
      if (!book) return null;
      return {
        logId:      l.id,
        bookId:     book.id,
        title:      book.title,
        author:     book.author,
        coverColor: book.coverColor,
        endDate:    l.endDate,
        note:       l.note,
        starsText:  starsText(l.rating),
      };
    }).filter(Boolean);

    this.setData({ stats, recommendations: recs, finishedBooks });
  },

  goBookDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/book-detail/book-detail?id=${id}` });
  },
});
