/** Project console page: the sidebar entry and the workspace-scoped main panel it opens. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-approval/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-account-controller/remote'
import sessionTasksRemote from '@deepseek-ai/dsh-experimental-api-session-tasks/remote'
import { ProjectConsoleMenuItem, type ProjectConsoleMenuInjected } from './ProjectConsoleMenu.tsx'
import { type ProjectConsoleInjected } from './ProjectConsolePage.tsx'
import { ConsoleMainPage, ConsoleRailPage, type RailInjected } from './ConsoleSurface.tsx'
import { SessionRailMenuItem, type SessionRailMenuInjected } from './SessionRailMenuItem.tsx'
import { rememberRailSessionTitle } from './rail-session-title.ts'
import { TaskProposalCard } from './TaskProposalCard.tsx'
import { setProposalDecider, setProposalLister } from './proposal-card-actions.ts'
import { setBlockActionDispatcher, setBlockStateReader } from './block-actions.ts'
import { registerChoiceBlock } from './ChoiceBlock.tsx'
import { InteractiveBlockView } from './InteractiveBlockView.tsx'
import { ProjectConsolePanelIcon } from './ProjectConsolePanelIcon.tsx'
import { BalanceBadge, type BalanceWallet } from './BalanceBadge.tsx'
import { RestartAppButton } from './RestartAppButton.tsx'
import { ProjectConsoleStore } from './ProjectConsoleStore.ts'
import type { VisitMemory } from './visit-memory.ts'
import { de, en, es, fr, ja, pt, ru, zh } from './locales.ts'

/** Locale namespace of the page copy. */
export const NS = 'projectConsole'

/** localStorage prefix of one Workspace's previous visit baseline. */
const VISIT_KEY = 'dsh.project-console.visit.v1:'

function readVisitMemory(workspaceId: string): VisitMemory | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(VISIT_KEY + workspaceId)
    return raw === null || raw === undefined ? undefined : JSON.parse(raw) as VisitMemory
  } catch (error) {
    void error
    return undefined
  }
}

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'project-console' as MainPanelId

/** Client capabilities the page contributes through. */
export const inject = ['slots', 'locale', 'remote', 'remote.session', 'remote.account', 'workspaces', 'layout', 'uiWorkspace', 'uiSession', 'sidebarRight', 'sidebarRightTabs']

