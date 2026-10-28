---
description: "工作区控制台页面：以项目为维度的只读实时会话任务总览，数据来自 sessionTasks Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-project-console

[English](README.md) | 中文

## 概述

本页面贡献一个全局主面板 **项目控制台** 及其侧栏入口。它是按工作区划分的实时任务总览的浏览器面；当前骨架只渲染页面框架与多语言文案，通过 `sessionTasks` Remote 的实时数据接线在下一个增量完成。本包需要选择启用，不产生面向模型的贡献。

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
- 渲染页面框架：标题、说明、加载与空态文案。实时数据行与工作区选择随数据增量一起到来。

### 失败与恢复

骨架尚无 Remote 调用，因此运行时不会失败；语言注册与槽位注册随插件一起释放。

<a id="understand-the-implementation"></a>
## 理解实现

### 设计理念

全局主面板符合"每个项目一个控制台"的形态：侧栏入口选择面板，面板随后把读取范围限定到所选工作区，而不是把页面绑定到某个会话。客户端文案保留在包内字典中，切换语言时无需 Host 往返即可重渲染。

### 源码地图

- `src/index.ts`——Host 面占位；浏览器贡献通过包的 client 声明被发现。
- `src/client/index.ts`——语言注册、`main` 面板注册与 `sidebar.panellist` 入口。
- `src/client/ProjectConsolePage.tsx`——页面框架组件。
- `src/client/locales.ts`——八种语言字典。

### 操作流程

客户端插件先注册字典，再注册主面板与侧栏入口。选择入口会让布局显示该面板；面板通过字典绑定渲染框架。不会向会话日志写入任何内容。

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

- **仅有框架**——实时会话行、工作区选择与活动家族随下一个增量到来。
- **依赖 Host Remote**——页面自身没有数据通道；未挂载控制器时只显示框架。
- **暂无控制动作**——派发、中断与审批属于后续阶段。
- **尚未进入 bundle**——本包处于实验阶段，在出现实验性 bundle 之前需要显式挂载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，明确非权威——已发布行为、限制与已接受的依据来自上方各节、包代码和链接的 Agent Notes。

#### 后续：数据与入口位置

面板是内置工作区选择器还是读取当前选中的工作区、侧栏入口是否保持全局，都要等数据增量同时验证两种方式后再决定。

</details>
