const tabs = [
  { key: 'home', pagePath: 'pages/index/index', text: '好友' },
  { key: 'chat', pagePath: 'pages/messages/messages', text: '消息' },
  { key: 'mine', pagePath: 'pages/profile/profile', text: '我的' }
]

Component({
  data: {
    tabs,
    selected: 0,
    remarkEditing: false
  },
  lifetimes: {
    attached() {
      this.refresh()
    }
  },
  pageLifetimes: {
    show() {
      this.refresh()
    }
  },
  methods: {
    refresh() {
      const pages = getCurrentPages()
      const route = pages.length ? pages[pages.length - 1].route || '' : ''
      const index = tabs.findIndex((tab) => tab.pagePath === route.replace(/^\//, ''))
      this.setData({ selected: index >= 0 ? index : 0 })
    },
    onTap(event) {
      const { path, index } = event.currentTarget.dataset
      if (!path) return
      this.setData({ selected: Number(index) })
      wx.switchTab({
        url: '/' + path,
        fail: () => {
          wx.reLaunch({ url: '/' + path })
        }
      })
    }
  }
})
