# 逐组件实施卡

本文件从根目录 `design.md` 的失败分支基线出发。组件已经存在，**保留现有数据 hook 与交互，只改变组合、展示和局部样式**。每张实施卡单独完成、单独打开浏览器检查，再进入下一张。`layout.html?part=...` 是几何示例；不是批准的美术稿或业务实现。

## 公共规则

组件输出普通 HTML；`svg` 只画图标，`img` 只放插画。使用现有 `components/ui` 的 Button、Checkbox、Dialog/Popover；不再安装整套 UI 框架。对应样式改为 `.module.scss`，入口统一 import，避免 `topics.scss`、旧 TopicPanel 和新首页同名全局 class 互相覆盖。

每个模块具备：根 class、`data-testid`、最小/推荐宽度、图像尺寸、长文策略、empty/error 状态、键盘动作、独立 fixture。Grid/Flex 子节点均显式 `min-width:0`；滚动节点加 `min-height:0`；内容卡不使用默认 `flex-shrink:1` 被压成看不见的一条。

实现路径：保留 `features/topics/components/*.tsx`，就近增加同名 `.module.scss`。`TopicsHomePage.tsx` 只做组合和事件接线。新增 `TopicIntroStage.tsx` 管共同构图；需要时新增 `TopicHeroArtwork.tsx`，不要重新创建 TopicsHomePage2/TopicsHomeV5。

## C01 / 页面骨架与 IntroStage

**现有入口：** `TopicsWorkspace.tsx`、`TopicsHomePage.tsx`、`AppShell.tsx`。

目标结构：

```tsx
<AppShell>
  <TopicsWorkspace>
    <TopicGroups />
    <main className={styles.main}>
      <TopicIntroStage state={status}>
        <TopicHero />
        <TopicFilterBar />
        {showResult ? <TopicSummaryCard /> : <TopicState />}
        <TopicHeroArtwork />
        <TopicHeroDecor />
      </TopicIntroStage>
      {showResult && <TopicResultPanel />}
      {showResult && <TopicRelatedStrip />}
    </main>
  </TopicsWorkspace>
</AppShell>
```

这是组合示意，不能直接用空 props 替代现有业务属性。主页面不改 AppShell 的伙伴挂载；任何导航书本装饰均在可用空位内，优先级低于伙伴、账户和按钮。

```scss
.main { min-width: 0; min-height: 0; overflow-y: auto; container-type: inline-size; }
.intro {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: var(--space-3);
  --hero-width: clamp(200px, 31cqw, 280px);
  --hero-inset: calc(var(--hero-width) + 18px);
}
.art { position: absolute; right: 0; top: 0; bottom: 0; width: var(--hero-width); pointer-events: none; }
.result { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; }
@container (max-width: 620px) {
  .art { display: none; }
  .result { grid-template-columns: minmax(0, 1fr); }
}
```

尺寸由 IntroStage 统一；对子组件用显式 `contentInset` CSS 变量传递，不在三处分别写230px。Intro常规高度≤358px；异常/高级展开允许增长，但人物图片高度仍封顶。人物层从这里开始、到摘要底结束，不能覆盖下面第一条证据。

**独立验收：** 1182、1073、1440 宽度下画出骨架，不挂人物。关闭/开启装饰后正文 bbox 不变。检查每个 grid child 边缘在父容器内，不只检查 `document.scrollWidth`。

## C02 / TopicHero + HeroArtwork + HeroDecor

**复用：** `TopicHero.tsx`、`TopicHeroDecor.tsx`。当前 hero 的 `onOpenChat` 等属性没有渲染入口；迁移时明确删除无用 prop 或在可见操作区接线，不能留一个“传了但不起作用”的接口。

Hero只输出48px文件夹图标、28–30px标题、12–13px副标题。普通标题行不再塞三四条文字气泡。参考图手写批注移到Decor，单独锚定，正文不使用 cursive。

Artwork先过根合同A01：棕短发/绿发饰/薄荷开衫/抱笔记本/挥手表情；正常插画比例，不用当前偏写实的修长站姿替代。透明画布在白底、棋盘格、200×310和280×350四种视图验收。未通过时明确标记 `placeholder`，不能把“人物已经有图片”算完成。

每个DecorSlot必须有稳定键、锚点、宽高和窄窗策略，例如：

