const config = require('./config.js')
const USER_KEY = config.storage.user
function getUser() {
  try { return wx.getStorageSync(USER_KEY) || null } catch (_) { return null }
}
function getResponseField(data, key) { return key ? data && data[key] : data }
function request(path, method = 'GET', data) {
  const user = getUser()
  const token = user && user.token
  const header = Object.assign({}, config.request.headers)
  if (token) header[config.request.authHeader] = config.request.authPrefix + token
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''),
      method, data, timeout: config.request.timeout, header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(getResponseField(res.data, config.response.dataKey))
          return
        }
        if (res.statusCode === 401 && getUser() && getUser().token === token) wx.removeStorageSync(USER_KEY)
        const error = new Error(getResponseField(res.data, config.response.errorKey) || '服务请求失败')
        error.status = res.statusCode
        reject(error)
      },
      fail() { reject(new Error('无法连接后端，请检查服务和网络设置')) }
    })
  })
}
function showError(error) { wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none' }) }
module.exports = { USER_KEY, getUser, request, showError }
