# Agent Note：按需提升嵌套 PTC 卡片

Status: implemented

[English](2026-11-11-ptc-subcall-promotion.md) | 中文

## 问题

PTC 模式把模型工具调用包在 `run_code` 里。会话日志已经通过 `tool/ptc-dispatch` 事件把每个嵌套派发与父调用配对，因此 `ToolCallBlock.subCalls` 携带完整的嵌套调用树，每个已完成的子调用也保留自己的持久 `meta`（`ToolOutputDefinition.presentationMeta` 的结果）。Client 一直通过同一个 keyed `tool.call.toolview` 分发渲染每个嵌套调用，但渲染位置在根 `run_code` 卡片的嵌套区里。根卡片是紧凑形式，导致嵌套的交互卡片（例如带「应用」按钮的主题候选卡）实际不可达：卡片没有可展开的入口。

但是，把所有子调用都提升成兄弟行，会让 grep/bash/read 等辅助调用变成 transcript 噪音；而给根结果增加 `cards[]` 又会重复会话日志里已有的嵌套与结果数据。

## 决策

Client 工具展示只在**已完成**的嵌套子调用带有持久元数据 `meta.promote === true` 时，才把它提升为父调用行之后的独立行。其余子调用保持紧凑嵌套形式。提升只是基于原始会话事实的布局决策：不新增 wire 字段、不新增 presenter 注册表、也不维护工具名表。

- `ui-tool` 的递归调用树按派发顺序把 `subCalls` 分成提升组与紧凑组。提升组通过现有 keyed `tool.call.toolview` slot 分发，和根调用完全一致；紧凑组留在父行的 `[data-subcalls]` 区域。每个调用只渲染一次。
- 工具通过 `ToolOutputDefinition.presentationMeta` 主动选择。该元数据本来就可回放，也本来就记录在 `tool/result` / `tool/ptc-dispatch` 中；Client 把它用于布局，与它已经用于专用卡片的方式一致。
- 元数据缺失/格式错误、运行中的调用、没有元数据的失败结果，都保持紧凑形式。
- 提升卡片的动作路由暂时仍由所属 Client 插件负责；Host 侧动作通道是单独的后续工作。

本决策部分取代[Client 派生展示](../architecture/2026-08-23-client-derived-tool-presentation.zh.md)中关于 PTC dispatch 富卡片的禁止条款：该记录继续拥有“从原始事件派生展示”的规则，本记录增加按需提升的例外；其余约束不变。

## 考虑过的替代方案

**提升所有嵌套调用。** 会把完整嵌套树铺成兄弟行；grep、read、bash 等辅助调用占据 transcript，根调用的紧凑摘要失去意义。

**根结果携带 `cards[]`。** 新结果载荷会重复嵌套调用/结果数据，需要自己的去重与排序规则，还会增大会话日志；现有 `subCalls` + `meta` 已描述同样的事实。

**面板侧伴随卡。** 在平台缺少提升能力时，产品专用的 turn-tail 卡把候选渲染在调用树之外。提升存在后它会与 keyed 卡片重复，而且只服务一个产品，是过渡而非契约。

**Client 维护工具名白名单。** 布局决策留在 Client 里，但会把产品名硬编码进共享展示包。

## 后果

- 需要可见嵌套卡片的工具通过 `presentationMeta` 返回 `{ promote: true }`（例如主题工作台的生成器）；不设置的工具保持紧凑嵌套。
- Client 只提升已完成结果；运行中的嵌套调用保持紧凑 spinner 形式。
- 测试覆盖按需提升、紧凑、格式错误和更深嵌套；现有 PTC 嵌套行交互保持紧凑断言。
- 由于按需工具的对话组装输出变化，需要刷新录制的浏览器快照。
- 主题工作台的 turn-tail 伴随卡在本契约落地后删除；在此之前它检测到 promoted 元数据时自行隐藏。
- Host 的 `presentCall`/`presentResult` API 仍不被 Client 使用；提升只读取会话日志已经携带的持久 `meta`。

### 必需验证

- 组件测试：按需子调用渲染为兄弟行并通过 keyed slot 分发；未按需与格式错误的子调用保持嵌套；提升调用只出现一次。
- `test:gui` 的 `packages/client/ui-tool` 与完整 lane 保持通过。
- 重建 Web 产物后运行 `DSH_SNAPSHOT=replay pnpm run test:web`，刷新期望的对话快照。
- 真机 PTC 检查：设置 `{ promote: true }` 的工具产生根卡片之外的可见卡片，其动作经所属 Client 插件写回。
