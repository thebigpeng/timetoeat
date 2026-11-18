const social = require('../../utils/social.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
Page({
  data: { currentUser: { name: '未登录', emoji: '😀' }, friends: [], searchResults: [], keyword: '', user: null, isLoggedIn: false, loading: false,
    remarkFriend: null, remarkDraft: '', remarkError: '', savingRemark: false },
  onLoad(options) { this.invitedBy = options && options.from || '' },
  onShow() {
    this.refresh()
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ selected: 0, remarkEditing: !!this.data.remarkFriend })
  },
  onHide() { clearTimeout(this.searchTimer); this.requestVersion = (this.requestVersion || 0) + 1; this.syncRemarkTabBar(false) },
  onUnload() { clearTimeout(this.searchTimer); this.requestVersion = (this.requestVersion || 0) + 1; this.syncRemarkTabBar(false) },
  syncRemarkTabBar(editing) {
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ remarkEditing: editing })
  },
  async refresh() {
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    const user = auth.getUser()
    if (this.loadedUserId !== (user && user.id)) {
      this.setData({ friends: [], searchResults: [], remarkFriend: null })
      this.syncRemarkTabBar(false)
    }
    this.loadedUserId = user && user.id
    this.setData({ user, isLoggedIn: !!user, loading: !!user })
    if (!user) { this.setData({ friends: [], searchResults: [] }); return }
    try {
      if (this.invitedBy && this.invitedBy !== user.id) {
        const peer = this.invitedBy; this.invitedBy = ''
        await social.addFriend(peer)
      }
      const key = this.data.keyword.trim()
      const [allFriends, candidates] = await Promise.all([social.getFriends(), key ? social.searchUsers(key) : Promise.resolve([])])
      const withCount = async person => Object.assign({}, person, { dishCount: (await social.getDishesForUser(person.id)).length })
      const friends = await Promise.all(allFriends.filter(f => !key || f.displayName.toLowerCase().includes(key.toLowerCase()) || f.id === key).map(withCount))
      const searchResults = await Promise.all(candidates.filter(u => !allFriends.some(f => f.id === u.id)).map(withCount))
      if (version === this.requestVersion && auth.getUser() && auth.getUser().id === user.id) this.setData({ friends, searchResults })
    } catch (error) { if (version === this.requestVersion) api.showError(error) }
    finally { if (version === this.requestVersion) this.setData({ loading: false }) }
  },
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value }); clearTimeout(this.searchTimer)
    this.requestVersion = (this.requestVersion || 0) + 1
    this.searchTimer = setTimeout(() => this.refresh(), 300)
  },
  async onAddFriend(e) {
    if (!auth.requireLogin()) return
    try { await social.addFriend(e.currentTarget.dataset.id); wx.showToast({ title: '已添加好友' }); await this.refresh() }
    catch (error) { api.showError(error) }
  },
  onEditRemark(e) {
    if (!auth.requireLogin() || this.data.savingRemark) return
    const friend = this.data.friends.find(item => item.id === e.currentTarget.dataset.id)
    if (friend) {
      this.setData({ remarkFriend: friend, remarkDraft: friend.remark || '', remarkError: '' })
      this.syncRemarkTabBar(true)
    }
  },
  onRemarkInput(e) { this.setData({ remarkDraft: e.detail.value, remarkError: '' }) },
  closeRemark() {
    if (this.data.savingRemark) return
    this.setData({ remarkFriend: null, remarkDraft: '', remarkError: '' })
    this.syncRemarkTabBar(false)
  },
  stopPropagation() {},
  async saveRemark() {
    if (!auth.requireLogin() || !this.data.remarkFriend || this.data.savingRemark) return
    const remark = this.data.remarkDraft.trim()
    if (Array.from(remark).length > 32) { this.setData({ remarkError: '备注最多 32 个字符' }); return }
    if (/[\u0000-\u001f\u007f]/.test(remark)) { this.setData({ remarkError: '备注不能包含换行或控制字符' }); return }
    const userId = auth.getUser().id
    const friendId = this.data.remarkFriend.id
    this.setData({ savingRemark: true, remarkError: '' })
    try {
      await social.setFriendRemark(friendId, remark)
      if (!auth.getUser() || auth.getUser().id !== userId) return
      this.setData({ remarkFriend: null, remarkDraft: '' })
      this.syncRemarkTabBar(false)
      wx.showToast({ title: remark ? '备注已保存' : '已清除备注' })
      await this.refresh()
    } catch (error) {
      if (auth.getUser() && auth.getUser().id === userId) this.setData({ remarkError: error.message || '保存失败，请重试' })
      else api.showError(error)
    } finally { this.setData({ savingRemark: false }) }
  },
  goMyProfile() {
    if (!auth.isLoggedIn()) wx.navigateTo({ url: '/pages/login/login' })
    else wx.switchTab({ url: '/pages/profile/profile' })
  },
  goChat(e) {
    if (auth.requireLogin()) wx.navigateTo({ url: '/pages/chat/chat?id=' + e.currentTarget.dataset.id })
  },
  onShareAppMessage() {
    const user = auth.getUser()
    return {
      title: '来蹭饭吧，看看我会做的菜',
      path: '/pages/index/index' + (user ? '?from=' + user.id : ''),
      imageUrl: '/assets/images/share-cover-cats.jpg'
    }
  }
})
