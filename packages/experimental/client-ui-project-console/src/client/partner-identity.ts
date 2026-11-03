/** Stable partner identity derived from a Session title, activity, and manual aliases. */

/** Coarse role inferred from the task title and recent activity. */
export type PartnerRole = 'analysis' | 'implementation' | 'research' | 'operation' | 'guard' | 'general'

const PREFIXES = ['请帮我', '请帮忙', '请', '帮我', '帮忙', '你是一个', '你是一名', '你现在是', '你是', '你在', '子代理', '子会话', '使用', '用', '执行', '运行', '分析', '检查', '查看', '处理', '解决', '修复', '实现', '开发', '研究', '评估', '整理', '读取', '搜索', '收集', '写', '创建', '生成']
const FILLERS = ['工具', '执行', '命令', '并等待', '并回复', '并只回复', '只回复', '立即', '马上', '派生', '父会话', '一个', '两个', '这个', '使用', '用']
const SUFFIXES = ['命令', '任务', '测试', '并等待', '并回复', '并只回复']

/** Role keywords, checked in order. */
const ROLE_WORDS: readonly { readonly role: PartnerRole; readonly words: readonly string[] }[] = [
  { role: 'implementation', words: ['实现', '修复', '开发', '重构', '编码', '写', '创建', '生成', '修改', '实现', '代码'] },
  { role: 'analysis', words: ['分析', '评审', '审查', '复盘', '诊断', '计划'] },
  { role: 'research', words: ['检索', '搜索', '收集', '调研', '读取', '查看', '文档'] },
  { role: 'operation', words: ['执行', '运行', '部署', '启动', 'sleep', 'bash', '安装', '命令'] },
  { role: 'guard', words: ['守护', '监控', '定时', '巡检', '观察'] },
]

/**
 * Normalize a task title into a short partner name.
 * @param title - Session title, usually a task description.
 * @returns the normalized name, or undefined when nothing usable remains.
 */
export function normalizePartnerName(title: string | undefined): string | undefined {
  if (title === undefined) return undefined
  let value = title.replace(/\s+/g, ' ').trim()
  if (value === '') return undefined
  value = value.replace(/[`"'“”‘’]/g, ' ')
  value = value.replace(/^[「『"'(（【\[]+/, '').replace(/[」』"')）】\]。.!！?？,，;；:：]+$/, '').trim()
  value = value.split(/[；;。!！?？]/)[0] ?? value
  let changed = true
  while (changed) {
    changed = false
    for (const prefix of PREFIXES) {
      if (value.startsWith(prefix) && value.length > prefix.length) {
        value = value.slice(prefix.length).trim()
        changed = true
        break
      }
    }
  }
  for (const suffix of SUFFIXES) value = value.split(suffix).join(' ')
  for (const filler of FILLERS) value = value.split(filler).join(' ')
  value = value.replace(/\s+/g, ' ').trim()
  if ([...value].length > 24 && /[=]|--|\//.test(value)) return undefined
  if (/^(?:bash|sh|zsh|pnpm|npm|node|npx|python3?|git|sleep|cd|curl|ls|rg|grep)\b/i.test(value)) return undefined
  for (const prefix of PREFIXES) {
    if (value.startsWith(prefix) && value.length > prefix.length) {
      value = value.slice(prefix.length).trim()
      break
    }
  }
  if (value === '') return undefined
  const characters = [...value]
  return characters.length > 12 ? `${characters.slice(0, 11).join('')}…` : value
}

/**
 * Resolve the display name of one Session.
 * @param sessionId - Session identity.
 * @param title - Session title when known.
 * @param alias - manual alias, when the user renamed the partner.
 * @returns alias, normalized title, or an honest fallback carrying the short id.
 */
export function partnerName(
  sessionId: string,
  title: string | undefined,
  alias: string | undefined,
): string {
  if (alias !== undefined && alias.trim() !== '') return alias.trim()
  const normalized = normalizePartnerName(title)
  if (normalized !== undefined) return normalized
  const tail = sessionId.replace(/^session-/, '').slice(-4)
  return `伙伴 · ${tail}`
}

/**
 * Infer a coarse role from the title and current activity kinds.
 * @param title - Session title when known.
 * @param activityKinds - activity family kinds currently running.
 * @returns the inferred role.
 */
export function partnerRole(title: string | undefined, activityKinds: readonly string[]): PartnerRole {
  if (activityKinds.includes('job')) return 'operation'
  if (activityKinds.includes('schedule')) return 'guard'
  if (activityKinds.includes('subagent')) return 'operation'
  const text = `${title ?? ''} ${activityKinds.join(' ')}`
  for (const { role, words } of ROLE_WORDS) {
    if (words.some(word => text.includes(word))) return role
  }
  return 'general'
}

/**
 * First visible character of a partner name, used as the avatar letter.
 * @param name - partner display name.
 * @returns one character.
 */
export function partnerInitial(name: string): string {
  const first = [...name.trim()][0]
  return first === undefined ? '·' : first.toUpperCase()
}

/**
 * Build an identity for one row.
 * @param row - visible Session row.
 * @param aliases - manual aliases keyed by Session id.
 * @returns the resolved identity.
 */
export function identityOf(
  row: { readonly sessionId: string; readonly title?: string | undefined; readonly activity: readonly { readonly kind: string }[] },
  aliases: ReadonlyMap<string, string>,
): { readonly name: string; readonly role: PartnerRole; readonly initial: string } {
  const name = partnerName(row.sessionId, row.title, aliases.get(row.sessionId))
  return {
    name,
    role: partnerRole(row.title, row.activity.map(entry => entry.kind)),
    initial: partnerInitial(name),
  }
}
