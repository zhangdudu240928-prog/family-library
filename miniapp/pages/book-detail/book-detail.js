const { booksDB, logDB, readersDB } = require('../../utils/db');

const CATEGORIES = ['绘本', '科普', '文学故事', '历史文化', '自然博物', '工程科技', '艺术', '其他'];

const STATUS_TEXT = {
  available: '在架',
  reading:   '阅读中',
  read:      '已读完',
};

const STATUS_MAP = {
  reading:   '📖 阅读中',
  finished:  '✅ 已读完',
  'gave-up': '⏸ 暂停了',
};

function starsText(n) {
  const r = Math.round(n || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function emptyForm() {
  return {
    title: '', author: '', isbn: '', publisher: '',
    year: '', category: '绘本', synopsis: '', tags: [], forReaders: [],
  };
}

Page({
  data: {
    mode: 'detail', // 'detail' | 'edit'
    isNew: false,
    book: null,
    bookLogs: [],
    statusText: '',
    readerInfo: {},
    form: emptyForm(),
    categories: CATEGORIES,
    categoryIndex: 0,
    readerOptions: [],
    tagInput: '',
    saving: false,
  },

  onLoad(options) {
    // 构建 readerInfo 字典 & readerOptions
    const readers = readersDB.getAll();
    const readerInfo = {};
    readers.forEach(r => { readerInfo[r.id] = r; });
    readerInfo['all'] = { id: 'all', name: '全家', avatar: '👨‍👩‍👧‍👦' };

    this.setData({ readerInfo, readerOptions: readers });

    if (options.id) {
      const book = booksDB.getAllCached().find(b => String(b.id) === String(options.id));
      if (book) {
        const logs = logDB.getAllCached().filter(l => l.bookId === book.id);
        this.setData({
          mode: 'detail',
          isNew: false,
          book,
          statusText: STATUS_TEXT[book.status] || '在架',
          bookLogs: logs.map(l => {
            const reader = readersDB.get(l.readerId);
            return {
              ...l,
              readerName:   reader ? reader.name : l.readerId,
              readerAvatar: reader ? reader.avatar : '👤',
              readerColor:  reader ? reader.color : '#999',
              statusText:   STATUS_MAP[l.status] || l.status,
              starsText:    starsText(l.rating),
            };
          }),
        });
        wx.setNavigationBarTitle({ title: book.title });
        return;
      }
    }
    // 无 id → 新书录入模式
    this.setData({ mode: 'edit', isNew: true, form: emptyForm() });
    wx.setNavigationBarTitle({ title: '录入新书' });
  },

  switchToEdit() {
    const { book } = this.data;
    const catIdx = CATEGORIES.indexOf(book.category);
    this.setData({
      mode: 'edit',
      form: {
        title:      book.title,
        author:     book.author,
        isbn:       book.isbn,
        publisher:  book.publisher,
        year:       book.year,
        category:   book.category,
        synopsis:   book.synopsis,
        tags:       [...(book.tags || [])],
        forReaders: [...(book.forReaders || [])],
      },
      categoryIndex: catIdx >= 0 ? catIdx : 0,
    });
    wx.setNavigationBarTitle({ title: '编辑书籍' });
  },

  cancelEdit() {
    this.setData({ mode: 'detail' });
    wx.setNavigationBarTitle({ title: this.data.book.title });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const form = { ...this.data.form, [field]: e.detail.value };
    this.setData({ form });
  },

  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    const form = { ...this.data.form, category: CATEGORIES[idx] };
    this.setData({ form, categoryIndex: idx });
  },

  onTagInput(e) {
    this.setData({ tagInput: e.detail.value });
  },

  addTag() {
    const tag = this.data.tagInput.trim();
    if (!tag) return;
    const tags = this.data.form.tags;
    if (tags.includes(tag)) { wx.showToast({ title: '标签已存在', icon: 'none' }); return; }
    this.setData({ form: { ...this.data.form, tags: [...tags, tag] }, tagInput: '' });
  },

  removeTag(e) {
    const idx = e.currentTarget.dataset.index;
    const tags = [...this.data.form.tags];
    tags.splice(idx, 1);
    this.setData({ form: { ...this.data.form, tags } });
  },

  toggleReader(e) {
    const id = e.currentTarget.dataset.id;
    const forReaders = [...this.data.form.forReaders];
    const pos = forReaders.indexOf(id);
    if (pos >= 0) forReaders.splice(pos, 1);
    else forReaders.push(id);
    this.setData({ form: { ...this.data.form, forReaders } });
  },

  async saveBook() {
    if (this.data.saving) return;
    const { form, isNew } = this.data;
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写书名', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      if (isNew) {
        const result = await booksDB.add(form);
        if (result.duplicate) {
          wx.showModal({
            title: '重复录入提示',
            content: `家里已经有一本《${result.existing.title}》了哦，确认重复录入吗？`,
            confirmText: '确认录入',
            cancelText: '取消',
            success: async (res) => {
              if (res.confirm) {
                await booksDB.add({ ...form, _forceDuplicate: true });
                wx.showToast({ title: '已录入 ✓', icon: 'success' });
                wx.navigateBack();
              }
            },
          });
          this.setData({ saving: false });
          return;
        }
        wx.showToast({ title: `《${form.title}》已入库 ✓`, icon: 'success' });
        wx.navigateBack();
      } else {
        await booksDB.update(this.data.book.id, form);
        wx.showToast({ title: '已更新 ✓', icon: 'success' });
        const updatedBook = { ...this.data.book, ...form };
        this.setData({ mode: 'detail', book: updatedBook, statusText: STATUS_TEXT[updatedBook.status] || '在架' });
        wx.setNavigationBarTitle({ title: updatedBook.title });
      }
    } catch (e) {
      wx.showToast({ title: '保存失败，检查网络', icon: 'none' });
      console.error(e);
    }
    this.setData({ saving: false });
  },

  async deleteBook() {
    wx.showModal({
      title: '确认删除',
      content: '确认删除这本书？相关阅读记录不会删除。',
      confirmColor: '#C05050',
      success: async (res) => {
        if (res.confirm) {
          try {
            await booksDB.remove(this.data.book.id);
            wx.showToast({ title: '已删除', icon: 'none' });
            wx.navigateBack();
          } catch {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  goAddLog() {
    const bookId = this.data.book.id;
    wx.navigateTo({ url: `/pages/logs/logs?openAdd=1&bookId=${bookId}` });
  },
});
