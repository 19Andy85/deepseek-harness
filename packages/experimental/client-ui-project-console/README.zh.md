---
description: "工作区控制台页面：以项目为维度的只读实时会话任务总览，数据来自 sessionTasks Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-project-console

[English](README.md) | 中文

## 概述

本页面贡献一个全局主面板 **项目控制台** 及其侧栏入口。它是按工作区划分的实时任务总览的浏览器面：通过 `sessionTasks` Remote 读取所选工作区，列出每个活跃会话及其仍在运行的活动家族，并在会话模型上报状态或活动变化时重新读取。本包需要选择启用，不产生面向模型的贡献。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在同时挂载了提供 `sessionTasks` Remote 的 Host 控制器的 Web 组合中挂载本页面；侧栏入口会为当前工作区打开该面板。本包不声明配置。

### 页面能做什么

- 贡献 `project-console` 主面板及其侧栏入口，并带有八种客户端语言的文案。
- 选择一个工作区，读取其活跃会话；每行给出会话标题（缺失时回退为「未命名会话」）、`running` 或 `idle` 状态、最近一次人类提示的相对时间、工作目录，以及仍在运行的活动家族；页头汇总可见会话数与其中运行中的数量。
- 从侧栏入口打开控制台，或从工作区行的"…"菜单打开：该行工作区会成为选中范围。
- 会话状态或活动事件后自动重读，并把连续事件合并为一次读取；**刷新** 按钮按需读取。
- 读取失败时保留上一次的行，并显示紧凑的重试提示；只有在从未读到数据时才显示完整错误态。

### 失败与恢复

- Remote 失败时把返回的消息显示在提示中，并保留上次成功的行。
- 未挂载控制器时同样会读取失败；修好组合后点 **重试**。
- 插件释放时，存储会停止定时器、工作区订阅与状态发布。

<a id="understand-the-implementation"></a>
## 理解实现

### 设计理念

全局主面板符合"每个项目一个控制台"的形态：侧栏入口选择面板，面板把读取范围限定到所选工作区，而不是把页面绑定到某个会话。页面状态集中在一个 React 之外的存储里：视图订阅身份稳定的快照，事件触发的刷新会合并，因此一串会话活动只产生一次 Remote 读取。客户端文案保留在包内字典中，切换语言时无需 Host 往返即可重渲染。

### 源码地图

- `src/index.ts`——Host 面占位；浏览器贡献通过包的 client 声明被发现。
- `src/client/index.ts`——语言注册、`main` 面板注册与 `sidebar.panellist` 入口。
- `src/client/ProjectConsoleStore.ts`——工作区选择、总览读取、失败保留与刷新合并。
- `src/client/ProjectConsolePage.tsx`——页面组件、骨架屏、提示、数据行与页头汇总。
- `src/client/ProjectConsoleMenu.tsx`——工作区行菜单入口，在该行工作区上打开控制台。
- `src/client/ProjectConsolePage.module.css`——页面样式表，全部取自主题 token。
- `src/client/locales.ts`——八种语言字典。

### 操作流程

客户端插件先注册字典、创建存储，再注册主面板与侧栏入口。存储通过 `ctx.remote.sessionTasks.snapshot` 读取所选工作区；转发来的 `api-session/status`、`api-session/activity` 事件与 `connection/reset` 把总览标记为过期，存储再把重读合并。不会向会话日志写入任何内容。

<a id="further-exploration"></a>
## 进一步探索

- [会话任务总览 Remote](../api-session-tasks/README.zh.md)——本页面将要消费的 Host 数据面。
- [会话任务总览工具](../tool-session-tasks/README.zh.md)——同一聚合的模型侧消费者。
- [客户端布局服务](../../client/ui-layout/README.zh.md)——本页面贡献主面板的注册表。

<a id="model-experience"></a>
## 模型体验

无，因为本页面读取 Host Remote 并渲染浏览器界面，不产生模型上下文或会话事件。

#### KV 缓存影响

没有影响；本包不改变模型请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

这些限制说明本包何时不合适或需要额外的运维注意。它们是当前的包约束，不是任务清单。

- **仅活跃会话**——本 Host 中没有活跃智能体的会话不会出现，即使持久化的任务或定时器会为它报告活动。
- **依赖 Host Remote**——页面自身没有数据通道；未挂载控制器时显示失败提示。
- **暂无控制动作**——派发、中断与审批属于后续阶段。
- **入口为侧栏与工作区行菜单**——通过 bundle 一键启用是推迟的一步式路径；未挂载页面插件时，工作区菜单槽位不会渲染额外行。
- **尚未进入 bundle**——本包处于实验阶段，在出现实验性 bundle 之前需要显式挂载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，明确非权威——已发布行为、限制与已接受的依据来自上方各节、包代码和链接的 Agent Notes。

#### 后续：数据与入口位置

页面保留内置工作区选择器还是跟随侧栏当前工作区、侧栏入口是否保持全局，都要等 bundle 增量同时验证两种方式后再决定。

</details>
