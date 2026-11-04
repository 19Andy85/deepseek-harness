/** Partner avatar: initial with a role-colored ring; status stays on the status dot. */
import type { PartnerRole } from './partner-identity.ts'
import css from './PartnerAvatar.module.css'

/**
 * Render one partner avatar.
 * @param props - display name, initial, role, and optional size.
 * @returns the avatar element.
 */
export function PartnerAvatar({
  name, initial, role, size = 26,
}: {
  readonly name: string
  readonly initial: string
  readonly role: PartnerRole
  readonly size?: number
}) {
  return (
    <span
      className={`${css.avatar} ${css[role]}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      title={name}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}
