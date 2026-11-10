/** Root/subcall Tool composition with one keyed atomic dispatch path. */
import { memo, useMemo, type ReactNode } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps } from '../contract/slots.ts'
import { toolRowModel } from './models/tool-call-model.ts'
import { GenericToolCard } from './toolviews/GenericToolCard.tsx'
import css from './ToolCallTree.module.css'

function toolCallPhase(block: ToolCallBlock): ToolCallPhaseProps {
  if ('kind' in block) return { phase: 'result', block }
  return block.phase === 'preparing' ? { phase: 'preparing', block } : { phase: 'start', block }
}

/** Resolve a Tool call's wire name from its current stage. */
function callName(call: ToolCallPhaseProps): string {
  return call.phase === 'result' ? call.block.call?.name ?? '' : call.block.name
}

/**
 * Whether one nested sub-call asks for its own top-level card. Tools opt in
 * through their replayable presentation metadata (`meta.promote === true`), so
 * promotion stays a tool-owned decision rather than a UI name table; every other
 * sub-call keeps the compact nested form.
 * @param block - settled or running nested call.
 * @returns true when the call should render as a sibling row.
 */
function isPromotable(block: ToolCallBlock): boolean {
  if (!('kind' in block)) return false
  const meta = block.meta
  return meta !== null && typeof meta === 'object' && (meta as { promote?: unknown }).promote === true
}

/** Split nested calls into promoted rows and compact nested rows, in dispatch order. */
function partitionSubCalls(block: ToolCallBlock): { promoted: readonly ToolCallBlock[]; compact: readonly ToolCallBlock[] } {
  const promoted: ToolCallBlock[] = []
  const compact: ToolCallBlock[] = []
  for (const child of block.subCalls) {
    if (isPromotable(child)) promoted.push(child)
    else compact.push(child)
  }
  return { promoted: promoted, compact: compact }
}

/** One atomic call dispatched through the Tool-owned keyed slot. */
const ToolCall = memo(function ToolCall({
  renderSlot, callId, toolName, call, openFile, cwd, home, inspectCall, loadImage, useDisclosure, t, children,
}: Pick<ToolTreeProps, 'renderSlot' | 'openFile' | 'cwd' | 'inspectCall' | 'loadImage' | 'useDisclosure' | 't'> & {
  callId: string
  toolName: string
  call: ToolCallPhaseProps
  home?: string | undefined
  children?: ReactNode
}) {
  const owner: ToolCallOwnerProps = useMemo(() => ({
    callId,
    toolName,
    ...call,
    openFile,
    cwd,
    home,
    loadImage,
    useDisclosure,
    inspect: inspectCall === undefined ? undefined : () => { inspectCall(callId) },
  }), [callId, toolName, call, openFile, cwd, home, loadImage, inspectCall, useDisclosure])
  const autoReviewDenied = useMemo(
    () => call.phase === 'result' && toolRowModel(toolName, call.block).autoReviewDenial !== null,
    [toolName, call],
  )
  return (
    <div
      className={css.callRow}
      data-chat-anchor-key={`call:${callId}`}
      data-chat-call-id={callId}
    >
      {autoReviewDenied
        ? <GenericToolCard {...owner} t={t} />
        : renderSlot('tool.call.toolview', owner, {
          entryKey: toolName,
          fallback: <GenericToolCard {...owner} t={t} />,
        })}
      {children}
    </div>
  )
})

const ToolCallBranch = memo(function ToolCallBranch({
  renderSlot, block, cwd, home, openFile, inspectCall, loadImage, useDisclosure, t,
}: Pick<ToolTreeProps, 'renderSlot' | 'cwd' | 'openFile' | 'inspectCall' | 'loadImage' | 'useDisclosure' | 't'> & {
  block: ToolCallBlock
  home?: string | undefined
}) {
  const call = useMemo(() => toolCallPhase(block), [block])
  const nested = useMemo(
    () => call.phase === 'preparing' ? { promoted: [], compact: [] } : partitionSubCalls(call.block),
    [call],
  )
  return (
    <>
      <ToolCall
        renderSlot={renderSlot}
        callId={call.block.callId}
        toolName={callName(call)}
        call={call}
        openFile={openFile}
        cwd={cwd}
        home={home}
        inspectCall={inspectCall}
        useDisclosure={useDisclosure}
        loadImage={loadImage}
        t={t}
      >
        {nested.compact.length > 0 ? (
          <div className={css.subCalls} data-subcalls>
            {nested.compact.map(child => (
              <ToolCallBranch
                key={child.callId}
                renderSlot={renderSlot}
                block={child}
                cwd={cwd}
                home={home}
                openFile={openFile}
                inspectCall={inspectCall}
                useDisclosure={useDisclosure}
                loadImage={loadImage}
                t={t}
              />
            ))}
          </div>
        ) : null}
      </ToolCall>
      {nested.promoted.length > 0 ? (
        <div className={css.promotedSubCalls} data-promoted-subcalls>
          {nested.promoted.map(child => (
            <ToolCallBranch
              key={child.callId}
              renderSlot={renderSlot}
              block={child}
              cwd={cwd}
              home={home}
              openFile={openFile}
              inspectCall={inspectCall}
              useDisclosure={useDisclosure}
              loadImage={loadImage}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </>
  )
})

/**
 * Render one root Tool call and its recursive children through the same
 * atomic keyed dispatch.
 * @param props - whole-Tool owner data and the Tool-owned child-slot share.
 * @returns the Tool call tree.
 */
export function ToolCallTree({
  renderSlot, node, cwd, openFile, inspectCall, loadImage, useDisclosure, useHostInfo, t,
}: ToolTreeProps) {
  const home = useHostInfo(info => info.home)
  return (
    <ToolCallBranch
      renderSlot={renderSlot}
      block={node.data.root}
      cwd={cwd}
      home={home}
      openFile={openFile}
      inspectCall={inspectCall}
      useDisclosure={useDisclosure}
      loadImage={loadImage}
      t={t}
    />
  )
}