/**
 * Mount the overview Remote, then contribute the console entry, the page it
 * opens, and the refresh path that keeps the visible overview current.
 * @param ctx - the browser plugin context.
 * @returns disposer that unmounts the Remote contribution.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'project-console: dictionaries')
  const unmount = await ctx.remote.$mount(sessionTasksRemote)
  try {
    await ctx.inject(['remote.sessionTasks'], (inner) => { registerUi(inner) })
  } catch (error) {
    await unmount()
    throw error
  }
  return async () => { await unmount() }
}

function registerUi(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  registerChoiceBlock()
  setProposalDecider(async (input) => {
    const result = await ctx.remote.sessionTasks.devConsoleDecideProposal({
      messageId: input.messageId, decision: input.decision, role: 'maintainer',
      ...input.title === undefined ? {} : { title: input.title },
      ...input.goal === undefined ? {} : { goal: input.goal },
      ...input.acceptance === undefined ? {} : { acceptance: input.acceptance },
      ...input.steps === undefined ? {} : { steps: input.steps },
    })
    if (!result.ok) throw new Error(result.error.message)
    return { status: result.value.status }
  })
  setBlockActionDispatcher(async (input) => {
    const result = await ctx.remote.sessionTasks.devConsoleBlockAction({
      blockId: input.blockId, actionId: input.actionId, sessionId: input.sessionId, idempotencyKey: input.idempotencyKey,
      ...input.payload === undefined ? {} : { payload: input.payload },
    })
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })
  setBlockStateReader(async (input) => {
    const result = await ctx.remote.sessionTasks.devConsoleBlockState({ blockId: input.blockId, sessionId: input.sessionId })
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })
  setProposalLister(async (sessionId) => {
    const result = await ctx.remote.sessionTasks.devConsolePendingProposals({ sessionId })
    if (result.ok && result.value.proposals.length > 0) {
      return result.value.proposals.map(item => ({
        messageId: item.messageId, title: item.proposal.title, goal: item.proposal.goal, acceptance: item.proposal.acceptance,
        steps: item.proposal.steps,
      }))
    }
    const inbox = await ctx.remote.sessionTasks.devConsoleMessages({ box: 'inbox', role: 'maintainer' })
    if (!inbox.ok) return []
    return inbox.value.messages.flatMap((message) => {
      const proposal = message.payload?.proposal
      return proposal !== undefined && proposal.status === 'pending' && proposal.sourceSessionRef?.sessionId === sessionId
        ? [{ messageId: message.id, title: proposal.title, goal: proposal.goal, acceptance: proposal.acceptance, steps: proposal.steps }]
        : []
    })
  })
  const store = new ProjectConsoleStore({
    listWorkspaces: () => ctx.workspaces.list.getSnapshot().items.map(workspace => ({
      id: workspace.workspaceId, title: workspace.title, path: workspace.path,
    })),
    subscribeWorkspaces: listener => ctx.workspaces.list.subscribe(listener),
    snapshot: async workspaceId => workspaceId === undefined
      ? ctx.remote.sessionTasks.snapshot({})
      : ctx.remote.sessionTasks.snapshot({ workspaceId }),
    openSession: (sessionId) => { ctx.uiWorkspace.openSession(brandString<SessionId>(sessionId)) },
    createSession: async (workspaceId) => {
      const result = await ctx.remote.session.create({ workspaceId: brandString<WorkspaceId>(workspaceId) })
      if (!result.ok) throw new Error(result.error.message)
      return result.value.sessionId
    },
    promptSession: async (sessionId, text, mode) => {
      const result = await ctx.remote.session.prompt({
        requestId: brandString<SessionRequestId>(randomUUID()),
        sessionId: brandString<SessionId>(sessionId),
        mode,
        content: [{ type: 'text', text }],
      })
      if (!result.ok) throw new Error(result.error.message)
    },
    cancelSession: async (sessionId) => {
      ctx.remote.session.cancel({ sessionId: brandString<SessionId>(sessionId) })
    },
    answerQuestion: async (sessionId, answer) => {
      const pending = ctx.uiSession.sessionStatus.getSnapshot().get(brandString<SessionId>(sessionId))?.pendingInteraction
      if (pending === undefined || (pending.kind !== 'question' && pending.kind !== 'plan-review')) {
        throw new Error('no pending question')
      }
      await pending.answer(answer)
    },
    follow: (sessionId, signal) => ctx.remote.sessionTasks.follow({ sessionId }, signal),
    readVisit: readVisitMemory,
    acknowledge: async (workspaceId) => {
      await ctx.remote.sessionTasks.acknowledge({ workspaceId })
    },
    writeVisit: (workspaceId, memory) => {
      try {
        globalThis.localStorage?.setItem(VISIT_KEY + workspaceId, JSON.stringify(memory))
      } catch (error) {
        void error
      }
    },
    respondApproval: async (sessionId, decision) => {
      const pending = ctx.uiSession.sessionStatus.getSnapshot().get(brandString<SessionId>(sessionId))?.pendingInteraction
      if (pending === undefined || pending.kind !== 'approval') throw new Error('no pending approval')
      await pending.answer(decision)
    },
  })
  ctx.effect(() => () => { store.dispose() }, 'project-console: store')
  ctx.effect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') store.acknowledge()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, 'project-console: acknowledge on hide')
  void store.refresh()
  ctx.effect(() => {
    const offAdded = ctx.remote.$on('api-session/added', () => { store.scheduleRefresh() })
    const offRemoved = ctx.remote.$on('api-session/removed', () => { store.scheduleRefresh() })
    const offStatus = ctx.remote.$on('api-session/status', () => { store.scheduleRefresh() })
    const offActivity = ctx.remote.$on('api-session/activity', () => { store.scheduleRefresh() })
    const offReset = ctx.on('connection/reset', () => { store.scheduleRefresh() })
    return () => { offAdded(); offRemoved(); offStatus(); offActivity(); offReset() }
  }, 'project-console: live refresh')
  let railApi: { readonly openTabIn: (sessionId: SessionId, kind: string) => void; readonly mounted: () => string | undefined } | undefined
  const pageInjected = (): ProjectConsoleInjected => ({
    store,
    workspaceOptions: () => store.workspaceOptions(),
    workspaceSessions: () => ctx.workspaces.list.getSnapshot().items.map(workspace => ({
      id: String(workspace.workspaceId),
      title: workspace.title,
      sessionIds: workspace.sessionIds.map(String),
    })),
    selectedWorkspaceId: () => store.selectedWorkspaceId(),
    selectWorkspace: (workspaceId) => { void store.selectWorkspace(workspaceId) },
    refresh: () => { void store.refresh() },
    openSession: (sessionId) => { store.openSession(sessionId) },
    focusSession: (sessionId) => { store.focusSession(sessionId) },
    closeFocus: () => { store.closeFocus() },
    resetShift: () => { store.resetShift() },
    dispatch: prompt => store.dispatch(prompt),
    sendToSession: (sessionId, prompt, mode) => store.sendToSession(sessionId, prompt, mode),
    cancelSession: sessionId => store.cancelSession(sessionId),
    answerApproval: (sessionId, decision) => store.answerApproval(sessionId, decision),
    answerQuestion: (sessionId, answer) => store.answerQuestion(sessionId, answer),
    hooks: { sessionStatus: ctx.uiSession.sessionStatus },
    devConsoleInspect: async (workspaceIds, refresh) => {
      const request = {
        ...workspaceIds === undefined ? {} : { workspaceIds },
        ...refresh === undefined ? {} : { refresh },
      }
      const result = await ctx.remote.sessionTasks.devConsoleInspect(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value.workspaces
    },
    devConsoleState: async () => {
      const result = await ctx.remote.sessionTasks.devConsoleState()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleBind: async (workspaceId, sessionId) => {
      const result = await ctx.remote.sessionTasks.devConsoleBind({ workspaceId, sessionId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleSummary: async (workspaceId) => {
      const result = await ctx.remote.sessionTasks.devConsoleSummary({ workspaceId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleProjects: async () => {
      const result = await ctx.remote.sessionTasks.devConsoleProjects()
      if (!result.ok) throw new Error(result.error.message)
      return result.value.projects
    },
    devConsoleSessionContext: async (sessionId) => {
      const result = await ctx.remote.sessionTasks.devConsoleSessionContext({ sessionId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleHistory: async (workspaceId, options) => {
      const request = {
        workspaceId,
        ...options?.offset === undefined ? {} : { offset: options.offset },
        ...options?.query === undefined ? {} : { query: options.query },
      }
      const result = await ctx.remote.sessionTasks.devConsoleHistory(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleSnapshot: async () => {
      const result = await ctx.remote.sessionTasks.devConsoleSnapshot()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleAllSessions: async () => {
      const result = await ctx.remote.sessionTasks.snapshot({})
      if (!result.ok) throw new Error(result.error.message)
      return result.value.sessions
    },
    devConsoleOpenWorkspace: async (workspaceId) => {
      const result = await ctx.remote.sessionTasks.devConsoleOpenWorkspace({ workspaceId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleGit: async (workspaceId, action) => {
      const result = await ctx.remote.sessionTasks.devConsoleGit({ workspaceId, action })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleAgents: async (workspaceId) => {
      const result = await ctx.remote.sessionTasks.devConsoleAgents({ workspaceId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleSaveAgents: async (workspaceId, text, baseHash) => {
      const result = await ctx.remote.sessionTasks.devConsoleSaveAgents({ workspaceId, text, baseHash })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleAutoConfig: async (overwrite) => {
      const result = await ctx.remote.sessionTasks.devConsoleAutoConfig({ overwrite })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleConfig: async () => {
      const result = await ctx.remote.sessionTasks.devConsoleConfig()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    devConsoleSaveConfig: async (yaml) => {
      const result = await ctx.remote.sessionTasks.devConsoleSaveConfig({ yaml })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    messageCenter: {
      inbox: async (role) => {
        const result = await ctx.remote.sessionTasks.devConsoleInbox({ role })
        if (!result.ok) throw new Error(result.error.message)
        return result.value.items
      },
      plans: async (briefId) => {
        const result = await ctx.remote.sessionTasks.devConsolePlans({ ...briefId === undefined ? {} : { briefId } })
        if (!result.ok) throw new Error(result.error.message)
        return result.value.plans
      },
      createPlan: async (input) => {
        const result = await ctx.remote.sessionTasks.devConsoleCreatePlan({ ...input, role: 'maintainer' })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      deliverDirective: async (input) => {
        const result = await ctx.remote.sessionTasks.devConsoleDeliverDirective(input)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      approvePlan: async (planId) => {
        const result = await ctx.remote.sessionTasks.devConsoleApprovePlan({ planId, role: 'maintainer' })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      messages: async (role, box) => {
        const result = await ctx.remote.sessionTasks.devConsoleMessages({ role, box })
        if (!result.ok) throw new Error(result.error.message)
        return result.value.messages
      },
      sendMessage: async (input) => {
        const result = await ctx.remote.sessionTasks.devConsoleSendMessage({
          ...input,
          ...input.payload === undefined ? {} : { payload: input.payload },
        })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      messageAction: async (messageId, action, role, response?: string) => {
        const result = await ctx.remote.sessionTasks.devConsoleMessageAction({
          messageId, action, role, ...response === undefined ? {} : { response },
        })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      briefs: async () => {
        const result = await ctx.remote.sessionTasks.devConsoleBriefs({})
        if (!result.ok) throw new Error(result.error.message)
        return result.value.briefs
      },
      createBrief: async (input) => {
        const result = await ctx.remote.sessionTasks.devConsoleCreateBrief({ ...input, authorRole: 'maintainer' })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      transitionBrief: async (briefId, to, reason) => {
        const result = await ctx.remote.sessionTasks.devConsoleTransitionBrief({
          briefId, to, role: 'maintainer', ...reason === undefined ? {} : { reason },
        })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      handoff: async (input) => {
        const result = await ctx.remote.sessionTasks.devConsoleHandoff({
          ...input, fromRole: 'implementer', toRole: 'maintainer',
        })
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
    },
    openInSidebar: () => {
      if (railApi === undefined) return
      // The rail belongs to the session already on screen; opening another
      // session here would replace the conversation the user is reading.
      const active = railApi.mounted()
      if (active === undefined) return
      railApi.openTabIn(brandString<SessionId>(active), 'project-console')
    },
  })
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: pageInjected,
  }, ConsoleMainPage)), 'project-console: page')
  ctx.effect(() => {
    const rail = { sidebarRight: ctx.sidebarRight, sidebarRightTabs: ctx.sidebarRightTabs }
    railApi = {
      openTabIn: (sessionId, kind) => { rail.sidebarRight.openTabIn(sessionId, kind) },
      mounted: () => {
        const active = rail.sidebarRight.mounted.getSnapshot()
        return active === undefined ? undefined : String(active)
      },
    }
    const disposeType = rail.sidebarRightTabs.register({
      id: 'project-console-rail',
      kind: 'project-console',
      title: () => t('title'),
      guide: [{
        id: 'project-console',
        order: 30,
        title: () => t('title'),
        description: () => t('railGuideDescription'),
        icon: ProjectConsolePanelIcon,
      }],
    })
    const disposeBody = ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: 'project-console-rail',
      locale: NS,
      inject: (): RailInjected => ({
        ...pageInjected(),
        floatTab: (tabId: string) => { rail.sidebarRight.float(tabId as TabId) },
        dockTab: (paneId: string) => { rail.sidebarRight.dock(paneId as PaneId) },
      }),
    }, ConsoleRailPage)
    const disposeMenu = ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
      name: 'sidebar.workspaces.session.menu.item',
      id: 'project-console-rail',
      order: 461,
      locale: NS,
      inject: (): SessionRailMenuInjected => ({
        openRail: (sessionId, displayTitle) => {
          rememberRailSessionTitle(sessionId, displayTitle)
          const workspace = ctx.workspaces.list.getSnapshot().items
            .find(item => item.sessionIds.includes(brandString<SessionId>(sessionId)))
          if (workspace !== undefined) void store.selectWorkspace(String(workspace.workspaceId))
          ctx.uiWorkspace.openSession(brandString<SessionId>(sessionId))
          setTimeout(() => { rail.sidebarRight.openTabIn(brandString<SessionId>(sessionId), 'project-console') }, 60)
        },
      }),
    }, SessionRailMenuItem))
    return () => { railApi = undefined; disposeMenu(); disposeBody(); disposeType() }
  }, 'project-console: rail')
  const readBalance = async (): Promise<readonly BalanceWallet[] | undefined> => {
    const result = await ctx.remote.account.getBalance({
      version: process.env.DSH_CLIENT_VERSION ?? '0.0.0',
      locale: ctx.locale.getSnapshot().active,
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    })
    if (!result.ok || result.value === null || result.value.status !== 'ready') return undefined
    return result.value.value
  }
  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'project-console-balance',
    inject: () => ({ read: readBalance, label: t('dsBalance') }),
  }, BalanceBadge)), 'project-console: balance badge')
  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'project-console-restart',
    locale: NS,
  }, RestartAppButton)), 'project-console: restart app')
  try {
    ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key: 'console_task_suggest', locale: NS },
      TaskProposalCard,
    )), 'project-console: proposal card')
    ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key: 'interactive_block', locale: NS },
      InteractiveBlockView,
    )), 'project-console: generic block')
  } catch (error) {
    console.warn('[project-console] proposal surfaces unavailable:', error)
  }
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.workspace.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.workspace.menu.item',
    id: 'project-console',
    order: 100,
    locale: NS,
    inject: (): ProjectConsoleMenuInjected => ({
      openConsole: (workspaceId: WorkspaceId) => {
        ctx.layout.selectPanel(PANEL_ID)
        void store.selectWorkspace(workspaceId)
      },
    }),
  }, ProjectConsoleMenuItem)), 'project-console: workspace menu')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 1,
    label: () => t('panel'),
    locale: NS,
  }, ProjectConsolePanelIcon)), 'project-console: entry')
}
