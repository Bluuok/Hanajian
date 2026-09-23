# 花笺首页视觉完成度 + 话题链路审查实施计划

基线：`main@eeb18228516b41dc6352e69010dfdf0a67deaba8`（`feat: add borderless gaze companion across all pages`）

状态：**Draft implementation plan**。本分支只提交实施计划，不直接改业务代码。Codex 按本文拆分实现 PR；不要把本文当成已经完成的效果。

---

## 1. 本轮目标

左下角跟随伙伴已经进入可接受状态，本轮不再把主要精力放在人偶上。主要目标是：

1. 让“话题整理”首页从“浅色功能页”升级成接近设计稿的完整产品页；
2. 用真实的插画资产、装饰资产和有层次的结果卡片，而不是继续靠纯白背景 + 边框填满页面；
3. 保留当前话题检索、证据核对、订阅、导出能力，不为视觉效果伪造业务数据；
4. 顺手修掉当前话题链路中真正影响产品体验的前后端结构问题；
5. 以真实 Electron 截图作为合并门槛，不接受只看 CSS diff。

用户给出的设计图是视觉目标；当前真实页面截图作为现状基线。两者的核心差距不是“颜色不够粉”，而是 **视觉资产不足、信息层级不足、首屏结构不对、结果区不够产品化**。

---

# 2. 先确认当前代码里的直接原因

## 2.1 Hero 人物为什么太小、太像临时占位

当前 `TopicsWorkspace.tsx` 仍直接引用：

```ts
import recorder from '../../assets/illustrations/recorder.png'
```

并在 Hero 中作为：

```tsx
<img className="topics-hero-art" src={recorder} ... />
```

当前 `topics.scss`：

```scss
.topics-hero {
  min-height: 182px;
  flex: 0 0 182px;
  overflow: hidden;
}

.topics-hero-art {
  right: 0;
  top: 0;
  width: 170px;
  height: 224px;
}
```

这会直接导致：

- 人物尺寸偏小；
- 人物被限制在 182px 高的 Hero 内；
- 不能像设计图那样跨越 Hero 与结果卡边界形成视觉重心；
- 周围没有装饰资产时，右上只像“放了一张图”。

**本轮必须替换 Hero 资产与布局方式，而不是继续调 170px → 190px。**

---

## 2.2 当前首页为什么仍像表单页

`TopicPanel` 在 workspace 模式里仍把以下内容连续堆在同一滚动流中：

1. 筛选表单；
2. 生成结果；
3. 证据列表；
4. 来源摘录；
5. 每日订阅中心；
6. 历史运行记录。

这让首屏自然变成：

> Hero → 大筛选表单 → 大段说明 → 订阅

而设计稿的视觉结构是：

> Hero → 轻量筛选 → 话题结果主卡 → 证据 + 原文 → 相关话题

所以问题不是 CSS 阴影不够，而是 **主页面信息架构仍然不对**。

---

## 2.3 当前卡片视觉为什么“白成一片”

`topics.scss` 里主块基本都在复用：

- `var(--wxex-bg-elevated)`
- `var(--wxex-bg-hover)`
- 1px 边框
- 10–14px 圆角

例如：

```scss
.topic-form { background: var(--wxex-bg-elevated); }
.topic-preview { background: var(--wxex-bg-elevated); }
.topic-claims { background: var(--wxex-bg-hover); }
.topic-source { background: var(--wxex-bg-hover); }
```

也就是说，虽然主题已经从旧灰绿色改成暖白灰粉，但 **语义表面只有“白 / 稍灰白”两级**，没有设计稿里的薄荷绿、雾蓝、灰粉、奶黄等内容分区。

---

# 3. 达到设计稿效果的方法：不是“做一张整页背景图”

本轮采用 **视觉资产包 + 结构化前端布局**。

不要：

- 把设计稿整张截图当背景；
- 把所有装饰都写成 CSS emoji；
- 继续靠同一张角色图同时解决 Hero、人偶、空状态；
- 只加阴影和渐变。

应该交付一套真正可维护的“花笺视觉资产包”。

---

# 4. 视觉资产包（必须先做）

建议目录：

