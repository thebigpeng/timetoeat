// Execute the real mini-program modules with a wx transport shim against the live API.
const assert = require('node:assert/strict')
const path = require('node:path')
const storage = new Map()
const notices = []
let offline = false
global.wx = {
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  showToast: value => notices.push(value.title),
  switchTab() {}, navigateTo() {}, showModal() {},
  request(options) {
    if (offline) { options.fail(); return }
    fetch(options.url, { method: options.method, headers: options.header,
      body: options.method === 'GET' || options.data === undefined ? undefined : JSON.stringify(options.data)
    }).then(async res => options.success({ statusCode: res.status, data: await res.json() })).catch(options.fail)
  }
}
function page(name) {
  let result
  global.Page = definition => { result = definition }
  const file = path.resolve(__dirname, '../../timetoeat/pages/' + name + '/' + name + '.js')
  delete require.cache[file]
  require(file)
  result.data = structuredClone(result.data)
  result.setData = function(values) { Object.assign(this.data, values) }
  return result
}
async function main() {
  const auth = require('../../timetoeat/utils/auth.js')
  const social = require('../../timetoeat/utils/social.js')
  const login = page('login')
  login.onLoad()
  login.data.account = 'qa_ui_a_' + Date.now().toString(36)
  login.data.nickName = '页面测试甲'
  offline = true
  await login.onWechatLogin()
  assert.equal(auth.getUser(), null, 'network failure cannot create local login')
  assert.equal(login.data.logging, false)
  offline = false
  await login.onWechatLogin()
  const a = auth.getUser()
  assert.ok(a.id && a.token)
  const profile = page('profile')
  profile.data.form = { name: '页面测试菜 🍲', desc: '真实接口保存', emoji: '🍲' }
  await profile.submitDish()
  assert.equal(profile.data.dishes.length, 1)
  const dish = profile.data.dishes[0]
  const b = await auth.loginTest('qa_ui_b_' + Date.now().toString(36), '页面测试乙')
  await social.addFriend(a.id)
  const chat = page('chat')
  chat.onLoad({ id: a.id }); chat.visible = true
  await chat.refresh()
  assert.ok(chat.data.dishes.some(d => d.id === dish.id))
  chat.data.inputText = '测试异步发送'
  offline = true
  await chat.send()
  assert.equal(chat.data.inputText, '测试异步发送', 'failed send preserves draft')
  assert.equal(chat.data.sending, false)
  const pendingId = chat.pending.request.clientId
  offline = false
  await chat.send()
  assert.equal(chat.data.inputText, '')
  assert.equal(chat.data.messages.length, 1)
  assert.equal(chat.data.messages[0].clientId, pendingId)
  assert.equal(chat.data.messages[0].isMine, true)
  assert.equal(chat.data.messages[0].readText, '未读')
  storage.set('timetoeat_api_user', a)
  const receiver = page('chat')
  receiver.onLoad({ id: b.id }); receiver.visible = true
  await receiver.refresh()
  assert.equal(receiver.data.messages[0].isMine, false)
  storage.set('timetoeat_api_user', b)
  await chat.refresh()
  assert.equal(chat.data.messages[0].readText, '已读')
  const index = page('index'); index.onLoad({}); await index.refresh()
  assert.ok(index.data.friends.some(f => f.id === a.id && f.dishCount === 1))
  const tapFriendName = () => index.onEditRemark({ currentTarget: { dataset: { id: a.id } } })
  const tabBar = { setData(value) { Object.assign(this, value) } }
  index.getTabBar = () => tabBar
  tapFriendName()
  assert.equal(tabBar.remarkEditing, true)
  assert.equal(index.data.remarkDraft, '')
  index.onRemarkInput({ detail: { value: '不保存的备注' } })
  index.closeRemark()
  assert.equal(tabBar.remarkEditing, false)
  assert.equal(index.data.remarkFriend, null)
  assert.equal((await social.getFriends()).find(f => f.id === a.id).remark, '')
  tapFriendName()
  index.onRemarkInput({ detail: { value: '字'.repeat(33) } })
  await index.saveRemark()
  assert.equal(index.data.remarkError, '备注最多 32 个字符')
  index.onRemarkInput({ detail: { value: '  好厨友 🍲  ' } })
  offline = true
  await index.saveRemark()
  assert.ok(index.data.remarkFriend, 'failed save keeps editor open')
  assert.equal(index.data.remarkDraft, '  好厨友 🍲  ')
  assert.equal(index.data.savingRemark, false)
  assert.ok(index.data.remarkError)
  offline = false
  await index.saveRemark()
  assert.equal(index.data.remarkFriend, null)
  assert.equal(tabBar.remarkEditing, false)
  assert.equal(index.data.friends.find(f => f.id === a.id).displayName, '好厨友 🍲（页面测试甲）')
  index.data.keyword = '好厨友'; await index.refresh()
  assert.equal(index.data.friends.length, 1, 'search matches private remark')
  index.data.keyword = '页面测试甲'; await index.refresh()
  assert.equal(index.data.friends.length, 1, 'search still matches original nickname')
  await chat.refresh(); assert.equal(chat.data.titleText, '好厨友 🍲（页面测试甲）')
  const messages = page('messages'); messages.visible = true; await messages.refresh()
  assert.equal(messages.data.conversations[0].preview, '测试异步发送')
  assert.equal(messages.data.conversations[0].displayName, '好厨友 🍲（页面测试甲）')
  tapFriendName(); assert.equal(index.data.remarkDraft, '好厨友 🍲')
  index.onRemarkInput({ detail: { value: '' } }); await index.saveRemark()
  assert.equal(index.data.friends[0].displayName, '页面测试甲')
  storage.set('timetoeat_api_user', a)
  assert.equal((await social.getFriends()).find(f => f.id === b.id).remark, '')
  storage.set('timetoeat_api_user', b)
  await auth.logout(); assert.equal(auth.getUser(), null)
  console.log('PASS: frontend + API: login, dishes, chat; remark edit/cancel/validation/offline retry/search/clear, consistent names and account isolation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
