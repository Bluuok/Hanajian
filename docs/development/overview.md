# 开发、测试与构建

本文面向希望参与花笺开发、验证文档或维护集成的贡献者。普通用户请从[第一次使用](../user-guide/getting-started.md)开始。

## 技术基线

- Electron + React + TypeScript；
- Node.js 24、pnpm 7.33.7；
- 平台对应的 Electron/native 构建环境。

产品文档的事实来源优先级是：当前源码 → 当前 UI/Renderer → 测试 → package/config → README/docs → 历史资料。功能、API、版本、隐私和兼容性变更时，不要只改 README。

## 本地开发

```bash
pnpm install
pnpm dev
```

本地依赖安装和 Electron 二进制下载异常，请查看[本地启动排障](./local-startup-troubleshooting.md)。

常用检查：

```bash
pnpm typecheck
pnpm test:unit
pnpm test:component
pnpm test:integration
pnpm test:e2e:build
```

完整测试入口 `pnpm test` 还会运行 Skill 安装指令、构建和 Playwright 测试；需要对应平台环境。桌面启动与打包无需构建微信机器人连接器。

## 代码变更对应文档

| 代码区域                                                  | 需要同步检查的文档                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/shared/ai-search.ts`、AI Search pipeline             | `user-guide/ai-search.md`、`concepts/answer-sources.md`                    |
| `src/shared/knowledge.ts`、`src/main/knowledge/`          | `user-guide/knowledge.md`、`concepts/how-it-works.md`                      |
| `src/shared/voice-recognition.ts`                         | `user-guide/voice.md`                                                      |
| `src/shared/group-report.ts`、报告 UI                     | `user-guide/report.md`、API/Agent 文档                                     |
| `src/shared/export.ts`、导出服务/UI                       | `user-guide/export.md`                                                     |
| `src/main/services/recall-archive-service.ts`、防撤回设置 | `user-guide/recall-protection.md`、`user-guide/privacy.md`                 |
| `src/shared/local-api-test.ts`、`src/main/http-server.ts` | `agent/api.md`、`api-security.md`、打包 Skill                              |
| 桌面总结与记忆提取                                        | `agent/agent-hub.md`、`user-guide/local-notes.md`、`user-guide/privacy.md` |
| 平台解析、媒体保存与笔记                                  | `user-guide/platform-integration.md`                                       |
| 设置导航、连接页面                                        | `user-guide/getting-started.md`、`docs/README.md`                          |

## 上游能力与本地兼容

本轮参考 TraceDigest [v2.0.0 固定提交](https://github.com/gmll-star/TraceDigest/tree/5dc73a8c0e587db390a08c96ff9b344784454ca2)，保留花笺按账号隔离的加密数据库密钥、普通图片查看、显式图片理解及受 Token 保护的媒体 API。没有采用明文密钥导出，也没有移除这些已存在的图片能力；“问问 AI”当前没有普通微信图片读取工具。微信机器人登录、实时处理和消息发送已移除。

安全边界继续采用 loopback 默认监听、Bearer Token、精确 Origin 检查及安全存储不可用时停用 API；保留旧安装身份、环境变量回退和本地 longContext 模型配置。当前 API Center 未挂载，只能为已有授权集成描述实际可用流程。

## 文档检查

提交文档变更前至少执行：

```bash
git diff --check
rg -n "v2\.1\.7|Hanajian|迹忆|mcpServers|无鉴权" README.md docs --glob '*.md' --glob '!DOCUMENTATION_AUDIT.md' --glob '!development/overview.md'
```

历史迁移说明可以出现旧版本号；正式使用指南不要把过时版本写成当前版本。负向澄清“6131 不是 MCP Server”可以保留，以防用户照抄错误配置。
