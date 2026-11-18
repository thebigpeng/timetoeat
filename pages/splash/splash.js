const TAB_PAGES = ['/pages/index/index', '/pages/messages/messages', '/pages/profile/profile']

Page({
  onLoad(options) {
    let target = '/pages/index/index'
    if (options && options.target) {
      try { target = decodeURIComponent(options.target) } catch (error) { target = options.target }
    }
    this.targetUrl = target.indexOf('/pages/splash/splash') === 0 ? '/pages/index/index' : target
    this.timer = setTimeout(() => this.openTarget(), 1000)
  },
  openTarget() {
    const url = this.targetUrl || '/pages/index/index'
    const path = url.split('?')[0]
    if (TAB_PAGES.includes(path) && url === path) {
      wx.switchTab({ url, fail: () => wx.reLaunch({ url }) })
      return
    }
    wx.reLaunch({ url, fail: () => wx.reLaunch({ url: '/pages/index/index' }) })
  },
  onUnload() { clearTimeout(this.timer) }
})
