const api = require('./api.js')
const config = require('./config.js')
function getUser() {
  const user = api.getUser()
  return user && user.token && user.id ? user : null
}
function isLoggedIn() { return !!getUser() }
function cacheUser(user) {
  if (!user) return null
  const merged = Object.assign({}, api.getUser() || {}, user)
  wx.setStorageSync(api.USER_KEY, merged)
  return merged
}
async function updateGender(gender) {
  if (!isLoggedIn()) throw new Error('请先登录')
  const user = await api.request('/api/me/gender', 'PUT', { gender })
  return cacheUser(user)
}
function getLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({ success: res => res.code ? resolve(res.code) : reject(new Error('微信未返回登录凭证')), fail: reject })
  })
}
async function loginWithWechat(code, profile) {
  const user = await api.request('/api/auth/wechat', 'POST', {
    code, nickName: profile && profile.nickName || '微信用户', avatarUrl: profile && profile.avatarUrl || ''
  })
  wx.setStorageSync(api.USER_KEY, user)
  return user
}
async function loginTest(account, nickName) {
  if (!config.testLogin) throw new Error('测试登录未启用')
  const user = await api.request('/api/auth/test', 'POST', { account, nickName })
  wx.setStorageSync(api.USER_KEY, user)
  wx.setStorageSync(config.storage.testAccount, account)
  return user
}
async function logout() {
  await api.request('/api/auth/logout', 'POST')
  wx.removeStorageSync(api.USER_KEY)
}
function requireLogin(options) {
  if (isLoggedIn()) return true
  const opts = options || {}
  wx.showModal({ title: opts.title || '登录后继续', content: opts.content || '请先登录', confirmText: '去登录',
    success(res) { if (res.confirm) wx.navigateTo({ url: '/pages/login/login' }) } })
  return false
}
module.exports = { getUser, isLoggedIn, cacheUser, updateGender, getLoginCode, loginWithWechat, loginTest, logout, requireLogin }
