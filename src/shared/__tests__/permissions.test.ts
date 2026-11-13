import { describe, it, expect } from 'vitest'
import {
  roleCan,
  tabPermission,
  normalizeRoles,
  blankPermissions,
  DEFAULT_ROLES,
  PERMISSIONS,
  OWNER_ROLE
} from '../permissions'

describe('roleCan', () => {
  it('owner can do everything, including settings', () => {
    for (const perm of PERMISSIONS) expect(roleCan('owner', perm, DEFAULT_ROLES)).toBe(true)
  })

  it('manager defaults: floor control but not settings', () => {
    expect(roleCan('manager', 'products', DEFAULT_ROLES)).toBe(true)
    expect(roleCan('manager', 'refund', DEFAULT_ROLES)).toBe(true)
    expect(roleCan('manager', 'settings', DEFAULT_ROLES)).toBe(false)
  })

  it('cashier defaults: sell only', () => {
    for (const perm of PERMISSIONS) expect(roleCan('cashier', perm, DEFAULT_ROLES)).toBe(false)
  })

  it('an unknown role is denied everything', () => {
    expect(roleCan('ghost', 'reports', DEFAULT_ROLES)).toBe(false)
  })

  it('reads permissions from a custom role', () => {
    const roles = normalizeRoles([
      ...DEFAULT_ROLES,
      { key: 'r1', name: 'Supervisor', permissions: { reports: true, refund: true } }
    ])
    expect(roleCan('r1', 'reports', roles)).toBe(true)
    expect(roleCan('r1', 'refund', roles)).toBe(true)
    expect(roleCan('r1', 'settings', roles)).toBe(false)
  })
})

describe('normalizeRoles', () => {
  it('always produces a protected all-access owner', () => {
    const roles = normalizeRoles([{ key: 'cashier', name: 'Cashier', permissions: blankPermissions() }])
    const owner = roles.find((r) => r.key === OWNER_ROLE)
    expect(owner).toBeDefined()
    expect(owner!.allAccess).toBe(true)
    expect(owner!.system).toBe(true)
    for (const perm of PERMISSIONS) expect(owner!.permissions[perm]).toBe(true)
  })

  it('fills a complete permission map even from partial input', () => {
    const roles = normalizeRoles([{ key: 'x', name: 'X', permissions: { reports: true } }])
    const x = roles.find((r) => r.key === 'x')!
    expect(x.permissions.reports).toBe(true)
    expect(x.permissions.settings).toBe(false)
    expect(Object.keys(x.permissions).sort()).toEqual([...PERMISSIONS].sort())
  })

  it('forces owner all-access even if storage tried to restrict it', () => {
    const roles = normalizeRoles([{ key: 'owner', name: 'Owner', permissions: blankPermissions() }])
    expect(roleCan('owner', 'settings', roles)).toBe(true)
  })

  it('drops entries without a key and empty input still yields owner', () => {
    expect(normalizeRoles([]).map((r) => r.key)).toEqual(['owner'])
    expect(normalizeRoles(null).map((r) => r.key)).toEqual(['owner'])
  })

  it('custom roles are non-system (deletable); owner is system', () => {
    const roles = normalizeRoles([...DEFAULT_ROLES, { key: 'r2', name: 'Night shift' }])
    expect(roles.find((r) => r.key === 'owner')!.system).toBe(true)
    expect(roles.find((r) => r.key === 'manager')!.system).toBe(false)
    expect(roles.find((r) => r.key === 'r2')!.system).toBe(false)
  })
})

describe('tabPermission', () => {
  it('maps management tabs to their permission', () => {
    expect(tabPermission('products')).toBe('products')
    expect(tabPermission('settings')).toBe('settings')
  })
  it('returns null for always-available tabs', () => {
    expect(tabPermission('sale')).toBeNull()
    expect(tabPermission('returns')).toBeNull()
  })
})
