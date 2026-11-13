// Role-based access control — the single source of truth shared by the main
// process (enforcement) and the renderer (what to show). Pure, so it is unit-tested.
//
// Roles are DATA, not a fixed type: owners can create their own roles with custom
// permission sets. `owner` is the one protected, all-access role that always exists.

export type TabPermission = 'products' | 'purchases' | 'reports' | 'settings'
export type ActionPermission = 'discount' | 'refund'
export type Permission = TabPermission | ActionPermission

export const TAB_PERMISSIONS: TabPermission[] = ['products', 'purchases', 'reports', 'settings']
export const ACTION_PERMISSIONS: ActionPermission[] = ['discount', 'refund']
export const PERMISSIONS: Permission[] = [...TAB_PERMISSIONS, ...ACTION_PERMISSIONS]

// A role is identified by a stable key; built-ins use fixed keys, custom roles a UUID.
export type UserRole = string
export const OWNER_ROLE = 'owner'

export interface RoleDef {
  key: string
  name: string // display name (built-ins may be shown via i18n instead)
  system: boolean // built-in, cannot be deleted (only `owner` currently)
  allAccess: boolean // holds every permission with toggles locked on (owner)
  permissions: Record<Permission, boolean>
}

function perms(value: boolean): Record<Permission, boolean> {
  return PERMISSIONS.reduce(
    (acc, p) => {
      acc[p] = value
      return acc
    },
    {} as Record<Permission, boolean>
  )
}

// Seeded on first run. Owner is protected; manager/cashier are ordinary editable
// (and deletable) roles that simply ship as sensible starting points.
export const DEFAULT_ROLES: RoleDef[] = [
  { key: 'owner', name: 'Owner', system: true, allAccess: true, permissions: perms(true) },
  {
    key: 'manager',
    name: 'Manager',
    system: false,
    allAccess: false,
    permissions: {
      products: true,
      purchases: true,
      reports: true,
      settings: false,
      discount: true,
      refund: true
    }
  },
  { key: 'cashier', name: 'Cashier', system: false, allAccess: false, permissions: perms(false) }
]

/** Does the role with this key hold this permission? Unknown role → denied. */
export function roleCan(roleKey: string, perm: Permission, roles: RoleDef[]): boolean {
  const r = roles.find((x) => x.key === roleKey)
  if (!r) return false
  if (r.allAccess) return true
  return !!r.permissions[perm]
}

/** The tab permission a tab requires, or null if the tab is always available. */
export function tabPermission(tab: string): TabPermission | null {
  return (TAB_PERMISSIONS as string[]).includes(tab) ? (tab as TabPermission) : null
}

/** Make a blank permission map (all false) for a newly created role. */
export function blankPermissions(): Record<Permission, boolean> {
  return perms(false)
}

/**
 * Coerce an arbitrary roles array (from storage or the UI) into complete, valid
 * RoleDefs: a full permission map per role, exactly one protected all-access owner.
 */
export type RoleInput = {
  key?: string
  name?: string
  permissions?: Partial<Record<Permission, boolean>>
}

export function normalizeRoles(
  input: Array<RoleInput | null | undefined> | null | undefined
): RoleDef[] {
  const list: RoleDef[] = []
  for (const r of input ?? []) {
    if (!r || !r.key) continue
    const isOwner = r.key === OWNER_ROLE
    list.push({
      key: r.key,
      name: (r.name ?? '').trim() || r.key,
      system: isOwner,
      allAccess: isOwner,
      permissions: { ...perms(false), ...(r.permissions ?? {}) }
    })
  }
  // Guarantee a protected owner role.
  const owner = list.find((r) => r.key === OWNER_ROLE)
  if (!owner) {
    list.unshift({ key: 'owner', name: 'Owner', system: true, allAccess: true, permissions: perms(true) })
  } else {
    owner.permissions = perms(true)
  }
  return list
}
