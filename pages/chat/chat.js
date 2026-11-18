const social = require('../../utils/social.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
Page({
  data: { friend: null, titleText: '聊天', dishes: [], messages: [], inputText: '', scrollTo: '',
    showStickers: false, sending: false, hasMore: false, loadingOlder: false, responding: false, enjoying: false,
    rejectingMessage: null, rejectReason: '', rejectReasonCustom: '',
    rejectReasonOptions: ['食材不够', '今天没时间', '最近不想做这道'],
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
    return list.map(message => {
      const isMine = !!user && message.fromUserId === user.id
      const isDish = message.type === 'dish'
      const status = message.orderStatus || 'pending'
      let statusText = ''
      if (isDish && status === 'pending' && isMine) statusText = '等待好友回应'
      if (isDish && status === 'accepted') statusText = isMine ? '好友可以做，开饭有望啦' : '你已答应做这道菜'
      if (isDish && status === 'rejected') statusText = isMine ? '好友暂时做不了' : '你已回复做不了'
      if (isDish && status === 'enjoyed') statusText = isMine ? '已享用 · 厨师获得 3 菜菜分' : 'TA 已享用 · 你获得 3 菜菜分'
      return Object.assign({}, message, {
        isMine,
        canRespond: isDish && !isMine && status === 'pending',
        canNudge: isDish && isMine && status === 'accepted',
        canEnjoy: isDish && isMine && status === 'accepted',
        statusText,
        avatar: isMine ? user.emoji || '😀' : this.data.friend && this.data.friend.emoji || '👤',
        readText: isMine ? (message.read ? '已读' : '未读') : ''
      })
    })
  },
  async refresh(silent) {
    const user = auth.getUser()
    if (!user || !this.friendId || this.loading) return
    this.loading = true
    try {
      const activeIds = this.data.messages.filter(m => m.type === 'dish' && ['', 'pending', 'accepted'].includes(m.orderStatus || '')).map(m => m.id)
      const [friends, dishes, result, orders] = await Promise.all([
        social.getFriends(), social.getDishesForUser(this.friendId), social.getMessages(this.friendId),
        social.getOrderStatuses(this.friendId, activeIds)
      ])
      if (!this.visible || !auth.getUser() || auth.getUser().id !== user.id) return
      const friend = friends.find(f => f.id === this.friendId)
      if (!friend) throw new Error('请先添加该用户为好友')
      const merged = new Map(this.data.messages.map(m => [m.id, m]))
      const statusRank = status => status === 'enjoyed' ? 2 : (status === 'accepted' || status === 'rejected' ? 1 : 0)
      result.messages.concat(orders).forEach(m => {
        const previous = merged.get(m.id)
        if (!previous || previous.type !== 'dish') { merged.set(m.id, m); return }
        const incomingStatus = m.orderStatus || 'pending'
        const previousStatus = previous.orderStatus || 'pending'
        // 状态只能向前推进，较早的轮询不能把已处理/已享用的点菜覆盖回旧状态。
        if (statusRank(incomingStatus) < statusRank(previousStatus)) return
        if (incomingStatus !== previousStatus && statusRank(incomingStatus) === 1) return
        merged.set(m.id, m)
      })
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
    return this.sendPayload({ type: 'dish', dishId: e.currentTarget.dataset.id, content: '' })
  },
  onNudge(e) {
    const { orderId } = e.currentTarget.dataset
    const order = this.data.messages.find(item => item.id === orderId)
    if (!order || !order.canNudge) { wx.showToast({ title: '好友选择可以做后才能催一下', icon: 'none' }); return false }
    return this.sendPayload({ type: 'nudge', orderId })
  },
  async onEnjoyDish(e) {
    if (!auth.requireLogin() || this.data.enjoying) return false
    const target = this.data.messages.find(item => item.id === e.currentTarget.dataset.id && item.canEnjoy)
    if (!target) { wx.showToast({ title: '这道菜还不能确认享用', icon: 'none' }); return false }
    this.setData({ enjoying: true })
    try {
      const updated = await social.enjoyDish(target.id)
      const list = this.data.messages.map(item => item.id === target.id ? Object.assign({}, item, updated) : item)
      this.setData({ messages: this.displayMessages(list) })
      wx.showToast({ title: '已享用，厨师 +3 菜菜分', icon: 'success' })
      await this.refresh(true)
      return true
    } catch (error) { api.showError(error); return false }
    finally { this.setData({ enjoying: false }) }
  },
  onAcceptDish(e) { return this.respondToDish(e.currentTarget.dataset.id, 'accept', '') },
  openReject(e) {
    if (this.data.responding) return
    const message = this.data.messages.find(item => item.id === e.currentTarget.dataset.id && item.canRespond)
    if (message) this.setData({ rejectingMessage: message, rejectReason: '', rejectReasonCustom: '' })
  },
  chooseRejectReason(e) { this.setData({ rejectReason: e.currentTarget.dataset.reason }) },
  onRejectReasonInput(e) { this.setData({ rejectReasonCustom: e.detail.value }) },
  closeReject() {
    if (!this.data.responding) this.setData({ rejectingMessage: null, rejectReason: '', rejectReasonCustom: '' })
  },
  stopPropagation() {},
  submitReject() {
    const message = this.data.rejectingMessage
    if (!message) return false
    const reason = this.data.rejectReasonCustom.trim() || this.data.rejectReason
    return this.respondToDish(message.id, 'reject', reason)
  },
  async respondToDish(messageId, action, reason) {
    if (!auth.requireLogin() || this.data.responding) return false
    const target = this.data.messages.find(item => item.id === messageId && item.canRespond)
    if (!target) { wx.showToast({ title: '这次点菜已经回复过了', icon: 'none' }); return false }
    this.setData({ responding: true })
    try {
      const updated = await social.respondToDish(messageId, action, reason)
      const list = this.data.messages.map(item => item.id === messageId ? Object.assign({}, item, updated) : item)
      this.setData({ messages: this.displayMessages(list) })
      if (action === 'reject') this.setData({ rejectingMessage: null, rejectReason: '', rejectReasonCustom: '' })
      await this.refresh(true)
      return true
    } catch (error) { api.showError(error); return false }
    finally { this.setData({ responding: false }) }
  },
  toggleStickers() { this.setData({ showStickers: !this.data.showStickers }) },
  async onStickerTap(e) {
    if (await this.sendPayload({ type: 'sticker', content: e.currentTarget.dataset.emoji })) this.setData({ showStickers: false })
  }
})