```text
src/renderer/src/assets/hanajian/
  hero/
    topic-recorder-hero.webp
  decor/
    petals.svg
    sparkles.svg
    paperclip.svg
    leaf-corner.svg
    books-corner.webp
    handwritten-note-01.svg
    handwritten-note-02.svg
  icons/
    evidence.svg
    source-message.svg
    related-idea.svg
    related-compare.svg
    related-scene.svg
    related-value.svg
  texture/
    paper-noise.webp
```

## 4.1 正常比例主插画

`topic-recorder-hero.webp`：

- 正常二次元人物比例，不要 Q 版；
- 半身或 3/4 身；
- 棕色短发、雾蓝绿外套、奶白衬衫、灰粉细节、抱笔记本；
- 透明背景；
- 软线稿 / 轻水彩 / 柔和赛璐璐；
- 不要 3D 渲染感；
- 不要和左下伙伴共用同一张源图。

显示目标：

- 1073×668：人物可见高度约 300–360px；
- 1280×800：约 330–390px；
- 1440×900：约 360–420px；
- 人物可轻微跨越 Hero 下边界；
- 不能遮住生成按钮与证据内容。

实现上，Hero 容器不能再直接 `overflow:hidden` 裁人物。应使用独立 illustration layer。

---

## 4.2 左下角书本 / 植物角落插画

设计图左下角之所以不空，是因为导航底部有轻装饰。

建议单独资产：

`books-corner.webp`

内容：

- 2–3 本书；
- 柔和灰粉 / 雾蓝 / 奶白；
- 少量绿叶；
- 透明背景；
- 仅作为左侧导航底部视觉补充。

要求：

- 不挡伙伴；
- 不挡账号状态；
- 不拦鼠标；
- 低窗口高度隐藏。

---

## 4.3 花瓣 / 星星 / 手写字不要全部用文字字符代替

使用小 SVG 装饰资产并由统一组件渲染：

```text
TopicHeroDecor
NavDecor
ResultCardDecor
```

装饰必须：

- `pointer-events:none`;
- `aria-hidden=true`;
- 只在 desktop / medium desktop 出现；
- 不进入键盘焦点；
- 不承担业务信息；
- 可以轻微随机化角度，但不要随机化位置导致测试不稳定。

---

# 5. 首页结构重构

不要继续让 `TopicPanel variant="workspace"` 同时承担整个首页。

建议：

```text
features/topics/
  TopicsWorkspace.tsx
  TopicsHome.tsx
  components/
    TopicHero.tsx
    TopicHeroDecor.tsx
    TopicFilterBar.tsx
    TopicOverviewCard.tsx
    TopicClaims.tsx
    TopicEvidenceList.tsx
    TopicSourceCard.tsx
    RelatedTopicsStrip.tsx
    TopicSubscriptionDrawer.tsx
    TopicsEmptyState.tsx
    TopicsLoadingState.tsx
  hooks/
    useTopicWorkspaceState.ts
```

`TopicPanel` 可以继续作为旧入口兼容，但首页不要再直接拿整个 Panel 作为主内容布局。

---

# 6. 首屏目标布局

1073×668 下，首屏应尽量达到：

```text
┌ 导航 ┬ 群组 ┬─────────────────────────────┐
│      │      │ Hero：标题 + 插画 + 装饰       │
│      │      ├─────────────────────────────┤
│      │      │ 关键词 / 日期 / 生成           │
│      │      ├─────────────────────────────┤
│      │      │ 话题摘要主卡（薄荷绿）          │
│      │      │ ┌证据列表────┬原始消息────┐   │
│      │      │ │            │            │   │
│      │      │ └────────────┴────────────┘   │
│      │      ├─────────────────────────────┤
│      │      │ 相关话题横向卡片               │
└──────┴──────┴─────────────────────────────┘
```

每日订阅中心不再直接占据首屏主体。

---

# 7. 订阅中心从主页面移出首屏

当前 `.topic-center` 是造成页面“像后台配置页”的主要因素之一。

改成：

- 页面右上或筛选区提供“订阅管理”按钮；
- 点击后打开 drawer / side panel / modal；
- 里面保留：
  - 每日时间；
  - 固定收件人；
  - 保存订阅；
  - 暂停 / 继续；
  - 立即运行；
  - 历史运行；
  - 失败重试；
- 不删功能，只换承载位置。

