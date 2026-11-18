const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
const guest = { name: '未登录', emoji: '😀' }
Page({
  data: { user: guest, isLoggedIn: false, loggingOut: false },
  onShow() {
    const user = auth.getUser()
    this.setData({ user: user || guest, isLoggedIn: !!user, loggingOut: false })
  },
  goLogin() { wx.navigateTo({ url: '/pages/login/login' }) },
  switchUser() {
    if (!auth.isLoggedIn() || this.data.loggingOut) return
    this.goLogin()
  },
  logout() {
    if (!auth.isLoggedIn() || this.data.loggingOut) return
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能管理菜品和聊天，确认退出吗？',
      confirmText: '退出',
      confirmColor: '#FF6B35',
      success: async res => {
        if (!res.confirm || !auth.isLoggedIn()) return
        this.setData({ loggingOut: true })
        try {
          await auth.logout()
          this.setData({ user: guest, isLoggedIn: false })
          wx.showToast({ title: '已退出登录', icon: 'success' })
          wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/profile' }) })
        } catch (error) { api.showError(error) }
        finally { this.setData({ loggingOut: false }) }
      }
    })
  }
})
