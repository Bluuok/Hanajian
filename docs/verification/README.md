# 首页与原文定位验证

所有截图来自本地 Electron、仓库合成数据，不包含私人聊天。生成脚本为 tests/e2e/topics-workspace.spec.ts。可打开 [前后及参考图对照](compare.html)。

| 内容 | 文件（homepage-after/） | 核验 |
| --- | --- | --- |
| 首页三尺寸 | shiyu-home-1073.png / 1280.png / 1440.png | 关键词、日期、生成、摘要、证据与来源联动；人物不盖住主按钮；不伪造分类、点赞和相关话题。 |
| 聊天三尺寸 | shiyu-chat-1073.png / 1280.png / 1440.png | 目标原文高亮、历史提示与返回最新消息；左下伙伴保持无框。 |
| 小窗口 | shiyu-home-compact.png | 700×600，无水平溢出，隐藏大插画；核心操作滚动可达。 |
| 缩放 | shiyu-home-zoom125.png / shiyu-home-dpr2.png | CSS zoom=1.25 与 CDP deviceScaleFactor=2；验证软件排版，不作为真实硬件 DPI 结论。 |
| 状态 | shiyu-home-initial.png / loading.png / empty.png / ai-failed.png / error.png | 未查询、加载、真空结果、AI 未核对降级、依赖失败。 |
| 旧深色配置 | shiyu-home-dark.png | 实际渲染保持 light；名称中的 dark 表示旧输入配置。 |

1073×668 的 CSS 视口在 Windows 截图中会取整为 1073×669；1280×800、1440×900 与 700×600 截图尺寸相符。DPR 仿真截图的实际位图像素还受 Electron/Windows 原生缩放影响，不宣称为 2560×1600。其他状态截图沿用默认原生窗口。

1073 宽度首屏能看到证据与原文区域，但完整内容需要滚动。1440 宽度展示两条测试证据和可靠空态。参考图中的大量示例群聊、标签和反馈计数没有照搬为业务数据。

验证命令：

- npm run typecheck
- node node_modules/vitest/vitest.mjs run --config vitest.unit.config.ts tests/unit/topic-digest.test.ts tests/unit/topic-package.test.ts tests/unit/topic-retrieval-hardening.test.ts tests/unit/topic-center.test.ts tests/unit/settings-store.test.ts tests/unit/topic-source-navigation.test.ts（52 项）
- node node_modules/vitest/vitest.mjs run --config vitest.component.config.ts tests/component/topics-homepage.test.tsx tests/component/appearance-settings.test.tsx tests/component/ask-ai-workspace.test.tsx（13 项）
- node node_modules/electron-vite/bin/electron-vite.js build
- node node_modules/@playwright/test/cli.js test tests/e2e/topics-workspace.spec.ts tests/e2e/topic-digest.spec.ts tests/e2e/companion.spec.ts（11 项）
- node node_modules/@playwright/test/cli.js test tests/e2e/image-key-guidance.spec.ts（缺密钥连接提醒与图片错误设置入口，2 项）
- 本轮改动代码的 ESLint 与 git diff --check。

覆盖人工修改失效、导出旧契约、日期拒绝、订阅范围与历史、真实记录二次读取、同秒重复 ID、未加载历史、缺失原文、切群延迟响应取消、返回最新消息、全页面透明伙伴及白色模式。测试在沙箱外的本地 Electron 中运行；沙箱内窗口加载超时不作为业务失败结论。

局限：没有真实微信或真实 AI 服务测试；没有真实投递；没有 Windows 安装包或 macOS 图片基线验证。详细要求对照见 [验收记录](../homepage-implementation-audit.md)。
