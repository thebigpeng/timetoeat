const api = require('./api.js')
function decorateMessage(message) {
  const date = new Date(message.createdAt)
  const pad = n => String(n).padStart(2, '0')
  return Object.assign({}, message, {
    timeText: pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  })
}
function clientId() { return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2) }
module.exports = {
  getMe: () => api.request('/api/me'),
  getFriends: () => api.request('/api/friends').then(users => users.map(user => Object.assign({}, user, {
    displayName: user.remark ? user.remark + '（' + user.name + '）' : user.name
  }))),
  setFriendRemark: (userId, remark) => api.request('/api/friends/' + encodeURIComponent(userId) + '/remark', 'PUT', { remark }),
  searchUsers: keyword => api.request('/api/users?q=' + encodeURIComponent(keyword)),
  addFriend: userId => api.request('/api/friends', 'POST', { userId }),
  getDishesForUser: userId => api.request('/api/dishes' + (userId ? '?userId=' + encodeURIComponent(userId) : '')),
  addMyDish: dish => api.request('/api/dishes', 'POST', dish),
  removeMyDish: id => api.request('/api/dishes/' + encodeURIComponent(id), 'DELETE'),
  getConversations: () => api.request('/api/conversations'),
  async getMessages(peer, before) {
    const result = await api.request('/api/messages?peer=' + encodeURIComponent(peer) + (before ? '&before=' + encodeURIComponent(before) : ''))
    result.messages = result.messages.map(decorateMessage)
    return result
  },
  sendMessage: message => api.request('/api/messages', 'POST', message).then(decorateMessage),
  async getOrderStatuses(peerId, messageIds) {
    let result = []
    for (let i = 0; i < messageIds.length; i += 100) {
      const batch = await api.request('/api/messages/orders/status', 'POST', { peerId, messageIds: messageIds.slice(i, i + 100) })
      result = result.concat(batch.map(decorateMessage))
    }
    return result
  },
  respondToDish: (messageId, action, reason) => api.request('/api/messages/' + encodeURIComponent(messageId) + '/response', 'POST', { action, reason: reason || '' }).then(decorateMessage),
  enjoyDish: messageId => api.request('/api/messages/' + encodeURIComponent(messageId) + '/enjoy', 'POST').then(decorateMessage),
  markChatRead: (peerId, throughId) => api.request('/api/messages/read', 'POST', { peerId, throughId }),
  decorateMessage, clientId
}
