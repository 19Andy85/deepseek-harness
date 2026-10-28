---
description: "Workspace console page: the read-only live session task overview of one project, fed by the sessionTasks Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-project-console

English | [中文](README.zh.md)

## Summary

The page contributes one global main panel, **Project console**, and its sidebar entry. It is the browser face of a workspace-scoped live task overview; the current skeleton renders the page frame and locale copy, while the live data wiring through the `sessionTasks` Remote lands in the next increment. The package is opt-in and adds no model-facing contribution.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the page in a Web composition that also mounts a Host controller serving the `sessionTasks` Remote; the sidebar entry opens the panel for the current workspace. No configuration is declared.

### What the page can do

- Contribute the `project-console` main panel and its sidebar entry, with copy for the eight shipped Client languages.
- Render the page frame: title, description, loading and empty copy. Live rows and workspace selection arrive with the data increment.

### Failures and recovery

The skeleton has no Remote call yet, so it cannot fail at runtime; locale registration and slot registration dispose with the plugin.

<a id="understand-the-implementation"></a>
## Understand the implementation

### Design philosophy

A global main panel fits the "one console per project" shape: the sidebar entry selects the panel, and the panel will scope its reads to the selected workspace instead of tying the page to one Session. Client copy stays in the package dictionary so a locale switch re-renders without a Host round trip.

### Source map

- `src/index.ts` — Host-face marker; the browser contribution is discovered through the package client declaration.
- `src/client/index.ts` — locale registration, the `main` panel registration, and the `sidebar.panellist` entry.
- `src/client/ProjectConsolePage.tsx` — the page frame component.
- `src/client/locales.ts` — the eight language dictionaries.

### Operation flow

The client plugin registers its dictionaries, then registers the main panel and the sidebar entry. Selecting the entry asks the layout to display the panel; the panel renders the frame from its dictionary binding. Nothing is written to the Session log.

## Further Exploration

- [Session task overview Remote](../api-session-tasks/README.md) — the Host data face this page will consume.
- [Session task overview tool](../tool-session-tasks/README.md) — the model-facing consumer of the same aggregation.
- [Client layout service](../../client/ui-layout/README.md) — the main-panel registry this page contributes to.

## Model Experience

None, as the page reads a Host Remote and renders browser UI without contributing model context or Session events.

#### KV Cache effect

No effect; the model request prefix is unchanged by this package.

## Known Limitations and Deferred Work

These limits define when this package is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Frame only** — live session rows, workspace selection, and activity families arrive with the next increment.
- **Requires the Host Remote** — the page has no data path of its own; a composition without the controller shows the frame only.
- **No controls** — dispatch, interruption, and approvals belong to a later phase.
- **Not in a bundle yet** — the package is experimental and must be mounted explicitly until an experimental bundle exists.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Future: data and entry placement

Whether the panel gains a workspace picker inside the page or reads the currently selected workspace, and whether the sidebar entry stays global, are undecided until the data increment exercises both.

</details>
