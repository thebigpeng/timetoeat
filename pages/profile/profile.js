const social = require('../../utils/social.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
const guest = { name: '未登录', emoji: '😀', signature: '登录后保存会做的菜' }
Page({
  data: { titleText: '我的主页', user: guest, dishes: [], showAdd: false, isLoggedIn: false, saving: false,
    emojiOptions: ['🍲', '🍜', '🍚', '🍗', '🥘', '🥟', '🍢', '🥗', '🍰', '🧋'], form: { emoji: '🍲', name: '', desc: '' } },
  onShow() {
    this.refresh()
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ selected: 2 })
  },
  async refresh() {
    const user = auth.getUser()
    this.setData({ isLoggedIn: !!user, user: user || guest, dishes: [] })
    if (!user) return
    try {
      const [me, dishes] = await Promise.all([social.getMe(), social.getDishesForUser(user.id)])
      if (auth.getUser() && auth.getUser().id === user.id) this.setData({ user: me, dishes })
    } catch (error) { api.showError(error) }
  },
  goLogin() { wx.navigateTo({ url: '/pages/login/login' }) },
  toggleAdd() { this.setData({ showAdd: !this.data.showAdd }) },
  onFormInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }) },
  chooseEmoji(e) { this.setData({ 'form.emoji': e.currentTarget.dataset.emoji }) },
  async submitDish() {
    if (!auth.requireLogin() || this.data.saving) return
    if (!this.data.form.name.trim()) { wx.showToast({ title: '请填写菜名', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      await social.addMyDish(this.data.form)
      this.setData({ showAdd: false, form: { emoji: '🍲', name: '', desc: '' } })
      await this.refresh(); wx.showToast({ title: '已添加' })
    } catch (error) { api.showError(error) }
    finally { this.setData({ saving: false }) }
  },
  removeDish(e) {
    if (!auth.requireLogin()) return
    wx.showModal({ title: '删除菜品', content: '确定不再展示这道菜吗？', success: async res => {
      if (!res.confirm) return
      try { await social.removeMyDish(e.currentTarget.dataset.id); await this.refresh() }
      catch (error) { api.showError(error) }
    } })
  }
})
