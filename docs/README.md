# 花笺文档

花笺在本机整理聊天与公开平台内容。选择与你当前任务对应的入口：

- [第一次使用](./user-guide/getting-started.md)：启动、连接已有微信数据、配置模型。
- [桌面 AI 总结](./agent/agent-hub.md)：按群聊、时间或成员读取消息并总结。
- [知识笔记](./user-guide/local-notes.md)：二次筛选、选择格式与表达风格、核对草稿后写入 Markdown。
- [内容收藏](./user-guide/platform-integration.md)：解析抖音或小红书公开分享链接，保存媒体并生成笔记链接。
- [聊天检索知识库](./user-guide/knowledge.md)：聊天索引与检索，不同于保存 Markdown 笔记。
- [群聊日报](./user-guide/report.md)、[语音转文字](./user-guide/voice.md)、[导出聊天](./user-guide/export.md)。
- [数据、隐私与安全](./user-guide/privacy.md)、[常见问题与排查](./user-guide/troubleshooting.md)。

话题工作台支持核对原文、保存整理结果和本地定时订阅。AI 回答与订阅结果保存在本机；模型使用在设置中配置的服务。

## 外部 Agent 读取

[接入概览](./agent/overview.md)、[Reader Skill](./agent/reader-skill.md)、[Local HTTP API](./agent/api.md) 和 [API 安全](./agent/api-security.md) 说明如何在本机查询历史数据。受保护接口需要 Token，默认只监听本机地址。

## 开发与平台

- [开发、测试与构建](./development/overview.md)
- [本地启动排障](./development/local-startup-troubleshooting.md)
- [macOS 数据访问](./platform/macos.md)

当前项目版本以根目录 `package.json` 为准。客户端兼容性、平台公开页面与模型响应可能随系统、微信版本和服务商变化。第三方来源与使用条件见 [NOTICE](../NOTICE.md)。
