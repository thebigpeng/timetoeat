const social = require('../../utils/social.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
const guest = { name: '未登录', emoji: '😀', signature: '登录后保存会做的菜', gender: 'unknown', caicaiScore: 0 }
const CHEF_BY_GENDER = {
  unknown: { emoji: '🧑‍🍳', label: '保密' },
  male: { emoji: '👨‍🍳', label: '男' },
  female: { emoji: '👩‍🍳', label: '女' }
}
Page({
  data: { titleText: '我的主页', user: guest, dishes: [], showAdd: false, isLoggedIn: false, saving: false, savingGender: false,
    chefEmoji: '🧑‍🍳', chefLabel: '保密',
    genderOptions: [{ value: 'unknown', label: '保密' }, { value: 'male', label: '男' }, { value: 'female', label: '女' }],
    emojiOptions: ['🍲', '🍜', '🍚', '🍗', '🥘', '🥟', '🍢', '🥗', '🍰', '🧋'], form: { emoji: '🍲', name: '', desc: '' } },
  onShow() {
    this.refresh()
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ selected: 2 })
  },
  applyUser(user) {
    const chef = CHEF_BY_GENDER[user.gender] || CHEF_BY_GENDER.unknown
    this.setData({ user, chefEmoji: chef.emoji, chefLabel: chef.label })
  },
  async refresh() {
    const user = auth.getUser()
    this.setData({ isLoggedIn: !!user, dishes: [] })
    this.applyUser(user || guest)
    if (!user) return
    try {
      const [me, dishes] = await Promise.all([social.getMe(), social.getDishesForUser(user.id)])
      if (auth.getUser() && auth.getUser().id === user.id) {
        auth.cacheUser(me)
        this.applyUser(me)
        this.setData({ dishes })
      }
    } catch (error) { api.showError(error) }
  },
  async onGenderChange(e) {
    const gender = e.currentTarget.dataset.gender
    if (!auth.requireLogin() || this.data.savingGender || gender === this.data.user.gender) return
    this.setData({ savingGender: true })
    try {
      const me = await auth.updateGender(gender)
      this.applyUser(me)
      wx.showToast({ title: '厨师形象已更新', icon: 'success' })
    } catch (error) { api.showError(error) }
    finally { this.setData({ savingGender: false }) }
  },
  goLogin() { wx.navigateTo({ url: '/pages/login/login' }) },
  onAvatarTap() {
    if (auth.isLoggedIn()) wx.navigateTo({ url: '/pages/account/account' })
    else this.goLogin()
  },
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
