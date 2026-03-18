---
title: "Hugo + GitHub Pages 零基础搭建与进阶全攻略：从踩坑到正式上线"
date: 2026-03-18T21:47:44+08:00
draft: false
tags: ["Git", "Hugo", "GitHub Pages"]
categories: ["Tech"]
author: "NineAnswerer"
showToc: true
summary: "记录从零搭建个人博客的全过程，涵盖 Hugo 环境配置、GitHub Actions 自动化部署及 Git 核心工作流解析。"
cover:
    image: "/images/cover.png" # 🚨 注意：这里不要写 /static，Hugo 会自动映射
    alt: "Hugo 配置教程封面图"    # 图片的替代文字（SEO 用）
    relative: false              # 声明这是绝对路径（相对于网站根目录）
---

> **写在前面**：这不仅是一份教程，更是一份“避坑指南”。我会告诉你 **怎么做**，更会告诉你 **为什么要这样做**。文中所有“红色警示”都是我亲身踩过的血泪坑，希望能帮你节省至少 4 小时的排错时间。

---

## 一、 环境准备：别在第一步就“劝退”

### 1.1 安装包：必须选 Extended 版
去 [Hugo Releases](https://github.com/gohugoio/hugo/releases) 下载时，文件名必须带 **`extended`**（如 `hugo_extended_0.157.0_windows-amd64.zip`）。
* **原因**：像 PaperMod 这样主流的主题需要处理高级样式（Sass/SCSS），普通版 Hugo 无法编译，会导致网页打开后“一片空白，没有样式”。

### 1.2 环境变量：让系统认识 `hugo`
解压到 `D:\hugo`，将该文件夹路径加入系统变量 **Path**。
* **验证**：打开终端输入 `hugo version`。
* **🚨 避坑**：如果报错“找不到命令”，请**彻底重启** VS Code 或终端。环境变量不会在已打开的窗口中实时生效。

### 1.3 终端选择：强制推荐 Git Bash
* **不要用 PowerShell！** 它的默认编码是 UTF-16，会导致生成的 Markdown 文件出现 `ÿ` 等乱码。
* **推荐**：安装 Git 后自带的 **Git Bash**。它对 Hugo 最友好，且命令逻辑与服务器一致。

---

## 二、 项目初始化：搭建骨架

### 2.1 创建站点
```bash
hugo new site myblog
cd myblog
```

### 2.2 引入主题（推荐子模块方式）
以 PaperMod 为例，建议使用 `git submodule`。
```bash
git init
git submodule add [https://github.com/adityatelange/hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) themes/PaperMod
```
* **为什么？** 这样你的主题就是一个独立的链接，以后只需一行命令就能更新主题，且不会弄乱你自己的代码。

---

## 三、 `hugo.toml` 配置：网站的“大脑”

打开根目录的 `hugo.toml`，这是最核心的步骤。请参考以下标准配置：

```toml
baseURL = '[https://nineanswerer.github.io/](https://nineanswerer.github.io/)' # 🚨 结尾必须带斜杠！
languageCode = 'zh-cn'
title = 'NineAnswerer 的技术笔记'
theme = 'PaperMod'

[params]
    # 目录配置
    ShowToc = true          # 自动生成目录
    TocOpen = true         # 默认展开
    # 首页个人信息
    homeInfoParams:
        Title = "你好，我是 NineAnswerer 👋"
        Content = "Focus on Computer Science | Big Data | AI"
    # 社交图标
    socialIcons:
        - name: "github"
          url: "[https://github.com/nineanswerer](https://github.com/nineanswerer)"

[outputs]
    home = ["HTML", "RSS", "JSON"] # 开启搜索功能必须加 JSON
```

### 🚨 实战血泪提醒：
1. **路径重复 Bug**：如果你的网址变成了 `.../github.io/github.io/`，通常是因为 `baseURL` 写成了仓库名。对于主站，`baseURL` 必须是干净的 `https://用户名.github.io/`。
2. **仓库名**：在 GitHub 上创建的仓库名必须**严格等于** `用户名.github.io`。多一个字符（比如我曾错打成 `nineanswer.github.io`）都会导致 404。

---

## 四、 内容创作：Markdown 实战

### 4.1 创建第一篇文章
```bash
hugo new posts/my-first-blog.md
```

### 4.2 关键参数：`draft` (草稿)
在文章头部的元数据中：
* **🚨 必看**：部署到线上前，必须将 `draft` 改为 **`false`**。否则 GitHub Actions 虽然显示成功，但你的博客页面依然是空的。

### 4.3 资源引用
图片统一放 `static/images/`。在 Markdown 中引用时，路径直接写 `/images/xxx.png`。Hugo 会在编译时自动去掉 `static` 这一层。

---

## 五、 自动化部署：GitHub Actions

### 5.1 创建流水线
在项目根目录创建 `.github/workflows/deploy.yml`。

### 5.2 核心脚本优化
为了避免构建失败，请确保脚本中的 Hugo 版本足够新：
```yaml
- name: Setup Hugo
  uses: peaceiris/actions-hugo@v2
  with:
    hugo-version: 'latest' # 🚨 确保使用最新版
    extended: true          # 🚨 必须开启扩展版支持
```

---

## 六、 常见问题排坑汇总 (FAQ)

### 1. 为什么本地预览正常，线上 404？
* **检查点 A**：`hugo.toml` 里的 `baseURL` 是否写对？
* **检查点 B**：GitHub 仓库 Settings -> Pages 里的 Source 是否选对了分支（通常是 `gh-pages`）？

### 2. 为什么修改了 CSS 没反应？
* **解决**：按下 `Ctrl + F5` 强制刷新。浏览器缓存经常会让你觉得代码没生效。

### 3. Git 拒绝推送 (Non-fast-forward)？
* **场景**：你在 GitHub 网页上直接改了文件，本地没同步。
* **解决**：先 `git pull --rebase origin main`，再 `git push`。

---

## 七、 写在最后

搭建博客的过程本质上是**熟悉工具链**的过程。
1. **修改代码** → 2. **本地预览 (`hugo server`)** → 3. **Git 提交 (`add/commit/push`)** → 4. **线上验证**。

当你走通了这一套流程，你就已经掌握了现代前端开发最基础的 CI/CD 思想。

> “Stay hungry, stay foolish. 但首先，Git 要用对。” —— NineAnswerer
```