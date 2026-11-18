// 可重复运行：仅补充缺失的 demo_v1 数据，不覆盖用户之后的修改或已读状态。
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const assert = require('node:assert/strict')
const docker = process.env.DOCKER_EXE || path.join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe')
const root = path.resolve(__dirname, '..')
const quote = value => value === '' ? "''" : 'CONVERT(0x' + Buffer.from(String(value), 'utf8').toString('hex') + ' USING utf8mb4)'
const statements = ["SET NAMES utf8mb4;", "SET time_zone = '+00:00';", 'START TRANSACTION;']
const people = [
  ['tester-001', '测试用户', '😀', '今天想去谁家蹭饭？'],
  ['tester-002', '小林', '👩', '无辣不欢，今晚来吃面'],
  ['tester-003', '阿哲', '🧑', '周末掌勺，家常菜管够'],
  ['tester-004', '小雨', '👧', '清淡养生，喜欢煲汤'],
  ['tester-005', '小美', '👩‍🍳', '烘焙爱好者，搜索我的昵称添加好友'],
  ['tester-006', '新朋友', '🐻', '刚加入，还没上传会做的菜']
]
people.forEach(([account, name, emoji, signature], i) => {
  statements.push(`INSERT INTO users(identity_key,login_type,nickname,emoji,signature) VALUES(${quote('test:' + account)},'test',${quote(name)},${quote(emoji)},${quote(signature)}) ON DUPLICATE KEY UPDATE id=id;`)
  statements.push(`SET @u${i}=(SELECT id FROM users WHERE identity_key=${quote('test:' + account)});`)
})
// 小美保留为非好友，方便验证搜索与添加；新朋友用于空菜品、空聊天页面。
for (const i of [1, 2, 3, 5]) statements.push(`INSERT INTO friendships(user_low,user_high) VALUES(LEAST(@u0,@u${i}),GREATEST(@u0,@u${i})) ON DUPLICATE KEY UPDATE user_low=user_low;`)
const custom = [
  [0, 'me_1', '可乐鸡翅', '🍗', '甜咸适口，收汁后撒点芝麻'],
  [0, 'me_2', '番茄炒蛋', '🍅', '酸甜下饭，十分钟快手菜'],
  [0, 'me_3', '测试可删除菜品', '🥗', '可用这道菜验证删除，不影响其他数据'],
  [1, 'lin_1', '葱油拌面', '🍜', '小火熬葱油，配一个溏心蛋'],
  [1, 'lin_2', '辣子鸡', '🌶️', '微辣也能做，提前告诉我'],
  [2, 'zhe_1', '土豆炖牛腩', '🥘', '慢炖两小时，牛腩软糯'],
  [2, 'zhe_2', '蒜香排骨', '🍖', '外酥里嫩，现做现吃'],
  [3, 'yu_1', '冬瓜排骨汤', '🍲', '清淡鲜甜，适合晚餐'],
  [4, 'mei_1', '草莓小蛋糕', '🍰', '周末限定，提前预约']
]
for (const [owner, id, name, emoji, desc] of custom) {
  const dishId = quote('demo_v1_' + id)
  statements.push(`INSERT INTO dishes(id,owner_id,name,description,emoji) VALUES(${dishId},@u${owner},${quote(name)},${quote(desc)},${quote(emoji)}) ON DUPLICATE KEY UPDATE id=id;`)
  statements.push(`INSERT INTO user_dishes(user_id,dish_id) SELECT @u${owner},id FROM dishes WHERE id=${dishId} AND deleted_at IS NULL ON DUPLICATE KEY UPDATE dish_id=dish_id;`)
}
for (const [owner, ids] of [[0, ['d01', 'd15']], [1, ['d05', 'd09']], [2, ['d02', 'd06']], [3, ['d13', 'd17']], [4, ['d16']]]) {
  for (const id of ids) statements.push(`INSERT INTO user_dishes(user_id,dish_id) SELECT @u${owner},id FROM dishes WHERE id=${quote(id)} AND deleted_at IS NULL ON DUPLICATE KEY UPDATE dish_id=dish_id;`)
}
let count = 0
function message(sender, recipient, type, content, minutesAgo, read, dishKey) {
  const dish = custom.find(d => d[1] === dishKey)
  const id = 'demo_v1_msg_' + String(++count).padStart(3, '0')
  statements.push(`INSERT INTO messages(sender_id,recipient_id,client_id,type,content,dish_id,dish_name,dish_emoji,created_at,read_at) VALUES(@u${sender},@u${recipient},${quote(id)},${quote(type)},${quote(content)},${dish ? quote('demo_v1_' + dishKey) : 'NULL'},${quote(dish ? dish[2] : '')},${quote(dish ? dish[3] : '')},DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ${minutesAgo} MINUTE),${read ? `DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ${Math.max(0, minutesAgo - 1)} MINUTE)` : 'NULL'}) ON DUPLICATE KEY UPDATE id=id;`)
}
const history = ['周末一起做饭吗？', '可以呀，你想吃什么？', '想吃你做的面！', '没问题，我来准备食材。', '我带饮料和水果。', '好，六点见～']
for (let i = 0; i < 54; i++) message(i % 2 ? 1 : 0, i % 2 ? 0 : 1, 'text', history[i % history.length] + '（历史 ' + (i + 1) + '）', 200 - i, true)
message(0, 1, 'dish', '我想吃：葱油拌面', 90, true, 'lin_1')
message(1, 0, 'text', '已经买好葱啦，今晚可以安排。', 89, true)
message(0, 1, 'sticker', '🥳', 88, true)
message(0, 1, 'nudge', '葱油拌面还要多久呀？碗筷都摆好了！', 15, false, 'lin_1')
message(1, 0, 'text', '面快好了，记得过来吃～', 5, false)
message(1, 0, 'sticker', '🍜', 4, false)
message(2, 0, 'dish', '我想吃：可乐鸡翅', 50, true, 'me_1')
message(0, 2, 'text', '可以，周末一起做。', 49, true)
message(2, 0, 'nudge', '可乐鸡翅的粉丝已经等很久了！', 3, false, 'me_1')
message(0, 2, 'dish', '我想吃：土豆炖牛腩', 2, false, 'zhe_1')
message(3, 0, 'text', '今天煲了冬瓜排骨汤，要来喝一碗吗？', 40, true)
message(0, 3, 'sticker', '👍', 39, true)
statements.push('COMMIT;')
function execute(sql) {
  const result = spawnSync(docker, ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u timetoeat --default-character-set=utf8mb4 --batch --skip-column-names timetoeat'], {
    cwd: root, input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'MySQL command failed')
  return result.stdout.trim()
}
execute(statements.join('\n'))
const total = Number(execute("SELECT COUNT(*) FROM messages WHERE client_id LIKE 'demo\\_v1\\_msg\\_%';"))
assert.equal(total, count, 'Demo message count must be stable on repeated runs')
const users = execute("SELECT id,identity_key,nickname FROM users WHERE identity_key IN ('test:tester-001','test:tester-002','test:tester-003','test:tester-004','test:tester-005','test:tester-006') ORDER BY identity_key;")
assert.equal(users.split('\n').length, people.length)
console.log('Demo data ready: 6 test identities, 4 friendships for tester-001, 9 custom dishes + catalog links, ' + count + ' messages.')
console.log(users)
