# 验收合同：每块可见、可量、可拒收

基线与范围见根 `design.md`。本文件不是已经执行通过的结果；本轮实际记录只在 `review.json`。最终代码的通过必须来自当前实现commit，不能沿用规划样例或PR #4自己的历史“测试通过”文案。

## 1. 四类证据分别记录

1. **代码证据**：组件路径、样式来源、模型/业务状态、commit。
2. **结构证据**：浏览器bbox、滚动尺寸、层叠遮挡、资源加载、控制台错误。
3. **视觉证据**：审核者实际打开组件局部与整页截图，按R0检查画风/构图，再建立R1。
4. **行为证据**：生成、切群、日期、证据保留、精确来源、导出失效、订阅和伙伴回归。

只通过其中一种不能宣布完成。没有角色原画、人物风格明显不同、巨大空态、文字遮挡，均为视觉阻塞项；不要以“类型检查通过”解除。

## 2. 同状态、同尺寸、同数据对照

R0是图一插画参考；R1是通过审核的真实页面截图。图一的三条证据不能用当前idle界面去做整体相似度分数。分别对比：ready完整结果、idle未查询、异常态。

标准测试夹具（仅测试/开发预览，不进生产真实数据）：固定8个群、3条短证据、同一个选中来源、2条带引用claim；另有长文与失败夹具。不要把参考图中的群名、数量、点赞硬编码在生产。后端capabilities=false的生产状态必须单独测，不能为拍照偷偷改成true。

固定视口：1182×745、1073×668、1280×800、1440×900、700×600；记录 CSS viewport、devicePixelRatio、Electron/Chromium版本、OS、字体、实际bitmap宽高。旧测试的CSS zoom=1.25不等于真实Windows 125%显示缩放；两者分开记录，不混用。

截图前 await `document.fonts.ready`，等待所有可见img decode完成，页面回到scrollTop=0，动画按测试配置停止；不要用随意等待200ms代替资产完成。伙伴可以在**首页外观基线**中固定时间/中立位置，但不能遮住或删除它来逃避布局问题，伙伴行为另有测试。

## 3. 必须实际失败的结构断言

请给实现组件增加测试标识：

| testid | 对象 | 合格条件 |
|---|---|---|
| topic-state-art | EmptyState img | 标准80×64，上限96×80；当前实现不能是近1000px宽 |
| topic-state-card | 初始/无结果状态根 | 短文案在桌面≤220px；组件和主提示完整可见 |
| topic-intro | 共享人物/标题/筛选/摘要区 | 正文在normal flow；标准fixture高度预算内 |
| topic-hero-artwork | 人物边界容器 | 图片已decode；槽位尺寸正确；生产资源非placeholder |
| topic-main-controls | 关键词/日期/生成主行 | 控件不与人物相交，宽度不被挤压 |
| topic-evidence-grid | 证据+原文父级 | 子元素左右边界在父内，首条证据不被人物压住 |
| topic-source-card | 原文卡 | 对齐证据顶部±2px；ID/作者/正文相符 |
| topic-next-actions | 底部真实操作条 | 标准3条fixture在1073×668首屏内；不能冒充related |

以下测试是**交给Codex接入实际组件的示意**，不代表已经在Electron运行过：

```ts
async function requireBox(locator: import('@playwright/test').Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

// 按现有launchTestApp创建隔离Electron fixture。
await fixture.setWindowContentSize({ width: 1073, height: 668 });
const art = await requireBox(home.getByTestId('topic-state-art'));
expect(art.width).toBeLessThanOrEqual(96);
expect(art.height).toBeLessThanOrEqual(80);
const card = await requireBox(home.getByTestId('topic-state-card'));
expect(card.height).toBeLessThanOrEqual(220);
expect(card.y + card.height).toBeLessThanOrEqual(668);

// 生成标准3条证据后检查组件，而非仅检查document宽度。
const grid = home.getByTestId('topic-evidence-grid');
expect(await grid.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
const g = await requireBox(grid);
for (const child of await grid.locator(':scope > *').all()) {
  const c = await requireBox(child);
  expect(c.x).toBeGreaterThanOrEqual(g.x - 1);
  expect(c.x + c.width).toBeLessThanOrEqual(g.x + g.width + 1);
}
const illustration = await requireBox(home.getByTestId('topic-hero-artwork'));
expect(illustration.y + illustration.height).toBeLessThanOrEqual(g.y + 1);
const controls = await requireBox(home.getByTestId('topic-main-controls'));
expect(controls.x + controls.width).toBeLessThanOrEqual(illustration.x + 1);
```

再检查所有实际按钮中心的 `elementFromPoint` 为自身/子节点，确保没被弹层或透明遮罩截获。`pointer-events:none`不能证明人物没有视觉遮字；两项都要验。

**负向自检：** 临时把empty-art宽度改成100%，结构测试必须红；临时让hero盖到第一条证据，遮挡断言必须红。恢复代码后再跑通过。这样证明测试真能抓住本次事故。

## 4. 单组件测试宽度与状态

| 组件 | 父宽CSS px | 必测 |
|---|---|---|
| Hero标题 | 530 / 420 | 正常、长标题、装饰关闭 |
| 人物槽位 | 200×310 / 280×350 | 透明边、裁切、可见人物bbox、资源失败 |
| Filter | 520 / 340 | date preset、自定义、无关键词、无效时间、loading、中文输入 |
| Summary | 520 / 340 | 1/3/60条claim、失效、AI失败、展开全文、导出 |
| Evidence | 414 / 340 | 3条、300条、名字长、头像失败、勾选与查看分离 |
| Source | 298 / 340 | 长文、URL、loading、找不到、旧响应晚到 |
| Next actions | 822 / 440 | capability=false；每卡真实动作 |
| State | 520 / 280 | initial/no_group/no_results/loading/error，无巨大图 |
| Subscription | 420 / 窄窗 | focus trap、Escape、关闭回焦、固定收件人与原始窗口重试 |

