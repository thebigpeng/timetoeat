// app.js
App({
  onShow(options) {
    const path = options && options.path
    if (!path || path === 'pages/splash/splash') return
    const query = options.query || {}
    const queryString = Object.keys(query)
      .filter(key => query[key] !== undefined && query[key] !== null)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(query[key]))
      .join('&')
    const target = '/' + path + (queryString ? '?' + queryString : '')
    wx.reLaunch({ url: '/pages/splash/splash?target=' + encodeURIComponent(target) })
  },
  globalData: {
    menuCategory: '',
    menuKeyword: ''
  }
})
