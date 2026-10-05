# 在本机或外部 Agent 中使用 花笺

花笺提供两种只读使用方式：

| 你想做什么                                           | 使用方式                      | 需要什么                        |
| ---------------------------------------------------- | ----------------------------- | ------------------------------- |
| 在应用中边看群聊边让 AI 总结                         | 问问 AI                       | 连接数据库并配置 AI Provider    |
| 在 Codex、Claude Code、OpenClaw 等工具里查询微信历史 | Reader Skill + Local HTTP API | 安装 Skill 并配置本机 API Token |

## 问问 AI

打开“问问 AI”，选择群聊，然后输入总结问题。AI 只会按需调用本机群聊、群成员和历史消息读取工具，回答显示在 花笺内。自定义提示词和运行日志位于“AI 助手设置”。

花笺不通过这条路径登录微信机器人账号，不监听微信实时消息，也不提供删除、修改或发送微信消息的工具。

## 外部 Agent

Reader Skill 让外部 Agent 通过受 Token 保护的 花笺Local HTTP API 按需查询联系人、群聊、最近会话、指定时间范围的聊天和群成员信息。

外部 Agent 不会直接打开数据库文件，但能取得本机 API 返回的聊天内容。它是否继续把结果发送给云端模型，取决于该 Agent 自己的模型和工具配置。

## 接入条件

当前界面没有挂载 API Center，因此新用户暂时无法通过界面启用本机 API、复制或轮换 Token。以下步骤仅适用于已启用服务且持有有效授权 Token 的已有集成；没有 Token 时只能检查 health，不要读取加密凭据文件或关闭鉴权。

已有集成可安装随应用提供的 Reader Skill，在 Agent 运行环境中设置 `HANAJIAN_API_TOKEN`，先调用 health，再查询所需会话。图片媒体读取同样需要授权。

详细说明：[Reader Skill](./reader-skill.md)、[Local HTTP API](./api.md)、[API 安全](./api-security.md)。
