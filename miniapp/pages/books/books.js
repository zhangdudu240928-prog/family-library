const { booksDB } = require('../../utils/db');

const FILTERS = [
  { key: 'all',      label: '全部' },
  { key: 'available', label: '在架' },
  { key: 'reading',  label: '阅读中' },
  { key: 'read',     label: '已读完' },
  { key: '绘本',     label: '绘本' },
  { key: '科普',     label: '科普' },
  { key: '自然博物', label: '自然博物' },
  { key: '历史文化', label: '历史文化' },
  { key: '工程科技', label: '工程科技' },
  { key: '文学故事', label: '文学故事' },
];

const STATUS_TEXT = {
  available: '在架',
  reading:   '阅读中',
  read:      '已读完',
};

Page({
  data: {
    filters: FILTERS,
    currentFilter: 'all',
    bookView: 'grid',
    searchQuery: '',
    displayBooks: [],
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(1);
    }
    this.refresh();
  },

  refresh() {
    this._applyFilter();
  },

  _applyFilter() {
    const { currentFilter, searchQuery } = this.data;
    let books = booksDB.getAllCached();

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      books = books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
    } else if (currentFilter !== 'all') {
      if (['available', 'reading', 'read'].includes(currentFilter)) {
        books = books.filter(b => b.status === currentFilter);
      } else {
        books = books.filter(b => b.category === currentFilter);
      }
    }

    this.setData({
      displayBooks: books.map(b => ({
        ...b,
        statusText: STATUS_TEXT[b.status] || b.status,
      })),
    });
  },

  setFilter(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentFilter: key });
    this._applyFilter();
  },

  setView(e) {
    this.setData({ bookView: e.currentTarget.dataset.view });
  },

  onSearchInput(e) {
    const q = e.detail.value;
    this.setData({ searchQuery: q });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._applyFilter(), 300);
  },

  clearSearch() {
    this.setData({ searchQuery: '' });
    this._applyFilter();
  },

  goAddBook() {
    wx.navigateTo({ url: '/pages/book-detail/book-detail' });
  },

  goBookDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/book-detail/book-detail?id=${id}` });
  },
});
