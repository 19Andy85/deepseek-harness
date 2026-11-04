---
description: "项目控制台的实验性组合：浏览器中的工作区级实时会话任务，以及面向模型的 session_tasks 工具。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-dev-console-bundle

[English](README.md) | 中文

## 概述

本实验性 bundle 把三个插件组合成一个可选择性启用的能力：

- `@deepseek-ai/dsh-experimental-api-session-tasks`——Host 侧 `sessionTasks` Remote，读取活跃会话及其仍在运行的活动家族；
- `@deepseek-ai/dsh-experimental-client-ui-dev-console`——渲染该总览的 **项目控制台** 主面板与侧栏入口；
- `@deepseek-ai/dsh-experimental-tool-session-tasks`——基于同一聚合的模型侧 `session_tasks` 工具。

三者默认都不启用：必须显式把本 bundle 安装进 profile。

## 目录

- [使用本组合](#use-this-bundle)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-bundle"></a>
## 使用本组合

在 Web profile 中安装并启用 `@deepseek-ai/dsh-experimental-dev-console-bundle`，然后打开侧栏的 **项目控制台** 入口。同一 profile 中的模型会获得 `session_tasks` 工具。

### 本组合提供什么

- 工作区级控制台页面：活跃会话、`running` 或 `idle` 状态、工作目录与仍在运行的活动家族。
- `session_tasks` 工具，按 `visibleScope` 授权（默认 `same-cwd`）。
- 三行共用一个开关：禁用 bundle 行即可同时移除页面、Remote 与工具。

### 不重启 profile 迭代客户端

Host 的 Web 服务器会对每个被服务的客户端 bundle 做 stat 轮询，发现重写后广播 rebuilt 帧，因此运行中的 profile 会热更新客户端改动。只重建客户端 bundle：

```sh
node packages/experimental/dev-console-bundle/scripts/rebuild-client.mjs
# A linked compatibility build: point the rebuild at that checkout.
node packages/experimental/dev-console-bundle/scripts/rebuild-client.mjs --repo ~/dsh-builds/dsh-0.2.1-rc.3
```

页面会自动更新；若未出现，刷新页面。Host 侧改动（控制器、流、profile 条目）仍需重建产物并重启 profile。

### 为已发布版本构建兼容包

运行旧版 app 的 profile 需要与**该 app 依赖一致**的构建，而不是本 workspace 的依赖。本 bundle 提供 `dsh-v0.2.1-rc.3` 线的可复现兼容构建：

```sh
# Detect the installed application version and build the matching line.
node packages/experimental/dev-console-bundle/scripts/prepare-compat.mjs --link-profile desktop
# Or pin a tag / preview the plan without changing anything.
node packages/experimental/dev-console-bundle/scripts/prepare-compat.mjs --tag dsh-v0.2.1-rc.3 --link-profile desktop
node packages/experimental/dev-console-bundle/scripts/prepare-compat.mjs --detect
```

未指定 tag 时脚本从安装包读取 `CFBundleShortVersionString`（可用 `--app` 覆盖），拒绝与 app 不匹配的版本线，打印目标版本行，并在复制后校验四个包的版本是否与之一致。随后为该 tag 创建 detached worktree、复制四个包、应用 `compat/target.patch`（版本线注册与缺失的 prompt section id）和 `compat/plugins.patch`（该版本线需要的客户端适配），安装并构建该 worktree，再把结果链接进指定 profile。之后重启 app 生效。修改包源码后需重新生成两个 patch；`--skip-build` 只复现源码树。

### 不发布也能本地启用

本 bundle 处于实验阶段、尚未发布。可以直接从本 checkout 链接进某个 profile：

```sh
pnpm run build:artifacts
pnpm exec tsx packages/experimental/dev-console-bundle/src/enable-local.ts --profile web
pnpm dsh --profile web
```

脚本会为 bundle 及其 patch 插入的三个包写入 `link:` 依赖，把 bundle 追加到 profile 的 `dsh.profile.bundles`，并安装 profile。重启 profile 后侧栏显示 **项目控制台**。同一脚本也可用于桌面 profile（`--profile desktop`），启动桌面应用后该入口会像 Web 客户端一样出现在窗口内。用 `--remove` 撤销，用 `--dry-run` 先预览改动。

### 失败与恢复

缺少 Host Remote 时页面显示重试提示；工作区未知或缺少作用域时，Remote 以 `session-tasks/workspace-not-found` 或 `session-tasks/workspace-unavailable` 报告。

<a id="understand-the-implementation"></a>
## 理解实现

### 设计理念

bundle 只是组合层：每一行仍保留自己的包、测试与启用选项，因此部署可以直接组合这些包，实现"只挂页面不挂模型工具"（或反之），而不启用本 bundle。

### 源码地图

- `cordis.patch.yml`——插入的三行及其 id。
- `src/index.ts`——空的运行时入口；组合全部在 patch 文件中。

<a id="further-exploration"></a>
## 进一步探索

- [会话任务总览 Remote](../api-session-tasks/README.zh.md)
- [项目控制台页面](../client-ui-dev-console/README.zh.md)
- [会话任务总览工具](../tool-session-tasks/README.zh.md)

<a id="model-experience"></a>
## 模型体验

间接地，通过它挂载的 `session_tasks` 工具：工具的系统提示与结果形状由 [工具包](../tool-session-tasks/README.zh.md) 拥有。

#### KV 缓存影响

对启用了本 bundle 的 profile，每个请求多出一条工具定义与一个提示小节；移除 bundle 行即同时移除两者。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

这些限制说明本组合何时不合适或需要额外的运维注意。它们是当前的包约束，不是任务清单。

- **实验性**——不属于任何发布 bundle；需要在 profile 中显式挂载。
- **仅活跃会话**——本 Host 中没有活跃智能体的会话不会出现。
- **下发仅新建会话**——中断、向已有会话发送与审批推迟。
- **工具作用域随包**——工具默认 `same-cwd`；控制器行本身没有配置。
- **暂无 bundle 图标**——在设计评审通过前，插件行使用默认图形。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，明确非权威——已发布行为、限制与已接受的依据来自上方各节、包代码和链接的 Agent Notes。

#### 后续：一键启用与图标

页面通过产品评审后，本 bundle 会补上正式图标与详情文档；届时再评估工具行是否留在本 bundle 内。

</details>
