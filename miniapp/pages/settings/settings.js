const { booksDB, logDB } = require('../../utils/db');
const app = getApp();

Page({
  data: {
    syncing: false,
    stats: { total: 0, logsCount: 0, readCount: 0, forJiejie: 0, forDidi: 0 },
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(3);
    }
    this.refreshStats();
  },

  refreshStats() {
    const bStats = booksDB.getStats();
    const logs   = logDB.getAllCached();
    this.setData({
      stats: {
        total:      bStats.total,
        logsCount:  logs.length,
        readCount:  logs.filter(l => l.status === 'finished').length,
        forJiejie:  bStats.forJiejie,
        forDidi:    bStats.forDidi,
      },
    });
  },

  async syncNow() {
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    wx.showLoading({ title: '同步中…', mask: true });
    try {
      await app.loadCloudData();
      wx.hideLoading();
      wx.showToast({ title: '同步完成 ✓', icon: 'success' });
      this.refreshStats();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '同步失败，检查网络', icon: 'none' });
    }
    this.setData({ syncing: false });
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '清除本地缓存后，下次打开将从云端重新加载。确认吗？',
      confirmColor: '#C05050',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.removeStorageSync('lib_cache_books');
            wx.removeStorageSync('lib_cache_logs');
            wx.showToast({ title: '缓存已清除', icon: 'success' });
            await app.loadCloudData();
            this.refreshStats();
          } catch {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      },
    });
  },

  goReader(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/reader/reader?id=${id}` });
  },
});
