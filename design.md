# 花笺话题首页：分层设计合同 v4

**执行基线：`失败方案@4b3431356c48cd4589c75efe4a2d87bdcb7d74d5`。不是 main 的旧页面。**

本文件是给 Codex 的实施与评审合同。先分别完成资产、尺寸、组件，再组合页面。不得再把“创建了组件文件、背景变白、测试能截图”写成“还原完成”。本文替代 PR #3 中与这个基线不一致的旧判断；保留已经认可的全页面左下角 GazeCompanion，不切换到 VRM/Live2D，不改变它的显隐策略。只白色模式也是当前分支已实现的产品行为，本轮不重开主题选型。

## 0. 交付物与事实边界

- 本 PR 新增设计合同、逐组件任务、HTML/CSS 几何样例、验收规范和实际隔离验证记录；不是运行时 UI 已完成的 PR。
- [逐组件任务](docs/design/topic-home-v4/components.md) 规定每个组件的输入、视觉、尺寸、交互和单独放行条件。
- [验收规范](docs/design/topic-home-v4/acceptance.md) 规定状态矩阵、截图条件、硬断言与人工检查。
- [视觉 token](docs/design/topic-home-v4/tokens.css)、[HTML/CSS 几何合同](docs/design/topic-home-v4/layout.html) 可以单独运行，不需要数据库。
- [参考图分区检查器](docs/design/topic-home-v4/reference-inspector.html) 读取仓库已有 reference，支持独立查看各块边界。它不是运行时背景。
- [验证记录](docs/design/topic-home-v4/review.json) 明确本轮实际验证与尚未验证的部分。

图一是**有生成结果的插画式设计稿**，图二是**未生成结果的初始态**。不能用不同状态推导“后端没返回摘要”或“没有证据组件”。必须做 ready-to-ready 与 idle-to-idle 两组评审。初始态同样要精致，但不能塞入虚构群聊、证据或假点赞。

## 1. 已核对的失败原因，不再重复旧方案

所有代码链接固定到上述 SHA。

