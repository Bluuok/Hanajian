# 阅读与运行顺序

先读根目录 [design.md](../../../design.md)，再读 [组件实施卡](components.md) 和 [验收合同](acceptance.md)。实施使用 `失败方案@4b3431356c48cd4589c75efe4a2d87bdcb7d74d5`，不回退到 main 旧界面；本目录全部是设计/验证材料，没有改应用运行时。

## 三个不同的页面

- `reference-inspector.html`：在现有 `docs/verification/homepage-reference.png` 上按区域检查R0；不修改图片，不用于生产背景。先确认它与用户本轮图一一致。
- `layout.html` + `layout.css` + `tokens.css`：可切换ready/idle，可用 `?part=hero`、`filter`、`summary`、`evidence`、`source`、`related`、`state` 独立看组件。**这是布局几何样例，人物是故意标明的占位框，不是最终美术稿。**
- `repro.html` / `repro.html?fixed=1`：EmptyState的原尺寸规则和有界图片修正对比，提取规则复现，不是完整Electron。

GitHub源码页不会执行HTML；检出此分支后保留目录结构，用浏览器打开或从本机静态服务访问。Python Playwright复验入口为 `check_layout.py`，默认使用已安装的Playwright Chromium，也可传 `--chromium`；`--output`指定报告目录。详见acceptance.md。

`book-plant.svg` 是为隔离复现整理的现有仓库 `src/renderer/src/assets/decor/book-plant.svg` 同几何小图；合并line为path、去除注释，仅用于尺寸诊断，不是新画好的页边插画。不得放大它冒充A02美术交付。

## 集成注意

组件文档中的树是组合示意，不是可直接粘贴的无props代码。AppShell已经拥有main landmark，实际TopicsHomePage继续使用带aria-label的section/div；不要嵌套第二个main。独立HTML样例不含AppShell，所以使用自己的main。样例中副操作禁用、示例群聊和人物占位仅用于几何测试；生产必须接真实操作并经过资产Gate。

代码与合同中的尺寸token名称需要统一映射：样例 `--art-width/--art-inset` 对应生产 `--hero-width/--hero-inset`；组件伪代码 `--space-3` 对应现有语义spacing/样例 `--hj-space-3`。只保留一个生产来源，不复制三套变量。

本轮实际结果是49个布局状态组合、7个单组件宽度检查通过，并完成空态失败规则的隔离复现；这不等于新原画或应用验收通过。真实运行图、原画审批、业务集成由后续实现PR的G0–G6分别记录。
