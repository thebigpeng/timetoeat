const social = require('../../utils/social.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
Page({
  data: { friend: null, titleText: '聊天', dishes: [], messages: [], inputText: '', scrollTo: '',
    showStickers: false, sending: false, hasMore: false, loadingOlder: false,
    stickerList: ['😀', '😂', '🥰', '😍', '😎', '🤔', '😭', '😋', '👍', '👏', '🙏', '💪', '🤝', '👀', '🎉', '🥳', '❤️', '🔥', '✨', '🌟', '🍜', '🍚', '🍗', '🍺'] },
  onLoad(options) { this.friendId = options.id || '' },
  onShow() {
    this.visible = true
    if (!auth.requireLogin()) return
    this.refresh()
    clearInterval(this.poll)
    // shortcut: 前台轮询有最多约 3 秒延迟；需要即时推送时接入 WebSocket。
    this.poll = setInterval(() => this.refresh(true), 3000)
  },
  onHide() { this.visible = false; clearInterval(this.poll) },
  onUnload() { this.visible = false; clearInterval(this.poll) },
  displayMessages(list) {
    const user = auth.getUser()
    return list.map(message => Object.assign({}, message, {
      isMine: !!user && message.fromUserId === user.id,
      avatar: user && message.fromUserId === user.id ? user.emoji || '😀' : this.data.friend && this.data.friend.emoji || '👤',
      readText: user && message.fromUserId === user.id ? (message.read ? '已读' : '未读') : ''
    }))
  },
  async refresh(silent) {
    const user = auth.getUser()
    if (!user || !this.friendId || this.loading) return
    this.loading = true
    try {
      const [friends, dishes, result] = await Promise.all([
        social.getFriends(), social.getDishesForUser(this.friendId), social.getMessages(this.friendId)
      ])
      if (!this.visible || !auth.getUser() || auth.getUser().id !== user.id) return
      const friend = friends.find(f => f.id === this.friendId)
      if (!friend) throw new Error('请先添加该用户为好友')
      const merged = new Map(this.data.messages.map(m => [m.id, m]))
      result.messages.forEach(m => merged.set(m.id, m))
      const list = Array.from(merged.values()).sort((a, b) => a.createdAt - b.createdAt || a.id.length - b.id.length || a.id.localeCompare(b.id))
      const previous = this.data.messages[this.data.messages.length - 1]
      const last = list[list.length - 1]
      this.setData({ friend, titleText: friend.displayName, dishes })
      this.setData({
        messages: this.displayMessages(list),
        hasMore: this.loadedOlder ? this.data.hasMore : result.hasMore,
        scrollTo: last && (!previous || previous.id !== last.id) ? 'msg-' + last.id : this.data.scrollTo
      })
      if (last && this.visible) await social.markChatRead(this.friendId, last.id)
    } catch (error) { if (!silent && this.visible) api.showError(error) }
    finally { this.loading = false }
  },
  async loadOlder() {
    if (this.data.loadingOlder || !this.data.hasMore || !this.data.messages.length) return
    this.setData({ loadingOlder: true })
    try {
      const result = await social.getMessages(this.friendId, this.data.messages[0].id)
      if (!this.visible) return
      this.loadedOlder = true
      const existing = new Set(this.data.messages.map(m => m.id))
      this.setData({ messages: this.displayMessages(result.messages.filter(m => !existing.has(m.id)).concat(this.data.messages)),
        hasMore: result.hasMore, scrollTo: '' })
    } catch (error) { api.showError(error) }
    finally { this.setData({ loadingOlder: false }) }
  },
  async sendPayload(payload) {
    if (!auth.requireLogin() || this.data.sending) return false
    const signature = JSON.stringify(payload)
    if (!this.pending || this.pending.signature !== signature) {
      this.pending = { signature, request: Object.assign({ toUserId: this.friendId, clientId: social.clientId() }, payload) }
    }
    this.setData({ sending: true })
    try {
      await social.sendMessage(this.pending.request)
      this.pending = null
      await this.refresh()
      return true
    } catch (error) { api.showError(error); return false }
    finally { this.setData({ sending: false }) }
  },
  onInput(e) { this.setData({ inputText: e.detail.value }) },
  async send() {
    const text = this.data.inputText.trim()
    if (!text) { wx.showToast({ title: '请输入消息', icon: 'none' }); return }
    if (await this.sendPayload({ type: 'text', content: text })) {
      if (this.data.inputText.trim() === text) this.setData({ inputText: '' })
    }
  },
  onDishTap(e) {
    this.sendPayload({ type: 'dish', dishId: e.currentTarget.dataset.id, content: '' })
  },
  onNudge(e) {
    const { id, name } = e.currentTarget.dataset
    this.sendPayload({ type: 'nudge', dishId: id, content: '催一下' + name + '，肚子已经开始抗议啦～' })
  },
  toggleStickers() { this.setData({ showStickers: !this.data.showStickers }) },
  async onStickerTap(e) {
    if (await this.sendPayload({ type: 'sticker', content: e.currentTarget.dataset.emoji })) this.setData({ showStickers: false })
  }
})