推荐：

`TopicSubscriptionDrawer.tsx`

这样首页首屏才能把空间还给“话题结果”。

---

# 8. 结果主卡必须重新设计

当前 `topic-preview` 只是普通白卡。

建议结构：

## 8.1 Overview Header

薄荷绿底：

```text
#F1F8F4 / #EEF7F2
```

展示：

- 文件夹 / 话题图标；
- “1. Craft 的使用体验与推荐”；
- claim 分类 chip；
- 入选证据数量；
- 时间；
- 2–3 行摘要；
- 右上手写装饰。

摘要内容必须来自真实 claims，不能造一段设计稿假文案。

如果 claims 多条，前端可以按固定规则组合：

- 优先 决定 / 事实；
- 然后 建议 / 争议；
- 最多 2–3 条；
- 其余折叠。

不要要求模型额外生成一段无证据的营销摘要。

---

## 8.2 Evidence List

每条证据显示：

- 粉色序号圆点；
- 头像 / fallback；
- sender；
- time；
- 1–2 行 excerpt；
- 原因小标签；
- “查看原文 / 查看来源”按钮。

当前 evidence 已有：

- `messageId`
- `sender`
- `senderId`
- `timestamp`
- `text`
- `type`
- `reason`
- `selected`

无需为了做漂亮列表先扩后端。

---

## 8.3 Source Card

右侧雾蓝：

```text
#F1F6FA / #EDF4F8
```

展示真实来源：

- sender；
- time；
- content；
- messageId；
- “进入聊天定位”入口（见后端问题 BE-2）。

---

## 8.4 Related Topics

相关话题卡不能伪造。

当前 `TopicBundle` 没有 related topics，所以第一阶段：

- 如果后端没返回，则不显示“相关话题”；
- 可以显示“继续探索”的功能卡，但必须明确是操作入口而不是分析结果。

第二阶段如新增后端字段，必须带 evidenceIds，例如：

```ts
type RelatedTopic = {
  id: string
  title: string
  evidenceIds: string[]
  reason: string
}
```

没有证据引用，不允许把模型随口建议包装成“群里相关话题”。

---

# 9. 视觉 token 扩展

不要把所有颜色写进 `topics.scss`。

增加语义 token：

```css
--tm-topic-mint-surface
--tm-topic-blue-surface
--tm-topic-rose-surface
--tm-topic-yellow-surface
--tm-topic-sage-surface
--tm-decor-rose
--tm-decor-sage
--tm-decor-blue
--tm-card-soft-border
```

`--wxex-*` 如仍要兼容，可做映射，但 feature 内不重复硬编码同一批颜色。

深色主题必须为这些 token 提供相应值；不能出现浅色首页丰富、深色首页直接全部白块失效。

---

# 10. 前端代码审查：需要处理的问题

## FE-1 高优先：`TopicPanel` 职责过重

现在一个组件同时负责：

- 查询表单；
- AI 生成；
- evidence 修改；
- JSON 导出；
- Topic Center 定时轮询；
- 保存订阅；
- 运行订阅；
- 历史任务；
- 所有 UI。

这使 UI 很难继续设计化。

**要求：拆状态与展示。**

至少把：

- topic query state；
- bundle state；
- subscription state

分开。

---

## FE-2 高优先：首页继续直接复用旧 Panel，结构会被旧功能绑死

`TopicsWorkspace` 只负责左群组 + Hero，然后直接塞 `TopicPanel variant="workspace"`。

这就是为什么 UI 一直只能“换皮”，不能变成设计稿结构。

**要求：TopicsWorkspace 自己组合首页组件，不再把完整 TopicPanel 当页面主体。**

---

## FE-3 中优先：Hero asset 与左下伙伴资产角色混乱

当前 Hero 还在用 `recorder.png`，而最新伙伴使用 `companion-gaze.png`。

本轮彻底建立资产职责：

- hero：正常比例静态插画；
- companion：现有跟随伙伴；
- empty state：独立小装饰；
- nav decor：独立角落插画。

不得再次互相借用。

---

## FE-4 中优先：当前伙伴每个 AppShell 生命周期都监听全局 pointermove

最新 `gazeRenderer.ts` 已正确做了：

