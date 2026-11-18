// 后端接入的唯一配置入口。切换服务时通常只需修改 baseUrl。
module.exports = {
  baseUrl: 'http://127.0.0.1:8080',
  // 仅本地联调；正式环境请关闭，并使用 HTTPS 与已配置的合法域名。
  testLogin: true,
  request: {
    timeout: 15000,
    headers: { 'content-type': 'application/json' },
    authHeader: 'Authorization',
    authPrefix: 'Bearer '
  },
  response: {
    // 当前契约：{ data: ... }；设为 '' 可直接返回整个响应体。
    dataKey: 'data',
    errorKey: 'error'
  },
  storage: {
    user: 'timetoeat_api_user',
    testAccount: 'timetoeat_test_account'
  }
}
