# 九术的工作台

一个可以持续生长的个人网站：项目是证据，写作是过程，首页是可替换的视觉表达。Astro 静态输出，内容与视觉模块分开，无数据库和付费运行服务。

线上地址：https://nineanswerer.github.io/

## 本地编辑

要求 Node.js 24。先 `npm ci`，再运行：

```bash
npm run dev
```

当前锁定的 Astro 7.4.4 在此 Windows 环境的开发模块加载器中出现 CommonJS 兼容错误（`yaml` / `picomatch`）。标准热更新尚未修复；可使用已验证的回退方式：

```bash
npm run dev:static -- --host 127.0.0.1 --port 4326
```

它监听 `src/`、`public/` 和配置文件，变更后自动重建到独立的 `.preview/`，刷新浏览器即可查看。它不提供 HMR，不覆盖生产 `dist/`。依赖和配置发生变化时建议重启进程。没有修改 `node_modules`，也没有引入第三方开发服务器。

```bash
npm run validate        # 选择逻辑测试、类型/内容检查、构建、链接和体积预算
npm run preview         # 查看生产 dist，先运行 build
npm run test:ui         # 额外的 Edge 界面检查，要求本机安装 Edge
```

## 日常维护只改内容

| 要做什么 | 改哪里 |
| --- | --- |
| 新增项目、职责、状态、贡献、发布地址 | `src/content/projects/*.md` |
| 新增长文 / 碎片 | `src/content/writing/*.md` / `src/content/notes/*.md` |
| 首页标题、近况、展示数量、视觉开关 | `src/content/home/index.json` |
| 当前在做的事 | `src/content/now/current.md` |
| 名称、网址、导航 | `src/config.ts` |
| 颜色、字体和版心 | `src/styles/global.css` 的设计变量 |

这些内容也映射到现有 `/admin/` 后台。后台沿用仓库原有的 GitHub 登录与发布流程，没有替换认证。后台发布会提交到远端仓库并触发 `main` 部署；本地试改请编辑工作区文件。

新增项目的最小示例（文件名即 URL 标识，建议小写英文与短横线）：

```yaml
---
title: 项目名称
tagline: 一句话说明它解决什么问题。
description: 用真实信息介绍项目。
date: 2026-11-06
draft: true
featured: false
status: 开发中
role: 说明你实际承担的工作
stack: [TypeScript]
repo: https://github.com/nineanswerer/仓库名
order: 10
---

## 为什么做

## 如何实现与验证

## 当前边界
```

完成后将 `draft` 改为 `false`。项目会自动进入首页、项目架、搜索和详情路由；文章与碎片会进入博客、搜索和 RSS。草稿在这些公开入口统一过滤。文章关联项目时，`project` 填项目文件名，去掉 `.md`。

首页按 `order` 升序展示；同序按标识稳定排序。重点项目优先选 `featured: true` 中排序最前的一项，未指定则选第一个公开项目。首页默认最多展示 6 项，其余仍在项目架完整展示。零项目、零文章均有空状态，单项目不会重复展示。

没有专门封面的项目自动使用通用图形。需要定制时添加可选字段：

```yaml
presentation:
  kind: generic          # generic / translation / extraction / flow
  eyebrow: DESKTOP TOOL
  caption: 首页可选短说明
  titleLines: [项目, 名称] # 只影响重点标题，最多三行
  cover:
    src: /images/example.webp
    alt: 图片实际展示的内容
    width: 1200
    height: 800
    note: 可选的图片来源或处理说明
```

无需为了上首页而填图；缺省图形是正式支持的呈现方式。`metrics` 只记录可验证数字，`evidenceNote` 解释统计范围。具体截图导览等特殊模块可以放在项目详情里，不把某个项目的验证说明套到其他项目上。

## 结构与扩展边界

```text
src/content.config.ts           内容 schema，构建时校验
src/content.ts                  统一公开项目与写作查询
src/home-model.ts               重点选择、排序、数量限制
src/pages/index.astro           首页内容编排
src/components/home/            可复用的重点项目与项目卡片
src/components/KineticSculpture.astro  可开关的视觉组件
src/scripts/sculpture.ts         独立绘图、交互及资源释放
src/scripts/home-motion.ts       入场、视差与偏好响应
src/styles/global.css           设计变量、基础元素
src/styles/shared.css           全站导航、字体、页脚
src/styles/pages.css            列表、项目与文章详情
src/styles/home.css             仅首页加载的构成与动效
scripts/verify-build.mjs         静态链接、资源和首页体积检查
```

保持现有 Astro、TypeScript、原生 CSS 和 Markdown。增加普通内容不改页面；增加一种视觉卡片只扩展 `presentation.kind`、对应组件和后台字段；更换首屏艺术效果只替换雕塑组件与脚本。遇到真实需求再增加新栏目或数据服务。

## 动效与性能约束

- 首页 `visual.enabled: false` 显示静态构成；`autoplay: false` 关闭默认旋转。
- 无 JavaScript 或 Canvas 不可用时，文字、导航、项目和 CSS 构成都可用，交互按钮不会误导访客。
- 尊重系统减少动态效果设置，页面打开期间更改偏好也会生效。暂停状态在当前浏览器会话内记忆。
- 雕塑离屏或标签页隐藏时停止循环；组件释放时移除监听器和观察器。移动端使用较少网格与较低帧率上限。
- 不引入动效框架、全屏视频或第三方运行接口。首页初始脚本预算为 **12 KiB gzip**，CSS 为 **18 KiB gzip**。检查统计 HTML 引用和内联的脚本、样式；不是 FPS、Lighthouse 或整站图片体积的测量。

## 验证与发布

`npm run validate` 在本地和 GitHub Actions 使用相同的检查。CI 检查站内链接、锚点、分享图与页面资源，并限制首页脚本和样式的体积。界面检查单独运行。

推送到 `main` 触发 `.github/workflows/deploy.yml`，检查通过后部署 GitHub Pages。仓库 Pages 发布来源应为 **GitHub Actions**。本地预览不会自动推送或发布。

## 后续维护

- 项目有可验证的进展时，更新状态、发布地址和验证范围。复盘与短笔记的 `project` 填项目文件名，发布后会出现在项目详情的延伸阅读中。
- 近况发生变化时，更新现在页和首页状态。文章通过 RSS 分发，旧地址通过现有跳转页继续访问。
- 发布前运行 `npm run validate`，再预览首页和改动页面。发布后从 Actions 确认部署成功并打开线上链接。若发布出现回归，回退对应的发布提交，再由 Actions 重新部署。

内容维护原则：不虚构性能、用户量或经历；截图移除私人路径；派生项目保留上游和个人贡献范围；单次运行记录不写成普遍性能结论。
