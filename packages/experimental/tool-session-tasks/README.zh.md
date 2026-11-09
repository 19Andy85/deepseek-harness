---
description: "面向模型的只读实时会话任务总览，覆盖同一 Host 内的多个会话，供协调其他会话工作的智能体使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-session-tasks

[English](README.md) | 中文

## 概述

实验性的 `session_tasks` 工具列出当前 Host 的活跃会话，以及每个会话仍在运行的活动家族。它回答"现在有哪些任务在跑、跑在哪"，但不返回对话正文；可见范围是部署策略，而不是隐式全局授权。本包是可选启用的；挂载后每次模型请求都会增加一个提示词小节和一个工具 schema。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当智能体需要协调同一 Host 内其他活跃会话的工作时挂载本包——例如在派发新工作前先查看哪些会话正在忙碌的项目总览。不要把本包当作对话读取器：工具只报告身份、状态和活动标签；读取正文仍由会话历史工具负责。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `visibleScope` | `same-cwd` | 工具可见的活跃会话范围：`self`（仅调用方）、`same-cwd`（与调用方工作目录相同的会话）或 `host`（本 Host 的全部活跃会话）。 |

### 模型能做什么

- `session_tasks`——列出可见会话的 `sessionId`、`cwd`、`status`（`running` 或 `idle`）以及组合中活动提供方报告的活动家族（出厂组合为 `turn`、`job`、`subagent`、`schedule`）。
- 传 `session_id` 只保留一个会话，传 `include` 只保留指定活动家族。
- 运行中的会话排在空闲会话之前，其次按会话 id 排序；空总览渲染为一句话而不是空列表。
- `interactive_block`——按 `type` 与 `props` 在会话内渲染一个已注册块，并在 Host 注册它。Host 返回块 id 与可执行动作 id；`actions` 显式声明这些 id，`choice` 块默认取自身选项标签。没有 Host 注册的块无法执行动作，因此渲染出的控件不会假装可交互。
- `console_task_suggest`——保存待确认的任务提议，以及承载"确认/忽略"动作的块，但不创建任务。客户端通过 `devConsoleBlockAction` 提交动作；接受仍走既有提议决策，因此忽略或重复点击不会创建重复任务。

### 失败与恢复

工具要求调用方绑定智能体，未绑定的执行会以 `SESSION_TASKS_MISSING_AGENT` 拒绝。读取会话之间的取消会中止调用。未知或不可见的 `session_id` 返回空总览而不是错误，因此调用方无法探测可见范围之外的会话。

<a id="understand-the-implementation"></a>
## 理解实现

### 设计理念

可见性是显式策略：默认的 `same-cwd` 范围与会话历史工具保守的跨会话规则一致，`host` 则留给把同一 Host 视为单一共享项目的部署。工具报告的是既有 `workspace/session-activity` 提供方已经发布的内容，因此不引入新的活动分类。

### 源码结构

- `src/index.ts`——插件标识、配置 schema、提示词小节和 `session_tasks` 工具定义。
- `src/tasks.ts`——活跃智能体枚举、可见性授权、活动聚合、排序与文本渲染。
- `src/console-tools.ts`——Dev Console 工具定义：任务提议、内联块注册、计划提议与步骤更新、报告、交接与 Brief 流转。

### 操作流程

工具解析调用方智能体，向智能体注册表请求活跃会话，按 `visibleScope` 与可选的 `session_id` 过滤，对每个可见会话询问 `workspace/session-activity` 瀑布，按 `include` 过滤活动家族，排序后渲染 JSON 文本。除常规的工具调用与结果事件外，不向会话日志写入任何内容。

<a id="further-exploration"></a>
## 延伸阅读

- [会话活动接缝](../../workspace/workspace/README.zh.md)——本工具读取的提供方瀑布。
- [工作区注册表](../../workspace/workspace/README.zh.md)——持久项目记录与会话归属。
- [会话查询工具](../tool-session-query/README.zh.md)——会话内容的授权与读取工具。

<a id="model-experience"></a>
## 模型体验

### 系统提示词

#### 模型看到什么

模型收到一个固定的总览指导小节。

##### 实时任务总览指导

```markdown
Use session_tasks to list the sessions currently active in this Host with each row's title, latest human-prompt time, working directory, state, and the activity families still running for it. Pass session_id to restrict the overview to one session and include to keep selected families. The result is a read-only snapshot; it never returns transcript text.
```

#### Token 影响

插件挂载期间，每次请求都存在一个固定的精简小节。

#### KV 缓存影响

只要插件与指导文本不变，前缀保持稳定。

### 工具 schema

#### 模型看到什么

模型看到生成的 [`session_tasks` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-experimental-tool-session-tasks) 及其两个可选参数。

#### Token 影响

工具可见期间，每次请求发送一个固定的只读 schema。

#### KV 缓存影响

只要工具可见性与定义不变，前缀保持稳定。

### 工具结果

#### 模型看到什么

每次成功调用输出一个纯文本块：总览非空时为 JSON，否则为一句话。

#### Token 影响

结果随数据变化，并保留在已记录的工具历史中直到压缩；智能体随后可自行决定开展其他工作。

#### KV 缓存影响

追加式结果文本位于可复用请求前缀之后，不会使更早的缓存条目失效。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本包何时不合适或需要额外的运维注意。它们是当前的包约束，不是任务清单。

- **仅活跃会话**——本 Host 中没有活跃智能体的会话不可见，即使持久化的任务或定时器会为它报告活动。
- **仅元数据**——标题、最近进展摘要和正文摘录延后；工具只报告身份、状态和活动标签。
- **不干预**——派发、中断和审批动作属于后续阶段；本包从不改变其他会话。
- **`host` 范围不受限**——选择它会向每个智能体暴露本 Host 的全部活跃会话，包括调用方并不共享的工作目录。
- **不引入新活动分类**——可见家族恰好是组合中各提供方发布的内容。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，明确非权威——已发布行为、限制与已接受的依据来自上方各节、包代码和链接的 Agent Notes。

#### 后续：标题与进展摘要

精确字符串 `cwd` 相等是刻意保守的选择；标题与最近进展摘要会复用会话查询的授权，其呈现方式尚未决定。

</details>
