# Agent Note: Opt-In Promotion of Nested PTC Cards

Status: implemented

English | [中文](2026-11-11-ptc-subcall-promotion.zh.md)

## Problem

PTC mode wraps model tool calls inside `run_code`. The Session journal already pairs every nested dispatch with its parent through `tool/ptc-dispatch` events, so `ToolCallBlock.subCalls` carries the complete nested call tree and each settled sub-call keeps its durable `meta` (the `ToolOutputDefinition.presentationMeta` result). The Client renders every nested call through the same keyed `tool.call.toolview` dispatch, but it renders inside the root `run_code` card's nested region. The root card is compact, so an interactive nested card (for example a theme candidate card with apply buttons) is effectively unreachable: no expand affordance exposes it.

However, promoting every sub-call to a sibling row would turn grep/bash/read helper calls into transcript noise, and adding a root-level `cards[]` payload would duplicate the nesting and result data the Session log already carries.

## Decision

Client Tool presentation promotes a **settled** nested sub-call to its own row after the parent call row only when the sub-call's durable metadata opts in: `meta.promote === true`. Every other nested call keeps the compact nested form. The promotion is a layout decision over raw Session facts — it adds no wire field, no presenter registry, and no tool-name table.

- `ui-tool`'s recursive call tree partitions `subCalls` into promoted and compact groups in dispatch order. A promoted call dispatches through the existing keyed `tool.call.toolview` slot exactly like a root call; a compact call stays inside the parent's `[data-subcalls]` region. Each call renders exactly once.
- Tools opt in through `ToolOutputDefinition.presentationMeta`. The metadata is already replayable and already persisted in `tool/result` / `tool/ptc-dispatch`; the Client consumes it for layout, as it already does for its specialized cards.
- Malformed or missing metadata, running calls, and failed results without metadata keep the compact form.
- Action routing for promoted cards remains the owning Client plugin's responsibility for now; a Host action channel is a separate follow-up.

This partially supersedes the PTC-dispatch rich-card prohibition in [Client-derived presentation](../architecture/2026-08-23-client-derived-tool-presentation.md): that note keeps owning the raw-event-derived presentation rule, and this note adds the opt-in promotion exception. All other constraints in that note remain.

## Alternatives Considered

**Promote every nested call.** Renders the complete nested tree as sibling rows; helper calls (grep, read, bash) dominate the transcript and the root call's compact summary loses meaning.

**Root result carries `cards[]`.** A new result payload would repeat nested call/result data, need its own dedupe/ordering rules, and grow the Session log; the existing `subCalls` + `meta` already describe the same facts.

**Panel-side companion card.** A product-specific turn-tail card rendered the candidates outside the call tree while the platform lacked promotion. It duplicates the promoted keyed card once promotion exists and only serves that one product; it is a transition, not the contract.

**Tool-name allowlist in the Client.** Keeps the layout decision out of tools but hard-codes product names into the shared presentation package.

## Consequences

- Every tool that wants a visible nested card sets `presentationMeta` to return `{ promote: true }` (for example the theme studio generator). Tools that omit it keep the compact nested form.
- The Client promotes only settled results; running nested calls keep the compact spinner form.
- Tests cover opt-in, compact, malformed, and deeper nesting; existing PTC nested-row interactions keep their compact expectations.
- The recorded browser snapshot must be refreshed because assembled conversation output changes for opted-in tools.
- The theme studio's turn-tail companion card is removed once this contract ships; until then it suppresses itself when it sees promoted metadata.
- The Host `presentCall`/`presentResult` APIs remain unused by the Client; promotion reads only the durable `meta` that the Session log already carries.

### Required verification

- Component tests: opt-in sub-call renders as a sibling row and dispatches through the keyed slot; non-opted and malformed sub-calls stay nested; a promoted call appears in exactly one place.
- `test:gui` for `packages/client/ui-tool` (and the broader lane) stays green.
- `DSH_SNAPSHOT=replay pnpm run test:web` after rebuilding Web artifacts; refresh the expected conversation snapshot for the new layout.
- Real-app PTC check: a tool that sets `{ promote: true }` produces a visible card outside the compact root card and its action writes through the owning Client plugin.
