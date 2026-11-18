// 只生成缺失的本地配置，不覆盖已有密码。
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, '.env')
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, [
    'MYSQL_IMAGE=mysql:latest',
    'MYSQL_ROOT_PASSWORD=' + crypto.randomBytes(24).toString('hex'),
    'MYSQL_PASSWORD=' + crypto.randomBytes(24).toString('hex'),
    'MYSQL_PORT=3307', 'API_PORT=8080', 'ALLOW_TEST_LOGIN=true',
    'WX_APPID=wx26b2bac2e7c37254', 'WX_APP_SECRET=', ''
  ].join('\n'))
  console.log('Created .env with random database passwords (not printed).')
}
const menu = require('../../utils/menu.js')
const sqlString = value => "CONVERT(0x" + Buffer.from(String(value), 'utf8').toString('hex') + " USING utf8mb4)"
const lines = menu.dishes.map(d => {
  const values = [d.id, d.name, d.desc, d.emoji, d.categoryId].map(sqlString)
  return 'INSERT INTO dishes(id,name,description,emoji,category_id,price_cents) VALUES(' + values.join(',') + ',' + Math.round(d.price * 100) + ') ON DUPLICATE KEY UPDATE id=id;'
})
fs.writeFileSync(path.join(root, 'sql/002-catalog.sql'), 'SET NAMES utf8mb4;\n' + lines.join('\n') + '\n')
console.log('Generated catalog seed for ' + lines.length + ' dishes. No users are pre-created.')
