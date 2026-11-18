# TimeToEat C++ 后端

与 `../timetoeat` 配套的 C++17 HTTP 服务。使用 cpp-httplib、nlohmann/json、MariaDB Connector/C（连接 MySQL）、OpenSSL、libcurl；Docker 内编译运行，Windows 不需要单独安装 C++ 依赖。

## 启动与连接

在本目录执行 `./start.ps1`。脚本会寻找本机 Docker Desktop，首次生成随机数据库密码到 `.env`，构建并启动服务。也可指定 `./start.ps1 -DockerPath '完整的 docker.exe 路径'`。

- API：`http://127.0.0.1:8080`；健康检查：`GET /health`。
- MySQL：`127.0.0.1:3307`，数据库 `timetoeat`，普通用户 `timetoeat`，密码查看本机 `.env` 的 `MYSQL_PASSWORD`。密码不写入小程序、不提交版本库。
- 已配置使用本机已有的 `mysql:latest`。新环境可以修改 `.env` 的 `MYSQL_IMAGE`，要求 MySQL 8.0+。现有数据卷不要跨 MySQL 主版本直接降级。
- 容器：`timetoeat-mysql-1`、`timetoeat-api-1`；独立持久化卷：`timetoeat_mysql-data`。
- 停止：`docker compose stop`；重新启动：`docker compose up -d`；修改 C++ 后：`docker compose up -d --build api`；日志：`docker compose logs --tail 50 api`。
- 不要使用 `docker compose down -v`，这会删除数据库卷。
- `sql/001-schema.sql`、`002-catalog.sql` 仅在空数据卷首次启动时运行。后续改表应另写迁移 SQL，不要以删除数据卷代替迁移。
- `sql/003-friend-remarks.sql` 是可重复执行的备注迁移；新数据库初始化时自动运行，`start.ps1` 也会在 MySQL 就绪后对旧数据库执行，再重建 API。手动部署须先将该 SQL 导入现有数据库，不能仅重建 API。

## 小程序联调

`../timetoeat/utils/config.js` 已配置 `baseUrl: http://127.0.0.1:8080` 和 `testLogin: true`。开发者工具本地配置 `urlCheck` 已关闭，供本机 HTTP 调试。

1. 在开发者工具编译小程序，点击首页“未登录”。
2. 使用 `tester-001` 和昵称登录。只有后端事务提交成功才显示登录成功，`users` 新增一行。
3. 重复使用同一账号登录复用该用户，不产生重复用户；昵称输入仅用于首次注册。
4. 在“我的”新增一道菜，菜品写入数据库。
5. 从“我的 → 切换账号 / 退出登录”改用 `tester-002` 注册。搜索第一个用户的昵称或 ID，添加好友。
6. 聊天页面可发送文字、表情、想吃的菜、催饭；切回接收方打开聊天，才标记为已读。
7. 两个开发者工具实例使用不同测试账号可联调；聊天页每 3 秒刷新、消息页每 5 秒刷新，隐藏时停止。历史每页 50 条，点击“查看更早消息”继续加载。

测试账号是本地调试身份，任何知道该账号名的人都能登录；当前 API 和数据库均只发布到本机回环地址。不能将开启测试登录的服务直接暴露公网。

真机不能使用电脑的 `127.0.0.1`。真机联调需单独调整 API 端口绑定和 `baseUrl` 为可访问地址，正式环境使用 HTTPS 合法域名，并恢复域名校验。

## 表设计

所有业务文本使用 utf8mb4；时间由服务器按 UTC 写入，小程序按本地时区展示；BIGINT ID 在 JSON 中使用字符串，避免 JavaScript 精度损失。

| 表 | 职责与约束 |
|---|---|
| `users` | 用户主表；`identity_key` 唯一。测试身份 `test:账号`；正式身份 `wx:openid`，两个命名空间不互通。记录昵称、头像、签名、创建和最后登录时间。对外不暴露 identity_key。 |
| `sessions` | 7 天有效的登录会话。返回 32 字节安全随机 token，数据库仅存 SHA-256 摘要；通过外键绑定用户。退出撤销当前 token，过期会话在登录时清理。 |
| `dishes` | 菜品主表。`owner_id IS NULL` 为公共目录，否则为用户原创；金额用整数分。软删除保留消息外键。首次导入现有菜单的 18 道菜，不伪造用户或好友。 |
| `user_dishes` | 用户与“会做的菜”的多对多关联，联合主键去重。新用户初始为空；新增原创菜同时插入两表；选择公共菜只插入关联。 |
| `friendships` | 双向好友关系只存一行，小 ID 存 `user_low`，大 ID 存 `user_high`，联合主键去重。`remark_by_low` 是小 ID 用户对大 ID 好友的备注，`remark_by_high` 是反方向备注，均为 VARCHAR(32)、默认空字符串。保持现有产品的直接添加行为，未实现审批。 |
| `messages` | 发送者、接收者、类型、正文、菜品引用及菜名/emoji 快照、发送时间、已读时间。四种类型：text/sticker/dish/nudge。`(sender_id,client_id)` 唯一，支持网络重试去重。收发双方索引用于聊天分页。 |

## 读写逻辑与权限