| 资产 | 锚点 | CSS尺寸上限 | 条件 |
|---|---|---|---|
| 星星小组 | 人物左上 | 32×32 | 宽度足够时出现 |
| 回形针 | intro右上，位于画布内 | 20×28 | 不越过窗口右边 |
| 叶片 | 人物右侧空隙 | 76×128 | 不铺在来源卡后面 |
| 手写批注 | 标题右侧/摘要留白 | 120×52 | 空间不足隐藏而非压标题 |
| 导航角落文具 | 导航空余底部 | 128×120 | 伙伴/账户空间优先 |

SVG若固定配色，要在资产登记说明；业务图标用currentColor与token。图片加 `width`/`height`、`decoding="async"`，首屏人物不要因错误lazy策略迟迟不加载。用import返回的本地URL，不拼仓库raw URL。

**独立验收：** `?part=hero` 在530px内无截字；Artwork在两个槽位出图；Decor每个节点尺寸非零且≤登记上限。人工检查原画气质，不以像素数代替审美。

## C03 / TopicFilterBar

**复用：** `TopicFilterBar.tsx`、原查询和时间解析逻辑。

主行只保留“关键词→日期→生成”，高度36px，gap8px。按钮圆角8px而不是胶囊。主行宽度有限时，将重新生成、订阅、进入聊天等次级操作放在第二行或真实菜单，不把主要输入压成60px。

日期必须仍能选择自定义精确起止时间，时区说明可在展开面板或帮助提示，但错误必须常驻可见。所有输入有label/aria-label；装饰不覆盖日期弹层。别名/排除/成员条件保存与还原，保持31天上限由现有验证处理。

不要照抄图一“全部5/产品2”等分类chips。当前capabilities=false，没有这些数据。存在分类能力才渲染统计；否则用明确的过滤条件chip，例如“昨天”，不要冒充结果类别。

查询构造显式接收覆盖项：

```ts
// 示例；其余字段沿用当前验证和 hook。
async function handleGenerate(forceRefresh = false, topicOverride = topic) {
  const query = buildValidatedQuery({ ...formSnapshot, topic: topicOverride });
  await generate(query, forceRefresh);
}
function selectAnotherTopic(nextTopic: string) {
  setTopic(nextTopic);
  void handleGenerate(false, nextTopic);
}
```

不使用 `setTopic(next); handleGenerate()` 依赖本轮状态立即更新。

**独立验收：**520px父宽；关键词180字、无关键词、错误日期、自定义时间、loading禁用、中文输入法Enter。点击“继续整理”传出的query.topic是新值，不是旧值。

## C04 / TopicSummaryCard

**复用：**现有Summary组件及 `summaryInvalid`、`onLocateEvidence`、`onExport`。

摘要带薄荷底，整块尽量无投影。标准fixture标题18–20px、chip11px、预览13–14px、行高1.6。图标40–44px，标题+meta两层。导出是次级操作，不和标题/批注争一行。

摘要与claims来自同一内容：**预览只显示一份**，不要abstract拼起来再把claims完整重画一次。折叠态最多3行，必须有“展开全部结论”按钮；展开包含所有引用按钮。警告、人工失效、AI失败不是可被截掉的装饰文本。

状态：
- verified：预览+证据引用；“AI已核对”不能声称绝对真实。
- ai_failed：不展示旧结论，展示候选与未核对原因。
- invalid：立即隐藏旧abstract和claims；选中的候选数量跟随当前人工选择；导出仍清空claims。

**独立验收：**520px父宽，1条/3条/长60条claims。相同结论在折叠显示不重复，展开可访问全文。极长标题能换行，不挤掉导出；点击引用只改变当前查看的证据，不覆写人工勾选。

## C05 / TopicEvidenceList + TopicEvidenceItem

**复用：**现有Evidence两个组件。每项普通 `article`；DOM列表序号不是后端ID，1/2/3显示与稳定id分开。

标准行54–64px；建议内部grid为 `22px 32px minmax(0,1fr) 76px`，列间gap8px。序号22px淡粉圆，头像32px圆角，正文两行：发送者/时间11px，原文预览12–13px。超长仅截预览，完整原文通过右栏可读。

“正在查看”(selectedEvidenceId)与“保留证据”(item.selected)是不同状态：行焦点边框与checkbox不要混为一个开关。checkbox有独立label；点击查看不切换保留状态。用户仍能看被排除候选，列表过滤须说明数量。

