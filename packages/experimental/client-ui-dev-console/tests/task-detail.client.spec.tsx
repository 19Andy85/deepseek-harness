/** @vitest-environment jsdom */
/** Keyless task detail assembly from a proposed task and plan. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskDetailView } from '../src/client/TaskDetailView.tsx'
import type { BriefView, MessageView, PlanView } from '../src/client/message-types.ts'

afterEach(cleanup)

const brief: BriefView = {
  id: 'brief-1', workspaceId: 'workspace-1', title: 'Agent task', goal: 'Ship the bridge',
  acceptance: 'Console shows it', status: 'assigned', authorRole: 'implementer',
  createdAt: 1, updatedAt: 1,
}
const plan: PlanView = {
  id: 'plan-1', briefId: brief.id, workspaceId: brief.workspaceId, title: brief.title,
  version: 1, status: 'draft', steps: [{ id: 'step-1', title: 'Step one', outcome: 'Done', status: 'todo', evidence: [] }],
  createdBy: 'implementer', createdAt: 1, updatedAt: 1,
}

function t(key: string): string { return key }

function renderTask(briefs: readonly BriefView[], plans: readonly PlanView[]): void {
  render(
    <TaskDetailView
      briefs={async () => briefs}
      plans={async () => plans}
      messages={async () => [] as readonly MessageView[]}
      approvePlan={async () => plan}
      sendMessage={async () => { throw new Error('not used') }}
      messageAction={async () => { throw new Error('not used') }}
      transitionBrief={async () => brief}
      t={t}
    />,
  )
}

describe('TaskDetailView', () => {
  it('renders a proposed task and its plan', async () => {
    renderTask([brief], [plan])
    expect((await screen.findAllByText('Agent task')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Ship the bridge')).toBeTruthy()
    screen.getByRole('button', { name: 'plansTitle' }).click()
    expect(await screen.findByText('Step one')).toBeTruthy()
  })

  it('renders a clear empty state when no task was proposed', async () => {
    renderTask([], [])
    expect((await screen.findAllByText('emptyTasksTitle')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('emptyTasksHint')).length).toBeGreaterThan(0)
  })
})
