const social = require('../../utils/social.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
Page({
  data: { conversations: [] },
  onShow() {
    this.visible = true; this.refresh()
    clearInterval(this.poll)
    this.poll = setInterval(() => this.refresh(true), 5000)
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ selected: 1 })
  },
  onHide() { this.visible = false; clearInterval(this.poll) },
  onUnload() { this.visible = false; clearInterval(this.poll) },
  async refresh(silent) {
    if (!auth.isLoggedIn()) { this.setData({ conversations: [] }); return }
    if (this.loading) return
    this.loading = true
    const userId = auth.getUser().id
    if (this.loadedUserId !== userId) this.setData({ conversations: [] })
    this.loadedUserId = userId
    try {
      const [friends, summaries] = await Promise.all([social.getFriends(), social.getConversations()])
      const conversations = friends.map(friend => {
        const summary = summaries.find(s => s.peerId === friend.id)
        const last = summary && social.decorateMessage(summary.last)
        return Object.assign({}, friend, { preview: last ? last.content : '还没有聊天，打个招呼吧',
          timeText: last ? last.timeText : '', lastAt: last ? last.createdAt : 0, unreadCount: summary ? summary.unreadCount : 0 })
      }).sort((a, b) => b.lastAt - a.lastAt)
      if (this.visible && auth.getUser() && auth.getUser().id === userId) this.setData({ conversations })
    } catch (error) { if (!silent) api.showError(error) }
    finally { this.loading = false }
  },
  goChat(e) { if (auth.requireLogin()) wx.navigateTo({ url: '/pages/chat/chat?id=' + e.currentTarget.dataset.id }) },
  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
