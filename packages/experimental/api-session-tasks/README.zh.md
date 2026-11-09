---
description: "面向浏览器的只读 Remote，投影同一 Host 某个工作区的活跃会话与运行中的活动家族，供项目控制台页面使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-session-tasks

[English](README.md) | 中文

## 概述

本控制器提供一个只读 Remote 命名空间 `sessionTasks`：`snapshot` 报告某个工作区的活跃会话，以及每个会话仍在运行的活动家族；`follow` 流式跟随单个活跃会话的行，直到它不再是活跃会话。它投影智能体注册表、`workspace/session-activity` 瀑布以及 `title`/`sessionListMetadata` 投影；从不读取或写入会话内容，也不产生面向模型的贡献。本包需要选择启用，通常与消费它的浏览器页面一起挂载。

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

在需要实时任务总览的浏览器页面的 Host 组合中挂载本控制器。它需要 `ctx.typert` 与 `ctx.agents`；按工作区读取时还需要挂载 `ctx.workspaceRegistry`。本包声明一个配置项 `followIntervalMs`（跟随流的比较间隔，默认 750 毫秒）。

### 浏览器能做什么

- `sessionTasks.snapshot({ workspaceId? })`——一次一致性读取：按范围请求时返回工作区身份与路径，以及每个活跃会话的 `sessionId`、可选 `title`、可选 `lastPromptAt`、`cwd`、`status`（`running` 或 `idle`）和提供方活动家族。
- `sessionTasks.follow({ sessionId })`——该会话行的流：打开时一帧，行发生变化时一帧，会话不再是活跃会话时一帧不含行的结束帧。未知或非活跃会话以 `session-tasks/session-not-found` 失败。帧通过按 `followIntervalMs`（默认 750，最小 100）比较行产生。行还会带上从持久化会话头读取的派生关系（`parent` 会话 id，以及最多十个带存活状态与委托深度的 `children`，按 `relationsRefreshMs`（默认 5000）刷新），因此已结束的子代理仍可见。挂载存储域时，控制器为每个工作区保留一份已确认基线，并在 `snapshot` 中返回 `lastSeenAt` 与 `changes`（与该基线不同的会话 id）；`sessionTasks.acknowledge({ workspaceId })` 替换基线并返回时间。未挂载存储域时两者省略，确认调用以 `session-tasks/seen-unavailable` 失败。当可选的 `workspaceChanges` 服务能为最新的 `workspace/changes` 序号提供摘要时，行还会带上该轮次的变更统计（`changes`：文件数、增加/删除行数、前三个展示路径）。行还会带上会话最后一轮的结果（`outcome`：`completed`、`failed`、`cancelled`、`blocked`、`truncated`，附 `outcomeAt` 与失败原因 `outcomeReason`），由仅 Host 可见的 `sessionTaskOutcome` 投影折叠 `turn/start` 与 `turn/end` 得到，不读取消息内容。
- 活动条目可带可选的 `startedAt` 与 `lastActivityAt`；提供方未提供时，控制器以首次观察到的时间打点，并只在条目集合变化时刷新变化时间。运行中的会话若带时间的活动超过 `stallAfterMs`（默认 900000，最小 60000）没有变化，会带 `stalled: true`；没有带时间的活动时不做猜测。
- 省略 `workspaceId` 时读取本 Host 的全部活跃会话；运行中的会话排在前面，其次按会话 id 排序。
- 跟随流通过比较投影行而不是订阅单个 Host 事件实现；两次比较之间翻转两次的变化只会观察到最新行。
- `sessionTasks.devConsoleBlockAction({ blockId, actionId, sessionId, idempotencyKey, payload? })`——执行一个由 Host 注册的内联块动作。Host 校验块存在、属于该会话、声明了该动作且仍是 `pending`，随后在同一次写入中保存动作记录（块、动作、会话、幂等键、结果、时间）并把块置为 `resolved`。相同幂等键重复提交返回已存结果（`replayed: true`），不会再次执行，因此重复点击不会创建第二个任务，也不会二次修改状态。
- `sessionTasks.devConsoleBlockState({ blockId, sessionId })`——由 Host 拥有的块状态（`pending`、`submitted`、`resolved`、`expired`）、可执行动作 id 与最近一次动作结果，使刷新后的会话记录渲染 Host 存储的状态，而不是块创建时的状态。

