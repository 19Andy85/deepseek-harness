/** Sidebar footer balance badge: the latest DeepSeek account wallet, when available. */
import { useEffect, useState } from 'react'
import css from './BalanceBadge.module.css'

/** One wallet the account endpoint reports. */
export interface BalanceWallet {
  /** Wallet currency. */
  readonly currency: 'CNY' | 'USD'
  /** Decimal balance string retained from the server. */
  readonly balance: string
}

/**
 * Render the wallet balance above the sidebar footer.
 * @param props.read - reads the current wallets; resolves undefined when unavailable.
 * @returns the badge, or null while the balance is unavailable.
 */
export function BalanceBadge({
  read, label,
}: {
  readonly read: () => Promise<readonly BalanceWallet[] | undefined>
  readonly label: string
}) {
  const [wallets, setWallets] = useState<readonly BalanceWallet[] | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const value = await read()
        if (alive) setWallets(value)
      } catch {
        if (alive) setWallets(undefined)
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, 60_000)
    return () => { alive = false; clearInterval(timer) }
  }, [read])
  if (wallets === undefined || wallets.length === 0) return null
  const wallet = wallets.find(candidate => candidate.currency === 'CNY') ?? wallets[0]
  if (wallet === undefined) return null
  const symbol = wallet.currency === 'CNY' ? '¥' : '$'
  const amount = Number(wallet.balance)
  const display = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : wallet.balance
  return (
    <span className={css.balance} title={`${wallet.currency} ${wallet.balance}`}>
      {label}{symbol}{display}
    </span>
  )
}