超过首屏标准3行允许纵向滚动，不把300条塞到固定卡高，也不要为了漂亮永久隐藏所有未选中候选。从现有列表实现开始，性能确有需要才引入仓库已有虚拟列表。

**独立验收：**414px父宽，名字30字、原文很长、头像失败、selected=false、focused=true组合。勾选后异步刷新源消息不重置选择，#0引用不得出现。

## C06 / TopicSourceMessageCard

**复用：**现有 `TopicSourceMessageCard.tsx`、`fetchSource`与精确定位链路。

298px父宽，雾蓝外壳+白色消息纸片。标题13–14px，meta11px，正文13px行高1.65。正常3条fixture时与证据首行齐顶。定位按钮保持可达；长原文可展开/滚动阅读全文，不能被人物覆盖。

严格区分：未查回时的候选摘录、正在查回、真实原文、未找到/歧义/依赖失败。新选择到来时不把旧消息配上新作者。按当前locator校验返回；跨群响应丢弃，不使用时间戳模糊匹配假装成功。

图一的点赞、爱心数字当前无来源，**不渲染**。三个点不能是没有菜单的伪按钮。来源ID可放详情展开，不需要占用每条正文首屏。

**独立验收：**298px宽，正文正常/800字/无空格长URL，loading、失败重试、找不到、同秒不同ID、旧响应晚到。复用现有精确历史定位测试。

## C07 / TopicRelatedStrip（默认做诚实的功能入口）

当前package.capabilities.relatedTopics=false，不为配图新增AI后端工作。可完全隐藏，或者显示“继续整理”，4张小卡分别是调整查询、查看候选、进入聊天、本地导出；每张必须真正接线，不是假的相关话题。

图标底28–32px，奶黄/灰粉/雾蓝/鼠尾草色；标题12px；四列 `repeat(4,minmax(0,1fr))`，窄窗两列。只展示有意义的操作：没有bundle时导出禁用或不出现，有说明。

未来能力true且有真实数据再叫“相关话题”；不显示设计图里的伪分类/证据数量。当前latent新topic旧查询问题在C03修。

**独立验收：**822px四列、440px两列；能力false无“Craft功能建议”等硬编码分析结果；键盘操作每个真实入口。

## C08 / 空态、加载、失败、抽屉

**优先G0修EmptyState：**

```tsx
<img className={styles.art} src={bookPlantSvg} width={80} height={64} alt="" aria-hidden="true" />
```

```scss
.root { display:flex; align-items:center; gap:12px; padding:16px; flex:0 0 auto; }
.art { width:80px; height:64px; max-width:80px; flex:0 0 80px; object-fit:contain; }
.copy { min-width:0; }
```

图标上限不是整个SVG天然尺寸；不要依靠全局 `max-width:100%`。标准短文案状态卡总高124–220px、绝不拿 `height:100%` 拉成满屏。`no_group`可更低；适当留白比塞虚假结果更正确。

Loading使用有边界的骨架/微型spinner，不显示虚构百分比。Empty说明“所选范围未召回”而非“从未讨论”。Error有可读原因与重试；无群不要显示生成按钮可用。页面切换不丢查询条件。

订阅继续使用现有Drawer，通过项目Dialog实现portal/标题/焦点锁/Escape/返回触发按钮；不加第二层透明canvas。保留固定收件人验证、blocked投递提示、重试原始窗口，不为了首页好看删掉这些功能。

**独立验收：**520px与280px父宽；3个空态图均80×64或更小、文字在首屏；抽屉关闭回焦正确。已有伙伴不在切页时重新挂载，收起/恢复行为不变。

## 单块放行记录（每块都要填）

| 项 | 必填内容 |
|---|---|
| 实现版本 | commit SHA、组件与样式路径 |
| 夹具 | 父宽、状态、测试数据标识 |
| 检查 | bbox JSON、当前截图路径、console errors |
| 人工视觉 | 与R0对应局部的差异和结论 |
| 修复闭环 | 不合格点→改动→重拍截图；不能只贴第一次截图 |

先过C08尺寸，再按C01→C07组合。通过的组件不要再在页面末尾追加全局选择器覆写；需要修改时回到该组件的token/合同并重测。
