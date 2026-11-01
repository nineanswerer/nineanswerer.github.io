# 九术 · 工程档案

九术 / NineAnswerer 的个人网站与博客。以项目案例为中心，记录真实问题、技术取舍、验证结果和当前边界。

线上地址：https://nineanswerer.github.io/

## 技术栈

- Astro + TypeScript，静态输出
- Content Collections 管理项目与文章
- 原生 CSS，深浅色主题与响应式布局
- 构建时生成 RSS 与 sitemap
- Playwright Core + 本机 Edge 进行界面验证
- GitHub Actions 部署到 GitHub Pages

## 本地开发

要求 Node.js 24 与 npm。

```bash
npm ci
npm run dev
```

开发服务器支持 Astro 的 host / port 参数：

```bash
npm run dev -- --host 127.0.0.1 --port 4321
```

## 检查与构建

```bash
npm run check
npm run build
npm run preview
```

界面测试使用本机 Microsoft Edge，因此不要求额外下载浏览器二进制：

```bash
npm run test:ui
```

测试脚本会自行启动和停止临时服务器，截图保存在 `test-results/`。

## 内容结构

```text
src/
├── components/          # 导航、项目行、文章列表等
├── content/
│   ├── projects/       # 项目案例，含职责、技术栈和验证数据
│   └── writing/        # 技术文章
├── layouts/            # 基础页面与文章布局
├── pages/              # 静态路由、动态详情与 RSS
├── styles/global.css   # 视觉系统
├── config.ts           # 站点公开信息
└── content.config.ts   # 内容 schema
public/
├── files/              # 可下载的学习资料
└── images/             # 公开展示图
tests/ui.mjs            # 响应式与交互检查
```

新增项目时，在 `src/content/projects/` 添加 Markdown。请明确独立开发或派生贡献，不把未验证能力写成结论。新增文章时，在 `src/content/writing/` 添加 Markdown；`draft: true` 可阻止发布。

## 部署

推送到 `main` 会触发 `.github/workflows/deploy.yml`。工作流执行依赖安装、Astro 检查、构建和 Pages 部署。仓库的 Pages 发布来源需设置为 **GitHub Actions**。

## 内容原则

- 不虚构性能、用户量、经历或联系方式。
- 单次运行记录不写成通用性能结论。
- 公开截图先移除本机路径等私人信息。
- 派生项目保留上游来源和个人贡献边界。
