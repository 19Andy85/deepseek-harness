/** Inline icon set for activity kinds and console affordances. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { readonly size?: number }

function Icon({ size = 12, children, ...rest }: IconProps & { readonly children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** A running turn: an advancing chevron. */
export function TurnIcon(props: IconProps) {
  return <Icon {...props}><path d="M6 3.5 11 8l-5 4.5" /></Icon>
}

/** A background job: a stacked container. */
export function JobIcon(props: IconProps) {
  return <Icon {...props}><path d="M2.5 5.5 8 2.5l5.5 3L8 8.5z" /><path d="M2.5 8.5 8 11.5l5.5-3" /></Icon>
}

/** A derived subagent: a branching path. */
export function SubagentIcon(props: IconProps) {
  return <Icon {...props}><circle cx="3.5" cy="3.5" r="1.5" /><circle cx="12.5" cy="12.5" r="1.5" /><path d="M3.5 5v3.5a2 2 0 0 0 2 2H10" /></Icon>
}

/** A scheduled task: a clock. */
export function ScheduleIcon(props: IconProps) {
  return <Icon {...props}><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></Icon>
}

/** An empty desk with a status lamp. */
export function DeskIcon(props: IconProps) {
  return <Icon size={28} {...props}><path d="M2.5 6.5h11v6h-11z" /><path d="M2.5 10.5h11" /><circle cx="12.5" cy="4" r="1.5" /></Icon>
}

/** A paused waiting state: two bars. */
export function PauseIcon(props: IconProps) {
  return <Icon {...props}><path d="M6 4v8M10 4v8" /></Icon>
}

/** Expand/collapse chevron, rotated by the caller. */
export function ChevronIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 6.5 8 10l4-3.5" /></Icon>
}
