# 花笺记录员：全页面跟随伙伴

按 2026-09-22 用户最新要求，复用已经确认效果的 `Huajian-Gaze.html`，放在应用公共导航栏左下角，话题、问问 AI、日报、Clawbot、导出、设置均显示。保留收起偏好；窄窗和低高度窗口缩小显示，账号和导航仍占独立布局空间。

来源任务：`01a0c2d4-8103-7811-9804-2552eec1ab07`。源产物位于 `C:/Users/ertstyuqk/Documents/Codex/2026-09-21/new-chat/outputs/Huajian-Gaze/Huajian-Gaze.html`。

`companion-gaze.png` 直接提取自源 HTML 内嵌的原图，未重绘。原图为用户提供的 `ChatGPT Image 2026年9月21日 15_21_55.png`，权利遵循用户已有授权。头眼变形 shader 原样复用原型；应用接入增加全窗口指针映射、按需动画、切后台暂停、收起时资源释放、减少动态效果及 WebGL 失败回退。

这是用户已认可的二维局部变形，不是 VRM 或三维模型。按后续要求去掉外框与底色，使用 `companion-silhouette.svg` 矢量轮廓遮罩隐藏原图背景，WebGL 在相同变形坐标采样遮罩；静态回退复用同一遮罩。原图像素未重绘。跟随范围为应用窗口内部，离开窗口或失焦后回正。此次要求取代此前“仅聊天详情显示三维模型”的计划；未改首页大插画或接入真实微信。

相关回归：`tests/e2e/companion.spec.ts` 与 `tests/e2e/topics-workspace.spec.ts`。前者检查真实 Electron 中的 shader 方向输入、跨页保留同一 canvas、窄窗、收起偏好、减少动态效果及 WebGL 上下文丢失回退。
