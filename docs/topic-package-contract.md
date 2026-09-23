# 首页话题包与原文定位契约

本轮基于已有证据化 `TopicBundle` 扩展，保留原始查询、候选、复核和导出语义。类型以 `src/shared/topic-package.ts` 为准。

## IPC

- `topic:generatePackage` / `window.api.generateTopicPackage({ query, forceRefresh? })`：成功返回 `package`、原始 `bundle` 和 `fromCache`；失败返回结构化 `error`。
- `topic:locateSource` / `window.api.locateTopicSource({ groupId, messageId?, timestamp })`：重新查询本机数据库，返回完整原文或明确定位错误；不依赖前端已经加载的消息。

`summary.claims` 和 `abstract` 仅投影复核通过的结论。AI 失败保留候选，`notices` 给出 `AI_FAILED`；不得把候选当已验证摘要。`review: empty` 表示本次查询无召回，不表示历史中绝对不存在该话题。修改证据后的摘要失效仍由前端明确标注，导出不得保留失效结论。

分类、标签、相关话题尚无可靠后端来源：`capabilities` 显式为 false，数组为空，分类缺省。展示层必须显示相应空态，不能从关键词或聊天文字自行猜测元信息。

## 检索与证据核对（PR #3）

保留既有词面、邻近上下文和引用召回。只有词面无候选且本地存在消息时，才调用已配置模型生成最多 5 个具体扩展词；这一请求只包含话题和用户别名，不包含聊天记录、群名、账号信息。扩展词仍在本机进行字符串检索，遵守成员、排除词和时间限制，再进入两轮证据核对。拒绝过长、过多、格式无效的扩展词，并过滤“工具、软件、产品”等泛词。它是受控查询扩展，不是 embedding 全语义索引，不保证召回所有改写。

一次最多扫描 10,000 条，最多保留 300 条候选；超限显式标记 `complete: false` 和 `retrieval_incomplete`。新证据 ID 使用群 ID + 原始消息 ID 的 SHA-256 前 24 位生成 `E_<hash>`，与候选排序无关。旧持久包的 `E1` 等 ID 原样兼容；UI 展示序号与稳定 ID 分离。

普通候选先生成初稿，再对照完整候选独立核对。长候选按原文条目分批，每批两轮核对，最后把各批入选的完整原文与初稿交给全局核对，检查跨批更正和矛盾。每次输入预算为 100,000 字符，最多 8 批（最多 17 次核对请求，不含可选扩展请求）；不会把未筛选的 10,000 条历史发送给模型。任一阶段失败均不发布中间结论。

单条原文超限、批次数超限，或全局核对仍无法容纳入选原文时，保留完整候选并返回 `context_budget_exceeded`，不截断原文、不把局部初稿作为全局结论。预算是应用侧字符上限，不保证适配每个模型的 token 上限。

`TopicBundle.diagnostics` 为兼容旧包的可选字段；新包始终返回数组，`TopicPackage` 同步投影。代码包括 `provider_unavailable`、`provider_timeout`、`upstream_error`、`invalid_model_output`、`invalid_evidence_reference`、`context_budget_exceeded`、`account_switched`、`retrieval_incomplete`、`media_unreadable`。消息采用固定、安全文案，不暴露上游异常、路径或密钥。旧 `warnings` 保留可读提示。词面未命中且扩展失败时是不可用状态，不能当作确定的无结果。

## 原文定位

使用本机稳定消息 ID + 群 ID + Unix 秒定位。优先匹配完整 ID；提供的 ID 找不到时，不退而选同一秒的另一条消息。缺少 ID 时，仅当该群该秒恰好有一条消息才接受时间回退。当前数据模型没有独立的 `clientMsgId` 字段，不声明支持该字段。

数据库读取包含开始和结束端点，精确读取该秒，即使前端没有加载对应历史也可获取原文。最多读取 1001 条；超过 1000 条明确返回 `SOURCE_RANGE_TOO_LARGE`，不把截断结果误报为精确定位。未命中返回 `SOURCE_NOT_FOUND`，多条返回 `SOURCE_AMBIGUOUS`。原始消息卡直接消费定位结果；聊天跳转另行读取该秒的真实 Message，要求完整 ID 唯一匹配，不用摘录拼造消息。同秒消息作为独立历史快照显示，目标 ID 滚动高亮；返回最新消息清空快照并重新读取当前群。导航每次 await 后检查账号连接代次和导航序号。

## 时间

首页输入、展示与每日订阅统一使用 `Asia/Shanghai`。输入解析和前一天区间由 `src/shared/topic-time.ts` 提供，不读取操作系统当前时区。Unix 秒区间闭合：前一天 00:00:00 至 23:59:59。其他工具传入的 IANA 时区仍保留在原始 `TopicQuery` 中，其 Unix 秒是查询依据。

## 缓存与并发

同账号、同规范化查询（群、话题、别名、排除、成员、起止秒和时区）的进行中请求合并。复核成功的结果最多缓存 30 秒、12 个条目；返回副本，避免人工修改污染缓存。强制刷新绕过结果缓存，但不制造相同的并发计算。失败和未经复核的结果不缓存。

手动首页、AgentHub 话题工具和订阅使用同一个服务实例，同一查询可复用。账号/数据库实例变化清空缓存与进行中索引；旧请求结束时再次检查身份，拒绝向新账号发布结果。缓存是短期快照，不是实时数据保证；需要最新导入消息或刚修改的 AI 配置时应强制刷新。无持久结果缓存、跨进程幂等或自动消息投递声明。

## 错误与验证

错误包括 `INVALID_INPUT`、`DATA_UNAVAILABLE`、`DEPENDENCY_FAILED`、`AI_FAILED` 及上述定位错误，并带 `message`、`retryable`。空数据作为成功空态区别于错误。数据库账号和群可读性在每次入口检查；外部异常不直接泄露内部路径或凭据。

相关单元测试：`topic-package.test.ts`、`topic-digest.test.ts`、`topic-retrieval-hardening.test.ts`、`topic-center.test.ts`。本轮话题链路 38 项已通过；加上隔离的设置迁移 5 项，共 43 项。另有原文导航单元 9 项、组件 13 项、Electron 回归 11 项覆盖首页生成、原文定位、高亮、证据编辑失效与状态切换；纯模拟不能证明真实微信账号集成或真实模型相关性质量。