- 登录：服务端确认身份 → 用户 upsert → 创建会话 → 提交同一事务 → 返回 token；失败整体回滚。每次登录产生独立会话，不使其他设备自动退出。
- 用户：已登录用户可以按昵称或 ID 搜索公开资料，最多返回 50 个。不会返回其他用户的 token、微信 openid 或登录身份。
- 好友备注：点击好友列表的名字编辑，展示为“备注（原昵称）”，空备注只显示原昵称。备注是私有的关系数据，不修改 users.nickname；好友列表只返回当前用户设置的 remark，不返回对方备注。保存上限 32 个 Unicode 字符，拒绝控制字符，空字符串清除；好友搜索支持备注/原昵称/ID，消息列表及聊天标题同步显示。取消不保存，失败保留草稿。双方同时修改各自备注不会互相覆盖。
- 菜品：已登录用户可看公开的“会做的菜”。新增原创菜与归属关系在一个事务内写入。删除只能操作自己的关联；原创菜同时软删除，公共菜不删除公共目录。
- 聊天：必须是好友才能发消息或读该会话；发送者始终由 token 决定，忽略客户端 `fromUserId`。想吃/催饭只能引用接收方仍在提供的菜，菜名快照取自数据库。
- 重试：客户端为一次发送保留 `clientId`，超时后重试复用；唯一索引避免重复消息。请求标识不得用于另一接收方或消息类型。
- 已读：服务端只更新“当前用户收到、来自指定好友、ID 不大于页面已看到的 throughId”的消息，不允许冒充对方已读。
- 历史：软删除菜品后，旧消息仍显示发送时快照。消息分页以 ID 为游标，最新会话摘要和未读数量单独查询。
- 本地缓存：仅保存会话和上次测试账号。旧版演示用户、好友、聊天缓存不会导入 MySQL，也不会混入真实账号。

## HTTP 接口

除健康检查和登录外，均需 `Authorization: Bearer <token>`。成功为 `{ "data": ... }`，失败为 `{ "error": "..." }`。错误状态包括 400 参数错误、401 未登录/过期、403 无权操作、404 不存在、409 重试标识冲突、500 服务故障。

| 方法 | 路径 | 参数 / 用途 |
|---|---|---|
| POST | `/api/auth/test` | `{account,nickName}`，需 `ALLOW_TEST_LOGIN=true` |
| POST | `/api/auth/wechat` | `{code,nickName,avatarUrl}` |
| POST | `/api/auth/logout` | 撤销当前会话 |
| GET | `/api/me` | 当前用户资料 |
| GET | `/api/users?q=...` | 搜索用户 |
| GET / POST | `/api/friends` | 查询好友 / `{userId}` 添加好友 |
| PUT | `/api/friends/:userId/remark` | `{remark}` 设置当前用户对该好友的备注；空字符串清除，必须已有好友关系 |
| GET | `/api/catalog` | 公共菜单目录 |
| GET | `/api/dishes?userId=...` | 用户会做的菜，省略 userId 为自己 |
| POST | `/api/dishes` | `{name,desc,emoji}` 新增原创菜 |
| POST | `/api/dishes/select` | `{dishId}` 将公共菜加入“我会做” |
| DELETE | `/api/dishes/:id` | 移除自己的菜品 |
| GET | `/api/conversations` | 最新消息和未读数 |
| GET | `/api/messages?peer=ID&before=ID` | 最新/历史消息，返回 messages 与 hasMore |
| POST | `/api/messages` | `{toUserId,clientId,type,content,dishId?}` |
| POST | `/api/messages/read` | `{peerId,throughId}` 更新已读水位 |

## 测试与上线边界

运行 `node tests/integration.mjs`，脚本连接真实 API/MySQL，创建 `qa_` 前缀账号，验证登录去重、会话、归属校验、好友关系、中文/emoji、消息身份隔离、并发重试、已读水位、软删除快照、分页和退出。测试数据保留便于检查；不会删除已有用户数据。

`tests/inspect.sql` 提供只读查询，便于查看用户和数据库状态。测试数据仅用于开发，不应迁入生产。

运行 `node tests/frontend.cjs`，使用真实小程序 JS 模块和 wx 传输替身连接真实后端，验证页面登录、断网失败、菜品保存、消息重试及双方已读。不替代微信真机测试。

正式微信登录已实现后端通过 `jscode2session` 换取可信 openid，不再根据临时 code 伪造 openid。上线前在后端 `.env` 配置 WX_APP_SECRET，设置 ALLOW_TEST_LOGIN=false，并将小程序 testLogin=false。当前未提供真实密钥，因此没有验证真实微信登录和真机网络。

当前实现面向本地功能开发：每个请求独立数据库连接、HTTP 轮询聊天。扩大规模时再引入连接池、限流和实时推送。公开部署前需配置 HTTPS、备份、日志策略和资源限额。公共菜选择接口已提供；当前页面保留原有新增原创菜入口，尚无公共菜选择界面。

参考：[cpp-httplib](https://github.com/yhirose/cpp-httplib)、[MySQL C API](https://dev.mysql.com/doc/c-api/8.4/en/)、[微信登录凭证校验](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)。
