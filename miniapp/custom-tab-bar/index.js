Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/dashboard/dashboard', text: '书房',  icon: '🏡' },
      { pagePath: 'pages/books/books',         text: '藏书阁', icon: '📚' },
      { pagePath: 'pages/logs/logs',           text: '阅读',  icon: '📖' },
      { pagePath: 'pages/settings/settings',   text: '设置',  icon: '⚙️' },
    ],
  },

  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      wx.switchTab({ url: `/${path}` });
      this.setData({ selected: index });
    },

    // 供各页面调用，更新当前选中项
    setSelected(index) {
      this.setData({ selected: index });
    },
  },
});
