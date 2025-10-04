# MusicMark

一个极简自建“听歌记录”服务：
- Basic 认证接收接口（适合手表/设备上报）
- 网页登录查看记录
- 管理员用户管理（创建用户、重置密码）
- 纯 JS 文件存储（lowdb json），零编译，跨平台易部署

## 本地快速开始（Windows）
1) 安装依赖
```bash
npm install
```
1) 创建 `.env`
```
PORT=3000
SITE_NAME=MusicMark
SESSION_SECRET=please_change_me
DATA_DIR=./data
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```
1) 启动开发
```bash
npm run dev
```
打开 `http://localhost:3000`，使用 `admin/admin123` 登录（请在“用户管理”重置密码）。

## API（设备/手表上报）
认证：HTTP Basic（用户名/密码与网页端一致）
- 探活：`GET /api/ping`
- 上报：`POST /api/listens`（JSON）
```
{
  "title": "歌曲名",             // 必填
  "artist": "作者名",            // 可选
  "album": "专辑名",             // 可选
  "source": "watch",            // 可选，默认 watch
  "started_at": 1719830400,      // 秒级UNIX或ISO字符串
  "duration_sec": 210,           // 可选，秒
  "external_id": "可选外部ID"    // 可选
}
```
去重：`user + title + artist + album + started_at` 唯一。

示例（curl）：
```bash
curl -u "username:password" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Yesterday",
    "artist":"The Beatles",
    "album":"Help!",
    "started_at": "2024-07-01T12:00:00Z",
    "duration_sec": 125,
    "source": "watch"
  }' \
  http://localhost:3000/api/listens
```

## 网页端入口
- 登录：`/login`
- 记录：`/dashboard`
- 管理（admin）：`/admin/users`

## 部署（宝塔/BT）
1) 安装 Node/PM2；拉取代码后 `npm ci`（或 `npm install`）
2) 创建 `.env`，设置强随机 `SESSION_SECRET` 与 `ADMIN_*`
3) 创建 `DATA_DIR`（默认 `./data`），授予读写
4) 启动：`pm2 start npm --name musicmark -- run start`
5) 站点反向代理到 `127.0.0.1:3000`，开启 HTTPS

建议：仅开放 80/443；定期备份 `data/app.db`。