| 编号 | 当前事实与证据 | 本轮处理 |
|---|---|---|
| F01 / 阻塞 | [TopicEmptyState](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/features/topics/components/TopicEmptyState.tsx) 三种空态都使用 `img.state-doodle`，没有 width/height；[book-plant.svg](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/assets/decor/book-plant.svg) 只有 `viewBox`；[topics-home.scss](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/features/topics/styles/topics-home.scss) 的 state 段没有给图片尺寸。 | 先修复确定的尺寸缺陷：80×64 CSS px，上限 96×80；禁止宽度跟随卡片拉满。隔离 Chromium 实测原图变为约 1039×831、状态卡约 1001px 高。 |
| F02 / 视觉阻塞 | 已有 11 个 TSX 展示组件和两个 hook；已经不再直接拿旧 TopicPanel 当新首页。样式仍集中在 42,027 字节的 `topics-home.scss`，大量多层选择器和重复预留空间。 | **复用组件，不重建第三套首页。** 每个组件有自己的样式模块、尺寸合同和单独截图。 |
| F03 / 视觉阻塞 | [TopicHero](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/features/topics/components/TopicHero.tsx) 已换 `recorder-hero.png`，不能继续报告“仍用 recorder.png”。但当前人物的画风、姿态、占比与图一不符；人物绝对定位在短 header 内，再让 filter/summary 分别 padding-right 230px 迁就它。 | 把人物移到共享 IntroStage 的独立装饰层；原画先审美验收，布局后接入。不能只增大旧图。 |
| F04 / 遗漏 | [TopicHeroDecor](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/features/topics/components/TopicHeroDecor.tsx) 存在，但当前 TopicsHomePage/TopicHero 没挂它；Hero 只另放了星星、回形针。 | 明确组件挂载点与每个装饰的锚点/尺寸。文件存在不等于页面出现。 |
| F05 / 验收阻塞 | [E2E](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/tests/e2e/topics-workspace.spec.ts) 会 `page.screenshot`、复制到 docs，检查部分功能与 document 横向尺寸。 | 增加元素级边界、首屏预算、静态资产加载和经批准的截图基线。保存了一张错误截图不会让测试失败。 |
| F06 / 结果冗长 | [projectTopicPackage](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/shared/topic-package.ts) 把多条 claim 拼成 abstract；[SummaryCard](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/features/topics/components/TopicSummaryCard.tsx) 只避免“某条 claim 与整个 abstract 相同”，多条时仍会同时显示拼接摘要与全部 claims。 | 同一内容只有一处紧凑预览；全部带引用的结论通过展开可达，不能为了短而丢证据。 |
| F07 / 潜在交互缺陷 | [TopicsHomePage](https://github.com/Bluuok/TraceDigest/blob/4b3431356c48cd4589c75efe4a2d87bdcb7d74d5/src/renderer/src/features/topics/TopicsHomePage.tsx) 的 related 回调 `setTopic(newTopic)` 紧接 `handleGenerate(false)`，后者读当前 render 的旧 topic。当前 capabilities.relatedTopics=false，正常产品路径暂不会触发。 | 功能卡接线时将 newTopic 显式传入查询构造函数，不能“先 setState 再读取”。补测试，不夸大为已经发生的线上错误。 |

**不成立的旧结论：** 该分支已有 TopicPackage、原文定位、诊断、缓存、分批处理及订阅抽屉；不得再为视觉整改重写后端或声称这些都缺失。`minmax(0,58%) minmax(0,42%) + gap` 在本轮 Chromium 隔离验证中没有溢出；改用 fr 是比例清晰化，不应把它写成已复现的 14px 溢出漏洞。

## 2. 视觉方向：复现一套插画构图，而不是增加几个彩色盒子

图一的核心是：浅暖白纸面、亮而不刺眼的珊瑚粉操作、薄荷色摘要带、雾蓝原文卡、深蓝灰文字、正常比例的清透人物，以及分布在页边的少量手绘文具/植物。人物与摘要色带属于一个构图；不是几个独立投影卡片之间挂着一张小立绘。

不得增加整页灰蒙滤镜；不得把所有字变浅；不得用表情字符代替设计图标；不得用整页截图当背景。标题、正文、按钮、证据和数字都必须是可选取/可访问的 HTML。

### 2.1 参考基准冻结

本轮用户图一为 1182×745；这不是 CSS 设备尺寸承诺。仓库已有 `docs/verification/homepage-reference.png`，blob=`7b4daf08d2f902b306f018acf17d889d508c0010`，可在分区检查器里看。实施前先与本轮图一对照，确认是同一构图；若不是，替换参考副本而不是按旧图继续画。保留 master、尺寸、hash，不反复覆盖。

设两种不同 baseline：

- **R0：美术参考。** 用于人物、配色、密度、层级的人工分区检查，不直接作为整页 pixelmatch 基线。
- **R1：已批准的真实组件渲染。** 同操作系统、字体、视口、fixture 后做截图回归。不能把失败截图自动更新成 R1。

### 2.2 桌面几何骨架（1182×745，CSS px）

以下是可实现的目标区间，不是声称逐像素测绘了所有图稿边缘。小量原生取整允许 1px。

| 区域 | 横向位置/尺寸 | 纵向预算 | 不可变条件 |
|---|---|---|---|
| 一级导航 | 152px，优先保留现有 shell | 全高 | 伙伴/账户各有独立布局空间 |
| 群组栏 | 180px，白纸容器，内边距8–12 | 全高 | 群项52–58px，头像32px，不造 unread 数 |
| 主内容 | 从 x≈348 开始，右侧12px | top16px | min-width:0，只有主内容正常纵向滚动 |
| Hero 标题 | 内容区左部，右边留人物区 | 88–96px | 标题28–30px，图标48px，副标题12–13px |
| 控制区 | 关键词/日期/主按钮；次操作在次行或菜单 | 80–94px | 主控件36px；不以文档式帮助文字撑高 |
| 摘要带 | 满宽浅薄荷背景，文字避开人物 | 132–146px 常规 fixture | 两三行预览；警告/长文本可展开 |
| 人物/装饰 | 共享 intro 右侧约200–280px宽 | 常规320–358px | 底边不越过证据区起点；正视/挥手半身构图 |
| 证据+原文 | `minmax(0,1.4fr) minmax(0,1fr)`、gap12 | 常规3条证据约220–240px | 每行54–64px；原文长时提供完整阅读入口 |
| 底部卡条 | 同主内容宽 | 84–96px | 有真实 related 才叫相关话题，否则为功能入口 |

1073×668：保留桌面三栏；缩减间距与次要说明，人物200px宽，摘要 padding 可减至10–12px；标准短内容 fixture 的三条证据和底部卡条应在首屏。长真实文本、错误警告、展开条件允许滚动，不能全局强行固定高度把正文裁掉。

1280×800、1440×900：增加正文空间，人物宽度封顶280–300px，不随着窗口放大到空态那样失控。主内容真实宽度小于620px：人物隐藏，证据/原文改一列；更窄时沿用应用的紧凑导航。用容器宽度决定内容分栏，不用显示器宽度猜。

## 3. 六个独立视觉层与层级规则

| 层 | 实现 | z/坐标所有者 | 验收 |
|---|---|---|---|
| L0 纸面 | CSS 背景与可选极弱平铺纹理 | page，z0 | 背景暖白，文字不发灰；纹理非必要，不增加大图下载 |
| L1 结构容器 | AppShell、群组栏、IntroStage、ResultPanel | 正常文档流 | 开关装饰层时所有正文坐标不变 |
| L2 信息色块 | 摘要薄荷、来源雾蓝、证据浅暖灰 | 各组件 | 无深阴影；选中和hover通过语义颜色统一 |
| L3 人物原画 | 透明 WebP/PNG，独立 HeroArtwork | 仅 IntroStage 绝对定位，isolation:isolate，z2 | 容器显式尺寸；独立局部裁切只裁画，不能裁正文 |
| L4 小装饰 | 星/回形针/叶/纸签/手绘弧线 | DecorSlot，z3，仅intro/导航空隙 | 每个有 width+height、anchor；不能填满信息区 |
| L5 文字与操作 | 真实 HTML、SVG图标、Radix交互层 | 文本层z1，弹层走现有 portal | 装饰不盖住字；drawer/popover高于art；键盘可用 |

不要依靠 z-index 与 `pointer-events:none` 解决遮字：不拦鼠标仍然可能视觉遮挡。必须同时断言人物槽位和按钮/文字的矩形不重叠。所有绝对定位只属于装饰；正文仍是 Grid/Flex。

IntroStage 的 `--hero-width` 与 `--hero-inset` 是**唯一人物预留来源**。移除 Hero/Filter/Summary 各自散写的210、230、240px。人物层的高度由 intro 到摘要底的区域封顶，不随内容扩展把人物拉长。

## 4. 先做资产包，停止用 CSS 弥补错误人物稿

现有正常比例 PNG 只证明“不是 Q 版”，并没有通过图一的画风验收。这个前置工作由实现者完成并交审，不能写一句“等待用户提供模型”后交空壳。

### A01 / 主人物原画

先找可编辑原稿/透明母图；没有时以 R0 人物局部为唯一画风参考，单独制作一张，不再生成整页 UI。保留棕色短发与绿色发饰、薄荷开衫、奶白内搭、灰粉细节、抱笔记本、抬手打招呼的姿态和明快表情。正常二次元比例，短半身或3/4身；禁止拉长到修长全身、写实渲染、灰褐色低对比或3D手办气质。左下 Q 版角色继续是另一项现有资产。

交付 `recorder-hero.master.png`（透明、建议≥1200px高）与优化的 `recorder-hero.webp`；输出同一份 alpha 的 bbox，透明外边距建议不超过画布各边5–8%。不要让模型在画布中央画一个很小人物，然后用 object-fit:contain 造成“CSS尺寸大而可见人物小”。保留原始画布与裁切坐标；窄图不允许用 CSS scaleX 拉胖。

审稿：在白底和棋盘格查看边缘，再放入真实280×350与200×310槽位查看。检查可见头部占比、脸/头发/服装配色、挥手轮廓、笔记本细节；不以文件名“normal”作为通过依据。向产出工具明确“只生成角色，不要文字、UI、气泡、花盆或整页背景”；手写字由单独资产/HTML实现。

### A02 / 页边文具植物

目标是图一左下的斜叠书脊和自然叶片，不是把当前 `book-plant.svg` 的几何图标无限放大。制作独立透明图，桌面最多128×120px。导航空间不足先隐藏这项，不移动或遮挡已认可伙伴。无法同时容纳时仅在主内容页边使用，不能为了照搬参考破坏全页面伙伴的新要求。

### A03 / 手绘图标与装饰

使用统一轻轮廓SVG：文件夹48px，回形针20×28，星12–24，叶片最多96×140，弧线批注最多120×52。每种角色只做一份路径组件，颜色通过 token；不要引入emoji平台差异。

`TopicHeroDecor` 每张图使用 `DecorSlot` 明确尺寸和锚点，建议5–7个小元素成2–3组：人物上方星星、右边叶、标题旁批注。装饰不可承担时间、证据数量或状态。手写感文本只用于装饰，不把完整正文字体换成手写体。不要把本机字体文件提交仓库；使用系统字体或经项目确认的可分发字体并记录来源。

### A04 / 资源登记表

登记 path、role、source、license、pixel尺寸、alpha-bbox、CSS-slot、压缩后byte、sha256、approved截图。占位稿标 `status:placeholder`；**生产验收中只要hero仍placeholder就失败**。预算是目标不是既成指标：hero ≤450KB，所有装饰≤120KB；若超标记录原因，不为了数字抹掉脸部细节。所有静态插画使用Vite资产import，本地打包，不加CDN外链。

## 5. token 实施，不制造第四套主题

配套 `tokens.css` 是几何样例的独立 light 合同。生产迁移时把其中色值归入现有 `_tokens.scss` 的 `--tm-topic-*`，删除 `--tm-card-*` 与 `--tm-topic-*` 的重复来源或做兼容别名；不得把整份独立样例主题再叠到全局。

| 用途 | 本轮建议值/尺寸 | 约束 |
|---|---|---|
| 底/白纸/次表面 | #FBF9F7 / #FFFFFF / #FAF8F7 | 不降低整块opacity |
| 主/次文字 | #344657 / #637487 | 正文13–14px、line-height1.55–1.65 |
| 薄荷/雾蓝/灰粉 | #EAF6F1 / #EEF5F8 / #FBE9EF | 信息层，不与error语义混用 |
| 奶黄/浅鼠尾草 | #FFF4DF / #E7F1E6 | 仅小图标背景 |
| 主要操作/hover/文字 | #B54C73 / #963B5E / #FFFFFF | 操作与装饰的粉色分开 |
| 装饰粉、正文粉 | 装饰可更浅；正文 #91455F | 小号文字须按实际背景验证对比度 |
| border/control/card/chip | #E7E9ED / 8px / 12px / 999px | 主按钮8px圆角，不再写“胶囊匹配参考” |
| 空态插图 | 80×64px，上限96×80 | HTML属性+组件CSS双重约束 |
| 间距 | 4,8,12,16,20,24 | 除明确锚点外不散写随机值 |
| 动效 | hover140ms；只opacity/transform | 首屏不做飞入；减少动态效果生效 |

采用 React + 现有组件 + `.module.scss`。Vite 已支持 CSS Modules 与预处理器组合，不额外安装一个UI大框架。Button/Checkbox/Dialog/Popover继续用项目 `components/ui` 包装；没有wrapper才使用现有Radix依赖。Drawer是现有Dialog的侧滑样式，不手写第二个focus trap。Grid/Flex使用CSS，不引入Canvas画UI。

## 6. 实施顺序与放行闸门

| 阶段 | 只做这一块 | 必须交付 | 不通过时 |
|---|---|---|---|
| G0 止损 | 空态图片尺寸、状态卡不被flex压扁 | idle/no_group/no_results单独截图与bbox | 不开始整页装修 |
| G1 资产 | A01人物、A02角落、A03SVG小组 | master、透明导出、登记表、200/280槽位截图 | 继续修资产，不给旧稿加更多阴影 |
| G2 基础 | token、字体、导航/群组、Grid骨架 | 1182/1073几何报告 | 不挂数据或大图掩盖比例问题 |
| G3 单块 | 按组件文档 C01→C08 单独实现 | 每块固定宽度fixture、截图、交互测试 | 当块修复后再组合 |
| G4 拼合 | 同一IntroStage与ResultPanel组合 | ready/idle分别对照R0 | 调布局token，不批量重写业务组件 |
| G5 接线 | 使用现有hook/包/来源/订阅契约 | 生成、切群、原文、失效、导出回归 | 不放宽后端验证来让fixture通过 |
| G6 验收 | 完整状态矩阵与新R1基线 | 当前commit的证据表+人工审核结论 | 不能以tests pass宣称视觉通过 |

一个阶段完成一个小commit：`fix/topic-empty-bounds` → `design/hero-assets` → `ui/topic-tokens-shell` → `ui/topic-intro` → `ui/topic-result` → `test/topic-visual-contract`。这是实现分工，不要求创建六个面向用户的PR；可以在一个实现PR里顺序提交，但不允许一次生成整页后才第一次打开浏览器。

实现者与审核者的职责分开：实现者产出组件；审核者逐张打开截图、填“不合格点+坐标+应该改的token/组件”，修后再看。同一次交付必须包含闭环，不把“我认为很精美”当证据。尚未通过的项写未通过，不可把本规划的存在当完成标记。

## 7. 保留边界

- 保留 `useTopicPackage` 的请求序号、切群隔离、fetchSource、loadBundle；保留 `useTopicsHomeState` 的人工改选和失效逻辑。
- 人工修改后，不显示旧 abstract/claims；JSON导出保留原 TopicBundle schema，claims清空且警告存在。
- `capabilities.relatedTopics/categories/tags` 当前为false。生产默认不显示伪“产品2/功能建议1”；可提供真正的“继续整理”操作卡，但不得叫分析出的相关话题。
- 原文区必须区分候选摘录与真正查回的原文；ID不匹配、记录消失、账户切换不伪装成功。
- 保持图片解密提醒、只白色设置、原文历史快照和全页面伙伴；不因首页视觉覆盖main服务或重写检索。
- 旧 `topics.scss`、TopicPanel.scss 的全局选择器要做引用清点。先给新展示组件改模块class，再隔离旧入口；不能简单调import顺序赌样式覆盖，也不全局删除旧入口仍需的样式。

## 8. 本次审核实际做了什么

已读取失败分支的组件、完整首页SCSS、主题token、TopicPackage投影、hook与相关E2E；基线与PR #4的head一致。检查重点是本轮视觉失败与验收缺口，不宣称完成了全仓安全审计。

在 Chromium 144.0.7559.96 做了原空态规则隔离复现，确认大图膨胀；修正尺寸后插图80×64、状态卡约201px。对附带几何合同跑了49个“视口×状态”组合与7个组件独立宽度检查，结果写入review.json。**没有在这里启动完整Electron、没有验证真实微信/模型服务，也没有产出通过审核的新版主人物原画。**几何样例的原画槽位故意显示占位说明，不能作为最终UI截图提交。

## 9. 技术依据

[React state snapshot](https://react.dev/learn/state-as-a-snapshot) 支持F07的状态快照判断；[Vite CSS Modules](https://vite.dev/guide/features#css-modules) 用于局部样式；[Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) 用于固定环境下的R1截图回归。库资料说明机制，不证明本项目成品已达标。所有设计尺寸/配色预算是本项目合同，不是这些库的默认值。
