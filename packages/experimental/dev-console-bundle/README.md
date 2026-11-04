---
description: "Experimental composition of the project console: workspace-level live session tasks in the browser plus the model-facing session_tasks tool."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-dev-console-bundle

English | [中文](README.zh.md)

## Summary

This experimental bundle composes three plugins into one opt-in capability:

- `@deepseek-ai/dsh-experimental-api-session-tasks` — the Host `sessionTasks` Remote that reads live sessions and their running activity families;
- `@deepseek-ai/dsh-experimental-client-ui-dev-console` — the **Project console** main panel and sidebar entry that render that overview;
- `@deepseek-ai/dsh-experimental-tool-session-tasks` — the model-facing `session_tasks` tool over the same aggregation.

Nothing is enabled by default: the bundle must be installed into a profile explicitly.

## Table of Contents

- [Use this bundle](#use-this-bundle)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-bundle"></a>
## Use this bundle

Install and enable `@deepseek-ai/dsh-experimental-dev-console-bundle` in a Web profile, then open the **Project console** entry in the sidebar. The model gets the `session_tasks` tool in the same profile.

### What the bundle provides

- The workspace-level console page: live sessions, their `running` or `idle` state, working directory, and running activity families.
- The `session_tasks` tool, scoped by `visibleScope` (default `same-cwd`).
- One switch for all three rows: disable the bundle row to remove the page, the Remote, and the tool together.

### Iterate on the client without restarting the profile

The Host's webserver stat-polls every client bundle it serves and broadcasts a rebuilt frame when one is rewritten, so a running profile hot-reloads client changes. Rebuild only the client bundles:

```sh
node packages/experimental/dev-console-bundle/scripts/rebuild-client.mjs
# A linked compatibility build: point the rebuild at that checkout.
node packages/experimental/dev-console-bundle/scripts/rebuild-client.mjs --repo ~/dsh-builds/dsh-0.2.1-rc.3
```

The page updates on its own; refresh it if the reload did not appear. Host-side changes (controllers, streams, profile entries) still need a rebuilt artifact tree and a profile restart.

### Build for a shipped release line

A profile that runs an older app needs packages built against that app's dependencies, not this workspace's. The bundle ships a reproducible compatibility build for the `dsh-v0.2.1-rc.3` line:

```sh
# Detect the installed application version and build the matching line.
node packages/experimental/dev-console-bundle/scripts/prepare-compat.mjs --link-profile desktop
# Or pin a tag / preview the plan without changing anything.
node packages/experimental/dev-console-bundle/scripts/prepare-compat.mjs --tag dsh-v0.2.1-rc.3 --link-profile desktop
node packages/experimental/dev-console-bundle/scripts/prepare-compat.mjs --detect
```

The script reads `CFBundleShortVersionString` from the install (override with `--app`) when no tag is given, rejects a tag the application cannot match, prints the target line, and fails when the copied packages' versions differ from it. It then creates a detached worktree for the tag, copies the four packages, applies `compat/target.patch` (release-line registrations and the missing prompt section id) and `compat/plugins.patch` (the client adaptations that release line needs), installs and builds that worktree, and links the result into the named profile. Restart the app afterwards. Regenerate both patches after changing the package sources; `--skip-build` reproduces only the source tree.

### Enable locally without publishing

The bundle is experimental and not published. Link it into one profile from this checkout:

```sh
pnpm run build:artifacts
pnpm exec tsx packages/experimental/dev-console-bundle/src/enable-local.ts --profile web
pnpm dsh --profile web
```

The script adds `link:` dependencies for the bundle and the three packages its patch inserts, appends the bundle to the profile's `dsh.profile.bundles`, and installs the profile. Restart the profile afterwards; the sidebar shows **Project console**. The same script enables the desktop profile (`--profile desktop`) before the desktop app starts, where the entry appears inside the window as it does in the Web client. Revert with `--remove`, and inspect the change first with `--dry-run`.

### Failures and recovery

A missing Host Remote leaves the page showing its retry notice; an unknown or absent Workspace scope is reported by the Remote with `session-tasks/workspace-not-found` or `session-tasks/workspace-unavailable`.

<a id="understand-the-implementation"></a>
## Understand the implementation

### Design philosophy

The bundle is only a composition layer: each row keeps its own package, tests, and enablement options, so a deployment can mount the page without the model tool (or the tool without the page) by composing the packages directly instead of enabling this bundle.

### Source map

- `cordis.patch.yml` — the three inserted rows and their ids.
- `src/index.ts` — an empty runtime entry; the composition lives entirely in the patch file.

## Further Exploration

- [Session task overview Remote](../api-session-tasks/README.md)
- [Project console page](../client-ui-dev-console/README.md)
- [Session task overview tool](../tool-session-tasks/README.md)

## Model Experience

Indirectly, through the `session_tasks` tool it mounts: the tool's prompt section and result shape are owned by [the tool package](../tool-session-tasks/README.md).

#### KV Cache effect

Adds one tool definition and one prompt section to every request of a profile with this bundle enabled; removing the bundle row removes both.

## Known Limitations and Deferred Work

These limits define when this bundle is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Experimental** — not part of any release bundle; mount it explicitly in a profile.
- **Live sessions only** — sessions without a live Agent in this Host never appear.
- **Dispatch starts new sessions only** — interruption, sending into an existing session, and approvals are deferred.
- **Bundled tool scope** — the tool defaults to `same-cwd`; the controller row itself has no configuration.
- **No bundle artwork yet** — the plugin row uses the default glyph until designer-approved artwork lands.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Future: one-step enablement and artwork

Once the page passes product review, the bundle gains official artwork and a detail document; whether the tool row stays inside this bundle is revisited then.

</details>
