# 南通中考英语模拟训练 · 部署指南

## 架构
- 单服务（前端静态 + 后端 API 同进程），完全复用 login-dsm 排课系统的部署模式。
- 后端：`server.mjs`（Node 22 内置 http，零业务依赖）
  - 本地无 `DATABASE_URL` → 用 `node:sqlite`（`data/store.db`）
  - 云端设 `DATABASE_URL` → 自动切 PostgreSQL（持久化账号/错题/历史/画像）
- 前端：`app/`（原生 HTML/CSS/JS），由后端静态托管
- 题库：`app/papers.json`（460 题，含五维 tags），经 `GET /api/questions` 下发

## 本地运行
```bash
cd mock_papers
npm install          # 仅安装 pg（云端用，本地也会装但不影响）
node --experimental-sqlite server.mjs      # 默认 http://localhost:3000
```
浏览器打开 http://localhost:3000/ （后端会托管 app/index.html）。

## 上线到 Render（独立新服务）

### 阶段 0：推到 GitHub（本目录还不是 git 仓库）
```bash
cd /Users/flying/WorkBuddy/2026-09-12-15-03-09/mock_papers
git init
git add .
git commit -m "南通中考英语模拟训练 v1.0"
# 去 github.com 新建仓库（建议名 nt-eng-trainer，空仓库不要勾 README）
git branch -M main
git remote add origin https://github.com/<你的用户名>/nt-eng-trainer.git
git push -u origin main
```
> .gitignore 已排除 node_modules/、data/、*.log，不会把数据库和依赖推上去。
> `render.yaml` 未硬编码分支，会直接用仓库默认分支（main）。

### 阶段 1：准备持久化数据库（拿 DATABASE_URL，强烈建议）
- 推荐 **Neon**（免费且不过期）：neon.tech 注册 → New Project → 复制 **psql 连接串**（形如 `postgresql://user:pass@host/db?sslmode=require`）。
- 不填也可运行，但用户数据存于临时 SQLite，free plan 重启即丢。

### 阶段 2：Render 部署
**方式 A：Dashboard Blueprint（推荐）**
1. 登录 render.com → New → **Blueprint** → 连接 GitHub → 选择 `nt-eng-trainer` 仓库 → 识别到 `render.yaml` → Create New Service。
2. 部署启动后进入服务 → **Environment** → Add Environment Variable：
   - `DATABASE_URL` = 阶段 1 复制的 Neon 连接串（sync:false，需手动填）。
   - 顺手确认 **Node Version** 为 `22.x`（按 package.json 的 engines 会自动选，但建议核对一眼；若不是，加 `NODE_VERSION=22`）。
3. 保存后点 **Manual Deploy / Redeploy**。
4. 构建完成，访问 `https://nt-eng-trainer.onrender.com`。

**方式 B：Render CLI**
```bash
npx -y -g render
render login          # 浏览器授权（需本人操作）
render blueprint launch
# 之后在 Dashboard 补 DATABASE_URL，再 Redeploy
```

> 免费版有冷启动：闲置约 15 分钟后会休眠，首次访问需等 30~60 秒唤醒。

### 方式 B：用 Render CLI
```bash
npx -y -g render   # 安装 CLI
render login        # 浏览器授权（需你本人操作）
render blueprint launch   # 按当前目录 render.yaml 创建
# 然后在 Dashboard 补 DATABASE_URL
```

## 接口清单
| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | /api/questions | 题库（完整 papers.json） | 否 |
| POST | /api/auth/register | 注册，返回 token | 否 |
| POST | /api/auth/login | 登录，返回 token | 否 |
| POST | /api/auth/logout | 登出（作废 token） | 是 |
| GET | /api/me | 当前用户+画像 | 是 |
| GET/PUT | /api/wrong | 错题本 | 是 |
| GET/PUT | /api/history | 练习历史 | 是 |
| GET/POST | /api/profile | 用户画像 | 是 |
| GET | /health | 健康检查 | 否 |

## 数据说明
- 未登录：错题/历史/画像存浏览器 localStorage（guest，满足"本地保存"旧需求）。
- 已登录：上述数据经 token 鉴权后持久化到服务端数据库，按用户名隔离、跨设备可用。