HTML样例已经支持 `layout.html?part=hero|filter|summary|evidence|source|related|state` 独立预览。生产阶段应提供用**真实React组件**的dev-only夹具页，复用现有测试框架；不要长期维护一份和TSX脱节的假HTML应用。

## 5. 整页状态矩阵

- idle：图标有界，清楚提示下一步；不放大图标补空白。
- loading：没有错误/空态闪烁；旧数据不能被标为新查询结果；有界状态区。
- empty：明确本次范围未召回；不编造3条假证据；日期/关键词仍可调。
- success：薄荷摘要、证据、雾蓝来源、真实操作条；人工改选和精确来源可用。
- ai_failed：候选仍可读，未经核对结论不出现；原因和恢复动作明确。
- invalid：旧abstract与claims均隐藏；JSON导出claims为空，evidence选中状态正确。
- error：错误代码可查、可读文案、retryable动作正确；不会只剩一个图。

每种状态至少拍1073×668和1440×900。当前只有两条测试证据也可以保留为回归，但视觉首屏预算另用标准3条夹具。大量真实内容允许滚动；“首屏全部可见”只对标准短内容夹具，不强行裁全量结果。

## 6. 截图回归不等于重新批准失败稿

先人工批准人物及各块R1，再使用 `expect(component).toHaveScreenshot(...)`。固定系统与字体；参数差异允许值按组件建立，并记录依据；不得设置巨大差异阈值来吞掉错误图。

```ts
await expect(home.getByTestId('topic-state-card')).toHaveScreenshot('state-idle.png', {
  animations: 'disabled',
  maxDiffPixelRatio: 0.005
});
```

0.005只是起始建议，不是对R0美术图的相似度保证。对R0检查可见人物占比、色彩分区和视觉密度；对R1检查渲染回归。不要对两个数据量不同的页面计算单一SSIM并声称“95%还原”。

审批基线和测试输出分目录；不能测试后自动 `copyToDocs` 就把新图当合格。更新R1必须附旧图、新图、差异图、更新原因与审阅结论。

## 7. 必须保留的集成回归

复用失败分支已有的查询/来源/订阅测试，不重写服务来配合UI：

生成→人工取消E1→查看E2→返回首页，E1仍取消；失效结论不再显示。导出保留原bundle schema且claims清空。新topic入口不能请求旧topic。日期非法先报错不调模型。切群和账号切换使旧请求失效。来源按完整messageId验证，同秒其他记录不能冒充目标，原文消失不制造快照。

订阅仍固定收件人、原生投递不支持时明确blocked、重试原始窗口。全页面伙伴保持同一canvas、不受首页重排重建；缩窗/收起/reduced-motion/context-lost仍通过。图片解密提醒和设置入口不因样式scope改动丢失。

建议在现有脚本内执行：

```sh
pnpm typecheck
pnpm exec vitest run --config vitest.component.config.ts tests/component/topics-homepage.test.tsx
pnpm exec vitest run --config vitest.unit.config.ts tests/unit/topic-package.test.ts tests/unit/topic-source-navigation.test.ts
pnpm test:e2e:build
pnpm exec playwright test tests/e2e/topics-workspace.spec.ts tests/e2e/companion.spec.ts tests/e2e/image-key-guidance.spec.ts
git diff --check
```

本轮应新增组件bbox/R1视觉测试，并纳入上述命令或同一CI；上列现有功能测试本身不足以放行美术。实际路径变动先核对，不通过删除测试来“修复”。

## 8. 本PR附带隔离样例的复验

静态样例不需要AI、数据库、Electron。用Python Playwright（另行安装时遵循本地环境管理）执行：

```sh
python docs/design/topic-home-v4/check_layout.py --output /tmp/topic-layout-review
# 使用已安装的Chromium时增加：--chromium /path/to/chromium
```

它验证49组视口/状态、7个单组件宽度，并导出几何截图。不验证生产TSX、人物原画或真实微信。

`repro.html`展示当前EmptyState的尺寸缺陷，`repro.html?fixed=1`展示显式80×64约束。`reference-inspector.html`只给参考图加分区边框，可分别放大查看；生产应用不得加载参考图当背景。

## 9. 合并签字表

| Gate | 通过证据 | 结果 |
|---|---|---|
| G0 尺寸止损 | 原失败→修复的bbox与负向自检 | 待实际实现 |
| G1 原画 | 母图、许可/来源、两个槽位截图、人工结论 | 待实际实现 |
| G2 token骨架 | scoped token与多宽度布局 | 待实际实现 |
| G3 单组件 | C01-C08各自截图/功能 | 待实际实现 |
| G4 组合 | ready/idle同尺寸对照，无遮挡 | 待实际实现 |
| G5 集成 | 来源/失效/导出/订阅/伙伴回归 | 待实际实现 |
| G6 整体 | 当前head的R1、测试报告、人工复审 | 待实际实现 |

任何一项未过，实施PR不写“全部完成”。本设计合同可以独立审阅合并，但不能因此自动合并失败实现或将业务验收打勾。