- visibility pause；
- rAF 按需；
- context lost；
- reduced motion；
- cleanup。

整体方向可以保留。

但后续任何页面重构都必须确保：

- AppShell 不被 key 重建；
- 不因为 topic 页面切换反复销毁 / 重建 WebGL；
- 不创建第二个全局 pointer listener。

保持现有“跨页同一 canvas”测试。

---

## FE-5 中优先：首屏状态不完整

必须设计四种视觉状态：

1. 初次进入；
2. 正在生成；
3. 无匹配；
4. 有结果；
5. AI 核对失败但有候选；
6. 真实错误。

现在很多情况最终都变成普通文字提示，产品感不足。

---

# 11. 后端审查：真正值得改的部分

不要为了“显得有后端工作”重写已经稳定的订阅调度。

下面这些问题才直接影响话题产品能力。

---

## BE-1 高优先：召回阶段仍然是词面匹配，完全改写表达会漏掉

当前 `collectTopicEvidence`：

- topic + aliases → lowercase substring；
- 命中后补 ±3 条；
- 限制 10 分钟；
- 再补 quote 关联；
- 最后 AI 只审核已经召回的候选。

因此 AI 再聪明，也看不到 **召回阶段完全没命中的同义表达**。

文档已经明确承认：

> 不是完整语义检索；换一种完全不同的说法仍可能漏检。

这应作为下一阶段后端的核心能力问题。

### 实施建议

做“两段召回”：

A. 现有 lexical recall 保留，作为高精度主路；
B. 增加受控 semantic fallback：

可选实现顺序：

1. 使用已配置模型先生成少量 query expansions（最多 5 个）；
2. 仍然在本地原文做字符串 / token 召回；
3. 或使用本地 embedding index（若项目现有知识检索已有可复用 embedding 基础设施）；
4. 所有扩展召回仍进入现有二次证据核对。

不能把整个 10,000 条原文无筛选直接发送远程模型。

新增测试：

- 原文完全不含 `craft`，但明确说“这个写作工具”且上下文可确认时，扩展召回可以找到；
- unrelated synonym 不应显著扩大误召回。

---

## BE-2 高优先：来源摘录还不是真实聊天精确定位

当前 UI 只能在 evidence 面板内部显示来源摘录。

虽然 Evidence 已有：

- groupId（来自 bundle.query）
- messageId
- timestamp

但缺少“打开聊天并定位该消息”的完整应用链路。

要求新增：

```ts
openMessageSource({
  groupId,
  messageId,
  timestamp
})
```

行为：

1. 打开对应群；
2. 若当前页消息不含该 messageId，按 timestamp 分页 / 查询；
3. 找到后滚动并短暂 highlight；
4. 找不到则显示“消息可能已删除 / 当前数据库不可读”，不要假装成功。

这会明显提升“查看原文”的可信度。

---

## BE-3 高优先：所有 AI 失败被折叠成同一种 warning

`buildTopicBundle` 当前 catch 后统一：

> AI 筛选或证据核对失败……

实际可能是：

- provider 未配置；
- provider timeout；
- JSON 无效；
- evidence 引用无效；
- account switched；
- context budget；
- upstream error。

前端无法做针对性恢复。

建议新增结构化诊断：

```ts
type TopicDiagnosticCode =
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'invalid_model_output'
  | 'invalid_evidence_reference'
  | 'context_budget_exceeded'
  | 'account_switched'
  | 'retrieval_incomplete'
  | 'media_unreadable'
```

`TopicBundle` 增加：

```ts
diagnostics: Array<{
  code: TopicDiagnosticCode
  message: string
  recoverable: boolean
}>
```

旧 `warnings` 可先兼容保留。

---

## BE-4 中优先：100k 字符直接停止总结，长讨论体验断层明显

当前：

```ts
if (context.length > MAX_MODEL_CHARACTERS) {
  ...
  return bundle
}
```

这保证“不静默截断”，原则是对的，但产品体验是：

> 候选一多 → 突然完全没有摘要。

建议改成**显式分批证据审核**：

1. evidence 按时间 / 讨论段分块；
2. 每块让模型只做 selectedIds + claims；
3. 合并后再做一次全局证据核对；
4. 所有最终 claim 仍必须引用原始 evidence ID；
5. 如果无法保证证据闭环，宁可返回 diagnostics，不生成结论。

