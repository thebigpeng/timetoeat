const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
Page({
  data: { user: null, logging: false, testLogin: config.testLogin, account: 'tester-001', nickName: '测试用户' },
  onLoad() {
    this.setData({ user: auth.getUser(), account: wx.getStorageSync(config.storage.testAccount) || 'tester-001' })
  },
  onFieldInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  async onWechatLogin() {
    if (this.data.logging) return
    this.setData({ logging: true })
    try {
      const user = config.testLogin
        ? await auth.loginTest(this.data.account.trim(), this.data.nickName.trim() || '测试用户')
        : await auth.loginWithWechat(await auth.getLoginCode(), { nickName: this.data.nickName.trim() || '微信用户' })
      this.setData({ user })
      wx.showToast({ title: '登录成功', icon: 'success' })
      wx.switchTab({ url: '/pages/index/index' })
    } catch (error) { api.showError(error) }
    finally { this.setData({ logging: false }) }
  },
  async logout() {
    try { await auth.logout(); this.setData({ user: null }); wx.showToast({ title: '已退出' }) }
    catch (error) { api.showError(error) }
  },
  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
