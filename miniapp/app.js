// app.js
const { booksDB, logDB } = require('./utils/db');

App({
  globalData: {
    loaded: false,
  },

  onLaunch() {
    // 启动时预加载云端数据，更新缓存
    this.loadCloudData();
  },

  async loadCloudData() {
    try {
      await Promise.all([booksDB.getAll(), logDB.getAll()]);
      this.globalData.loaded = true;
      // 通知所有页面数据已就绪
      if (this.dataReadyCallback) this.dataReadyCallback();
    } catch (e) {
      console.warn('Cloud load error:', e);
      this.globalData.loaded = true;
    }
  },
});