### 失败与恢复

- `session-tasks/workspace-not-found`——请求的工作区 id 未注册。
- `session-tasks/workspace-unavailable`——请求了工作区范围，但没有挂载工作区注册表。
- Remote 访问控制仍然对每个连接生效；未授权调用方不会到达聚合层。

<a id="understand-the-implementation"></a>
## 理解实现

### 设计理念

控制器只拥有浏览器投影。聚合是对两个 Host 端口（智能体注册表与一次活动查询）的纯函数，因此面向模型的 `session_tasks` 工具与本 Remote 共享同一份"活跃会话"的定义，区别在授权：工具应用智能体作用域的 `visibleScope`，Remote 则遵循页面的工作区范围。

### 源码地图

- `src/index.ts`——`SessionTasksController`、`sessionTasks` 命名空间、`snapshot` 方法、轮询式 `follow` 流及其 `followIntervalMs` 配置。
- `src/aggregation.ts`——纯聚合、工作区投影与两个 Remote 错误码。
- `src/types.ts`——线上值类型、Host 端口与 `RemoteErrorDetailsMap` 声明。
- `src/dev-console-block.ts`——块记录、Host 拥有的状态机、幂等记录，以及"重新读取、校验、执行、提交"的单次动作执行器。

### 操作流程

`snapshot` 通过 `ctx.workspaceRegistry` 解析可选的工作区，收集活跃智能体，对每个可见会话询问 `workspace/session-activity` 瀑布，在组合存在时读取标题与最近提示投影，投影条目身份，排序后返回一个快照。工作区注册表与活动提供方始终是 Host 服务；页面不会收到会话事件。

<a id="further-exploration"></a>
## 进一步探索

- [会话活动接缝](../../workspace/workspace/README.zh.md)——本控制器读取的提供方瀑布。
- [会话任务总览工具](../tool-session-tasks/README.zh.md)——同一聚合的模型侧消费者。
- [Typert 协议](../../typert/protocol/README.zh.md)——`sessionTasks` 命名空间如何生成与分发。

<a id="model-experience"></a>
## 模型体验

无，因为本控制器只把 Host 活动投影到浏览器 Remote；它不产生模型上下文、工具或会话事件。

#### KV 缓存影响

没有影响；本包不改变模型请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

这些限制说明本包何时不合适或需要额外的运维注意。它们是当前的包约束，不是任务清单。

- **仅活跃会话**——本 Host 中没有活跃智能体的会话不可见，即使持久化的任务或定时器会为它报告活动。
- **仅快照**——活动变化后页面必须重新读取；跟随流推迟到页面需要推送更新时再实现。
- **总览只读**——总览命名空间只读；任务、计划与内联块写入由同一命名空间中的 Dev Console 方法承担。
- **块状态由 Host 拥有**——浏览器从不写入；客户端不能自行把块标记为已解决。动作总线之前记录的块没有块 id，其卡片沿用更早的提议决策路径。
- **工作区范围需要注册表**——未挂载 `ctx.workspaceRegistry` 时，按工作区读取会报错，而不是回退到全部活跃会话。
- **暂无页面级访问策略**——连接受既有 Remote 访问控制约束；页面级授权推迟。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，明确非权威——已发布行为、限制与已接受的依据来自上方各节、包代码和链接的 Agent Notes。

#### 后续：推送与控制

跟随流会复用既有的会话活动事件，而不是新增项目级事件；控制动作会扩展本命名空间，而不是面向模型的工具。

</details>
