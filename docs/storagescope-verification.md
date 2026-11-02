# StorageScope 验证记录（内部草稿）

> 本文件仅用于整理和补全验证证据，暂不在网站公开页面中添加入口。
> 2026-11-02 根据历史任务目录中的源码快照、产品与验证文档、脚本、计时文件和截图补全。本次只整理资料，没有重新运行对应测试。
> 无法确认的字段保持空白，不使用提交日期或发布日期代替测试日期。
> 原始资料选存于 `storagescope-evidence/`。脚本保留历史目录结构，仅作验证证据，不作为公开复现脚本。

## 验证记录 01：大目录扫描与结构展示

- 记录类型：本机记录／真实目录验证
- 验证版本：
- 对应代码提交：
- 测试环境：拯救者 R7000，Windows 10，RTX 4060。来源为历史源码中的 `PRODUCT.md`。
- 测试日期：
- 测试内容：真实目录扫描、结构展示，以及一次从启动扫描到结构页的自动化流程。
- 预期结果：完成真实目录扫描并进入目录结构页，记录本次墙钟耗时。
- 实际结果：在一个包含 307,630 个文件、78.9 GB 的 `D:\mc` 目录上完成扫描与结构展示验证。计时文件记录 24 秒，包含自动化固定等待，只作为单次运行记录。
- 截图或日志链接：[24 秒计时](storagescope-evidence/large-scan-seconds)、[目录结构截图](storagescope-evidence/large-scan-structure.png)、[历史验证汇总](storagescope-evidence/source-design.md)。
- 尚未验证：不同设备上的重复测量；固定环境、预热条件和重复测量下的性能结论。

## 验证记录 02：自动化测试与构建检查

- 记录类型：自动化测试与构建检查
- 验证版本：
- 对应代码提交：
- 测试环境：
- 测试日期：
- 测试内容：前端 lint/build、14 项前端模型测试、29 项 Rust 核心测试、2 项桌面桥接测试。
- 预期结果：前端 lint 和生产构建通过；14 项前端模型测试、29 项 Rust 核心测试与 2 项桌面桥接测试全部通过。
- 实际结果：历史 `DESIGN.md` 记录上述检查全部通过；本次整理没有重新运行这些检查。
- 截图或日志链接：[历史验证汇总](storagescope-evidence/source-design.md)。本次资料中未找到原始控制台日志。
- 尚未验证：第三方环境复现。

## 验证记录 03：3D 真实窗口交互

- 记录类型：真实窗口验收
- 验证版本：
- 对应代码提交：
- 测试环境：Windows 桌面，PowerShell UI Automation；专项记录未单独注明系统版本与硬件。
- 测试日期：
- 测试内容：目录层级、纸雕模型、类型徽章、完整取景、悬停详情、点击下钻、Esc 返回、R 重置、滚动位置、滚轮缩放、标签避让与窄窗口布局。
- 预期结果：大目录可以完成结构导航；标签按可读性避让；下钻、返回、重置和缩放可用；窄窗口无整棵树横向溢出或外侧裁切。
- 实际结果：历史 `DESIGN.md` 记录五轮视觉迭代在 19 个文件、147.1 MB 的测试目录通过验收；`D:\mc` 大目录回归也通过上述交互检查。另有一份 1430 ms 的 3D 树调用计时文件，计时起止口径未记录，不纳入性能结论。
- 截图或日志链接：[历史验证汇总](storagescope-evidence/source-design.md)、[根节点视图](storagescope-evidence/large-tree-final-root.png)、[下钻视图](storagescope-evidence/large-tree-final-drill.png)、[Esc 返回视图](storagescope-evidence/large-tree-final-escape.png)、[窄窗口视图](storagescope-evidence/large-tree-final-narrow.png)、[1430 ms 计时](storagescope-evidence/large-tree-invoke-ms)。
- 尚未验证：不同设备上的重复验收；连续帧时间采样；普遍性能结论。

## 验证记录 04：清理真实窗口验收

- 记录类型：真实窗口验收（历史记录注明为当前桌面调试版本）
- 验证版本：
- 对应代码提交：
- 测试环境：Windows 桌面，PowerShell UI Automation；专项记录未单独注明系统版本与硬件。
- 测试日期：
- 测试内容：保留边界、分析后目录变化、回收站结果、快照比较、硬链接合并，以及执行后的候选状态重算。
- 预期结果：变化目录完整跳过；未变化的选中文件进入回收站；参考与排除目录保留；结果快照可与基准比较；3 个重复路径合并后共享硬链接实体并核实释放 4.0 MiB；合并后候选与基线同步重算。
- 实际结果：历史记录与脚本断言显示，变化目录完整跳过；2 个选中文件进入回收站并记为待清空 7.0 MiB；3 个 2.0 MiB 相同文件合并后路径全部保留并共享同一文件实体，核实释放 4.0 MiB 分配空间；合并复验后只剩 1 个大文件条目、0 个重复组。回收站样本为 8 个初始文件、16.0 MiB，另加日志文件和分析后新增的 36 B 文件。
- 截图或日志链接：[验证入口脚本](storagescope-evidence/run-trusted-cleanup-validation.ps1)、[回收站验证脚本](storagescope-evidence/verify-trusted-cleanup-ui.ps1)、[合并验证脚本](storagescope-evidence/verify-trusted-merge-ui.ps1)、[回收站结果快照比较](storagescope-evidence/cleanup-result-diff.png)、[合并结果截图](storagescope-evidence/merge-result.png)、[历史验证汇总](storagescope-evidence/source-design.md)。
- 尚未验证：第三方设备复现；所有特殊文件系统；回收站清空后的卷余量测量；普遍安全或性能结论。

## 验证记录 05：安装包本机构建

- 记录类型：本机构建
- 验证版本：
- 对应代码提交：
- 测试环境：
- 测试日期：
- 测试内容：正式 NSIS 安装包构建。
- 预期结果：生成 Windows x64 NSIS 安装包。
- 实际结果：历史 `DESIGN.md` 记录 NSIS 安装包已生成；历史任务目录保留安装包产物，发布信息文件记录 v0.1.0 的 NSIS 与 MSI 资产。本次没有重新构建或进行多设备安装验证。
- 截图或日志链接：[历史验证汇总](storagescope-evidence/source-design.md)、[发布信息存档](storagescope-evidence/storagescope-latest-release.json)。
- 尚未验证：多台设备安装与运行；第三方设备复现。

## 新增验证记录模板

- 记录类型：
- 验证版本：
- 对应代码提交：
- 测试环境：
- 测试日期：
- 测试内容：
- 预期结果：
- 实际结果：
- 截图或日志链接：
- 尚未验证的部分：
