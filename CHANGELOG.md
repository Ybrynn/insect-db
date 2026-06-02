# 昆虫信息数据库 — 项目改动日志

## 说明
- 本日志记录从项目生成至今的所有代码改动
- **pre-Git 阶段**（2026-05-21 之前）：项目在 OpenCode 中从零生成，无 git 记录
- **Git 阶段**（2026-06-01 起）：git 仓库初始化后的所有提交记录

---

## 2026-06-02

| 时间 | 提交 | 改了什么 | 涉及文件 |
|------|------|----------|----------|
| 16:05 | `017d8de` | 🔧 修复 PWA 安装版不更新：升级 Service Worker 缓存版本 v1→v2 | `public/sw.js` |
| 15:53 | `632ef58` | 🐛 修复线上部署 502 崩溃：ALTER TABLE 移到 CREATE TABLE 之后，解决新数据库表不存在的问题 | `server.js` |
| 15:42 | `4315bc5` | ✨ 大更新：新增用户权限系统（can_edit / can_upload）、密码显示/隐藏切换、侧栏按钮改 SVG、用户管理页面权限开关、配色方案优化 | `server.js`, `insects.db`, `public/index.html`, `public/js/app.js`, `public/css/style.css` |

---

## 2026-06-01

| 时间 | 提交 | 改了什么 | 涉及文件 |
|------|------|----------|----------|
| 19:43 | `11d18fc` | ✨ 功能更新：添加标本状态字段（在库/不在库/外借）、分类筛选增强 | `.gitignore`, `public/css/style.css`, `public/index.html`, `public/js/app.js` |
| 16:08 | `cf8b794` | 📱 PWA 支持：添加 Service Worker，Android 手机可弹出"安装应用"提示 | `public/sw.js`, `public/index.html` |
| 15:48 | `059fbef` | 🎨 网站图标：手绘 SVG 昆虫图标 + favicon + Apple Touch Icon + webmanifest | 10 个文件（图标生成脚本及所有图标格式） |
| 15:14 | `82bb5fe` | 🐛 修复部署失败：删除 Windows 专用 PowerShell build 脚本（Zeabur 是 Linux 不识别） | `package.json` |
| 14:25 | `f22aa40` | 🚀 **首次部署提交**：缓存禁用、DATA_DIR 环境变量支持、端口/地址环境变量支持、自动创建数据目录 | 项目初始化提交（9 个文件，4862 行） |

| 时间段 | 改动内容 |
|--------|----------|
| 14:00–14:25 | 🔗 GitHub 仓库创建 + 初始化 git + 代码适配 Zeabur 持久化部署 |
| 13:54–14:00 | 📖 学习 Git、GitHub、Zeabur 基础知识 |
| 13:13–13:54 | 🏗️ 讨论部署方案：云服务器 vs PaaS 平台，最终选 Zeabur |

---

## pre-Git 阶段（2026-05-21 之前及期间）

| 时间段 | 大致内容 |
|--------|----------|
| 项目生成 | OpenCode 从零生成昆虫信息数据库完整项目，包含：Express.js 后端、SQLite 数据库、前端界面、用户认证、图片上传、以图搜图（GWO 灰狼优化算法） |
| 2026-05-21 之前 | 项目功能迭代开发 |
| 2026-05-21 13:13 | 用户在 OpenCode 中修改代码，开始讨论线上部署方案 |
| 2026-05-21 16:16–18 | 详细讨论云服务器 vs PaaS 部署优劣 |
| 2026-05-22 12:22 | 讨论 Zeabur vs 阿里云部署对比，决定用 Zeabur |

---

## 实时更新说明

之后每次 `git push` 同步代码后，本文件会自动更新最新记录。如需查看完整改动细节，可运行：

```bash
git log --oneline --graph --all
```
