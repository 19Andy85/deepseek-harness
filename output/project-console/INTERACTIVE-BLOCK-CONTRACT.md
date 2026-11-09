# Interactive Block 稳定契约

日期：2026-11-09
状态：Phase 1 契约
版本：1

## 载体

```text
Tool result metadata
  inline: true
  block: InteractiveBlockSpec
```

核心只依赖 `inline` 与 `block`，不识别业务类型。

## Block 结构

```ts
interface InteractiveBlockSpec {
  version: 1
  type: string
  props?: Record<string, unknown>
  blockId?: string
  actions?: string[]
  status?: 'pending' | 'submitted' | 'resolved' | 'expired'
}
```

## 核心职责

- 把 `inline: true` 的 tool result 放在 turn 层；
- 调用注册表渲染；
- 未知类型/非法块降级；
- 不硬编码块类型。

## 插件职责

- 注册 `type`；
- 校验 props；
- 渲染业务内容；
- 通过统一动作桥发起动作。

## 动作

```ts
{ blockId, actionId, sessionId, idempotencyKey, payload? }
```

Host 负责幂等、状态与持久化。

## 版本

`version` 必须为 1；其他版本降级，不执行动作。

## 例外

以下仍属于核心改动：

- 新增 transcript 位置；
- 新增消息/事件结构；
- 新增 composer/布局；
- 新增 slot/service；
- 修改流式/重放语义。
