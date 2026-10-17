# PPT 版面修复模型与 JEV 协作

## 产品规则

设置中的 PPT 修复模型负责生成修复 HTML，留空跟随成稿模型。评估模型 ID 和调用方式都可日后修改并自动保存。默认模型是 `typesafe/jev-1.14`，默认调用方式是 System One。模型 ID 留空则关闭评估。调用方式为 System One 时走 `POST /api/v1/systemone`；为 Chat 时走对话补全，把返回文本作为评估建议。已保存的默认值 `typesafe/jev-1.13` 迁移为 `typesafe/jev-1.14`，用户改过的其他模型 ID 保持不变。ZenMux 内置模型目录和已保存的模型顺序同样只替换这个旧默认 ID；目录 revision 增加后，正在运行的设置列表才会换成新 ID。评估模型不作为成稿模型。

逐页生成和手动美化复用 repairStudioSlide。每轮修复前，JEV 接收当前完整 HTML 和本地检测问题，返回的评估作为修复模型输入。JEV 不能覆盖浏览器几何、资源与导出检查结果；不完整 HTML 先修格式。JEV 服务异常显示提示，继续本地修复；取消必须终止请求。最多五轮，保留完整页并标记剩余问题。

## 所有者和接口

studioRepairModelStore 唯一拥有设置；repairStudioSlide 开始时快照评估模型。ensureSlideLayout 唯一拥有修复循环和验收结果；evaluate 回调只提供建议，不修改页面。StudioPanel 已有进度与流式输出回调展示评估状态。最终页面沿原有 onPage/替换路径写入。

```mermaid
sequenceDiagram
 participant UI as StudioPanel
 participant Loop as ensureSlideLayout
 participant JEV as System One
 participant Repair as 修复模型
 UI->>Loop: 页面及任务设置
 Loop->>Loop: 本地版面/导出检查
 Loop->>JEV: 完整 HTML + 检查问题
 JEV-->>Loop: 评估建议（失败则提示）
 Loop->>Repair: 页面 + 问题 + 评估建议
 Repair-->>UI: 修复流式输出
 Repair-->>Loop: 完整 HTML
 Loop->>Loop: 重新检查，最多五轮
 Loop-->>UI: 通过或保留带警告页面
```

## 验收场景

- 配置修复模型与 JEV 后，修复请求包含 JEV 评估；二者接口分离。
- 评估模型留空不调用评估；旧设置无评估字段时使用默认模型和 System One。
- 用户可改评估模型 ID，并可在 System One 与 Chat 之间切换；切换后下一次修复按新方式调用。
- 评估失败不丢页；取消不降级继续。
- 不完整页面不发送 JEV；本地检查通过的普通生成页不额外调用。
- 单页生成/美化共用相同链路；五轮限制保持。
- 不改预览、PDF 或其他导出路径。OfficeCLI 无原生 PDF 转可编辑 PPT 的已验证接口，本 spec 不声称实现该转换。