不要偷偷 truncate。

---

## BE-5 中优先：Evidence ID 使用当前消息索引生成，不适合跨阶段稳定引用

当前：

```ts
id: `E${i + 1}`
```

只要候选排序 / 过滤方式变化，Evidence ID 就会变化。

对单次 bundle 内没问题，但：

- 导出；
- 人工改选；
- 后续重审；
- 未来 related topics；
- 缓存

都会更希望 evidence ID 稳定。

建议用 bundle 内稳定映射：

```text
E_<short hash of groupId + messageId>
```

UI 可以另外显示 1 / 2 / 3 序号，不要求用户看到 hash。

需要兼容旧导出格式，不要直接破坏现有 bundle。

---

## BE-6 中优先：Related Topics 若要实现，必须证据化

若为了匹配设计稿增加 related topics，后端不要只返回字符串数组。

必须：

```ts
interface TopicRelation {
  id: string
  title: string
  evidenceIds: string[]
  explanation: string
}
```

并验证 `evidenceIds` 都存在。

否则宁可前端不显示。

---

# 12. 暂时不要改的后端部分

以下部分当前已有测试保障，本轮不要无原因重写：

- 订阅北京时间窗口；
- 近 7 天 catch-up；
- 最多 3 个补跑窗口；
- run 去重；
- account 隔离；
- blocked native delivery；
- 原子 tmp + rename 持久化。

除非实现中发现具体 bug，否则保持。

---

# 13. 实施拆分

建议由 Codex 拆成两个实际实现 PR。

## Implementation PR A — Topic Home Visual Completion

范围：

- 正常比例 Hero 插画；
- decor asset kit；
- TopicHero；
- TopicFilterBar；
- TopicOverviewCard；
- Evidence / Source split layout；
- Subscription Drawer；
- RelatedTopics 占位策略；
- 状态页；
- topic-specific semantic color tokens；
- 保持现有 companion 不退化。

不碰话题检索算法。

---

## Implementation PR B — Topic Retrieval & Source Reliability

范围：

- semantic recall fallback；
- exact source locator；
- typed diagnostics；
- large evidence batch review；
- stable evidence IDs；
- optional evidence-backed related topics。

每项后端增强都必须配 unit tests。

---

# 14. PR A 验收

必须上传真实 Electron 截图：

- 1073×668
- 1280×800
- 1440×900
- 1073×668 empty state
- 1073×668 generated result
- dark theme
- narrow window

设计验收：

- [ ] 右上是正常比例人物，不是 Q 版小图；
- [ ] 人物占比与目标图接近；
- [ ] 左下 / 边角有克制装饰，不是一片空；
- [ ] 首屏优先展示结果，不是订阅配置；
- [ ] 摘要区薄荷绿；
- [ ] 来源区雾蓝；
- [ ] 证据序号和操作灰粉；
- [ ] related strip 有 pastel icon 体系；
- [ ] 仍保留大量留白，不堆贴纸；
- [ ] 装饰不挡交互；
- [ ] 当前 gaze companion 跨页测试继续通过。

---

# 15. PR B 验收

- [ ] lexical-only 旧行为不退化；
- [ ] synonym / paraphrase case 有受控召回；
- [ ] 远程模型不直接收到无筛选 10k 条消息；
- [ ] source locator 可定位一条未在当前页加载的消息；
- [ ] provider failure / invalid output / budget overflow 有不同诊断；
- [ ] >100k candidate context 不再只能整包放弃；
- [ ] evidence ID 在相同 messageId 下保持稳定；
- [ ] related topic 每项都有证据引用；
- [ ] 现有 topic-digest / topic-center tests 全部通过。

---

# 16. 明确禁止

- 不要只把背景改成粉色渐变；
- 不要整张设计稿当背景；
- 不要伪造设计图里的“5 条、3 条、2 条”；
- 不要把订阅中心删掉，只是移出首屏；
- 不要为了 related topics 让前端自己猜；
- 不要让 Hero 插画和 companion 共用一张图；
- 不要破坏最新 gaze companion；
- 不要把所有视觉细节塞回一个 `topics.scss`；
- 不要在没有截图证据的情况下宣称“已接近设计稿”。
