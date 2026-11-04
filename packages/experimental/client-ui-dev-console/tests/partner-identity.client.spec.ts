/** Partner naming, role inference, and alias resolution. */

import { describe, expect, it } from 'vitest'
import { identityOf, normalizePartnerName, partnerInitial, partnerName, partnerRole } from '../src/client/partner-identity.ts'

describe('partner identity', () => {
  it('normalizes task titles into short names', () => {
    expect(normalizePartnerName('分析 DeepTutor 开源项目')).toBe('DeepTutor 开源项目')
    expect(normalizePartnerName('请执行 bash 命令 sleep 60 并等待')).toBe('bash sleep 60')
    expect(normalizePartnerName('使用 bash 工具执行命令 sleep 60；然后回复')).toBe('bash sleep 60；然后回复')
    expect(normalizePartnerName('子代理执行 sleep 60')).toBe('sleep 60')
    expect(normalizePartnerName('  ')).toBeUndefined()
  })

  it('caps long names', () => {
    const name = normalizePartnerName('这是一个非常非常长的任务标题用来测试截断行为')
    expect([...(name ?? '')]).toHaveLength(14)
    expect(name?.endsWith('…')).toBe(true)
  })

  it('prefers aliases and falls back to an id-bearing name', () => {
    expect(partnerName('session-1234abcd', '分析 DeepTutor 开源项目', '小析')).toBe('小析')
    expect(partnerName('session-1234abcd', undefined, undefined)).toBe('伙伴 · abcd')
    expect(partnerName('session-1234abcd', '分析 DeepTutor 开源项目', undefined)).toBe('DeepTutor 开源项目')
  })

  it('infers coarse roles from titles and activity', () => {
    expect(partnerRole('修复登录 bug', [])).toBe('implementation')
    expect(partnerRole('分析 DeepTutor 开源项目', [])).toBe('analysis')
    expect(partnerRole(undefined, ['job'])).toBe('operation')
    expect(partnerRole('整理今日安排', [])).toBe('general')
  })

  it('builds row identities including the initial', () => {
    const identity = identityOf({ sessionId: 'session-1234abcd', title: '分析 DeepTutor 开源项目', activity: [] }, new Map())
    expect(identity).toEqual({ name: 'DeepTutor 开源项目', role: 'analysis', initial: 'D' })
    expect(partnerInitial('小析')).toBe('小')
  })
})
