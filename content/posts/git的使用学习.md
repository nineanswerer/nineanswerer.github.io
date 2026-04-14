---
title: "Git 深度学习与 Hugo 博客搭建：从 404 到正式上线"
date: 2026-03-18T21:01:08+08:00
draft: false
summary: "记录从零搭建个人博客的全过程，涵盖 Hugo 环境配置、GitHub Actions 自动化部署及 Git 核心工作流解析。"
categories: ["技术总结"]
tags: ["Git", "Hugo", "GitHub Pages"]
showToc: true
TocOpen: false
---

## 前言

2026 年 3 月，我正式开启了个人博客。这不仅是一个技术阵地，更是一个完整的项目实战。从最初的 `InternetOpenUrl() failed` 报错，到解决编码乱码，再到处理 GitHub Actions 冲突，每一步都是成长的印记。

---

## 1. 为什么选择 Git + Hugo 架构？

在动态博客（如 WordPress）和静态博客（SSG）之间，我选择了后者。其核心逻辑在于：
* **极致性能**：Hugo 基于 Go 语言，构建速度极快，被称为“世界上最快的静态网站生成器”。
* **Git 即工作流**：每一篇博文都是一个 Git 提交，版本管理天然存在。
* **零维护成本**：无需担心数据库安全，无需购买昂贵的服务器，GitHub Pages 提供了稳定的托管。



---

## 2. Git 核心深度解析

在搭建过程中，我深刻理解了 Git 的三个区域：**工作区 (Workspace)**、**暂存区 (Index)** 和 **本地仓库 (Repository)**。

### 常用“三板斧”
1. **暂存修改**：`git add .` —— 将代码改动标记为“待提交”。
2. **存档记录**：`git commit -m "feat: 新增博文"` —— 创建一个永久的快照。
3. **云端同步**：`git push origin main` —— 将本地成果同步至全球。

### 进阶黑技巧
* **修正上一条提交**：如果你像我一样写错了 commit 信息，可以用 `git commit --amend` 瞬间“毁尸灭迹”。
* **空提交触发部署**：当 GitHub Actions 卡住时，使用 `git commit --allow-empty -m "trigger deploy"` 可以强行重启自动化流水线。

---

## 3. 那些“折磨”过我的坑 (Troubleshooting)

### 3.1 字符编码的背叛
在 PowerShell 中使用 `echo` 追加配置时，默认的 `UTF-16` 编码会导致 Hugo 报错 `invalid character at start of key`。
* **教训**：永远使用 `UTF-8` 编码，并在 VS Code 中确认文件右下角的编码格式。

### 3.2 GitHub Pages 的“套娃”网址
我最初创建的仓库名是 `nineanswer.github.io`（少了个 er），导致网址变成了重复的 `.../nineanswer.github.io/`。
* **解决**：仓库名必须**严格等于** `用户名.github.io`。改名后，别忘了更新本地的远端地址：
  ```bash
  git remote set-url origin https://github.com/nineanswerer/nineanswerer.github.io.git
  ```

### 3.3 CI/CD 版本冲突
GitHub Actions 默认的 Hugo 版本过低（v0.121），无法解析我的新主题。方案：在 `.github/workflows/deploy.yml` 中将 `HUGO_VERSION` 强制指定为 0.157.0。

## 4. 博客美化：PaperMod 主题配置
我选择了极简且强大的 `PaperMod` 主题。通过修改 `hugo.toml`，我开启了 `Profile Mode：`
```bash
[params.homeInfoParams]
    Title = "你好，我是 NineAnswerer 👋"
    Content = "Focus on Computer Science | Big Data | AI"

[[params.socialIcons]]
    name = "github"
    url = "https://github.com/nineanswerer"
```
## 5. 未来展望
博客的搭建只是第一步。接下来的日子里，我计划围绕以下领域进行持续输出：

* 大数据生态：Hadoop, HBase 与 Flume 的实战笔记。

* AI 与 机器人：关于视觉 SLAM 与 四足机器人的项目复盘。

* Minecraft 模组开发：关于《时空绘卷》的设计思路。

**感谢你见证我博客的诞生。如果你也想搭建自己的博客，欢迎随时交流！**

“Stay hungry, stay foolish. 但首先，Git 要用对。” —— NineAnswerer