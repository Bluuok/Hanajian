# Reader Skill：让外部 Agent 读取微信

## 先理解它能做什么

Reader Skill 是一份给 Agent 的操作说明。安装后，Codex、Claude Code、OpenClaw 或其他本地 Agent 可以按需调用 Hanajian，读取联系人、群聊、最近会话、指定时间的聊天和群成员信息。

它使用的是 Hanajian Local HTTP API，不是 MCP Server。

Reader Skill 只负责“外部 Agent 主动查询历史微信数据”。它不负责二维码登录、监听微信实时消息、接收机器人消息或管理 Agent Hub。应用内的只读总结与记忆草稿工作流见[AI 助手](./agent-hub.md)。

正式 Reader Skill 名称和目录是 `hanajian-reader`，新安装使用 `HANAJIAN_API_TOKEN`。已安装的 `tracememo-reader`、`wechatexplorer-reader` 和原 Token 变量仍可使用；资源解析依次回退到旧目录，不移动已安装的 Skill。

## 现有集成的配置

当前界面没有挂载 API Center，因此新用户暂时无法通过界面启用本机 API、复制或轮换 Token。以下步骤仅适用于已启用服务且持有有效授权 Token 的已有集成；没有 Token 时只能检查 health，不要读取加密凭据文件或关闭鉴权。

1. 启动 Hanajian 并完成数据库连接。
2. 将仓库中的 `docs/skill/hanajian-reader/SKILL.md` 或随安装包提供的 Reader Skill 放入目标 Agent 的 Skill 目录。
3. 在 Agent 自己的本地环境配置已有授权 Token：

   ```bash
   export HANAJIAN_API_TOKEN="<YOUR_EXISTING_AUTHORIZED_TOKEN>"
   ```

4. 先执行 health 检查，再读取数据端点。

Hanajian 不会自动把 Token 写进 Agent 配置。Token 失效后应停止读取，待授权配置恢复后再试。

## Agent 的读取顺序

当用户使用“今天”“昨天”“本周”等相对时间时：

1. 调用 `/api/v1/current_time` 获取本机时区和日期；
2. 将相对时间换算为 `chatlog` 支持的 `time` 或时间戳；
3. 调用 `/api/v1/resolve`、`contact` 或 `chatroom` 确认会话；
4. 调用 `/api/v1/chatlog` 读取目标范围；
5. 对重要结论再读取关键消息前后文，不要只凭一次粗查。

## 最小请求

```bash
curl http://127.0.0.1:6131/api/v1/health

curl -H "Authorization: Bearer $HANAJIAN_API_TOKEN" \
  "http://127.0.0.1:6131/api/v1/recent_chat?limit=20"
```

## 当前能力范围

Reader Skill 可以指导 Agent 使用：

- 联系人、群聊、最近会话和会话解析；
- 指定会话、日期或时间戳范围的聊天记录；
- 群成员快照；
- 结构化日报渲染和按群聊生成总结图片；
- 按聊天消息返回的 `media.url` 读取可用图片，再由 Agent 按用户请求理解图片。

当前花笺没有 Agent 状态、微信登录或微信消息发送端点。

端点、参数、错误码和鉴权细节以[Local HTTP API](./api.md)为准。Skill 文件保持短小，避免在多个文档中复制会变化的完整响应 schema。

## 隐私边界

Reader Skill 本身不会把聊天数据自动上传到其他服务器；它只是让 Agent 调用本机 API。Agent 读取结果是否继续发送给云端模型，取决于 Agent 自己的模型和工具配置。请同时阅读[数据、隐私与安全](../user-guide/privacy.md)。
