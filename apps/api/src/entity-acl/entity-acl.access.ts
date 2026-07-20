/**
 * T-V48 (ADR-0021): чистый резолвер per-entity ACL. Семантика additive-restrictive:
 * нет грантов → сущность открыта всему тенанту (restricted=false, RBAC решает дальше);
 * есть гранты → доступ только у грантов + владельца + админа.
 * canView/canEdit тут — «ACL разрешает»; вызывающий И-объединяет их с RBAC.
 */
export interface AclGrant {
  membershipId: string;
  level: string;
}

export interface AccessResult {
  restricted: boolean;
  canView: boolean;
  canEdit: boolean;
}

export function resolveEntityAccess(
  grants: AclGrant[],
  membershipId: string | null,
  ownerMembershipId: string | null,
  isAdmin: boolean,
): AccessResult {
  if (grants.length === 0) return { restricted: false, canView: true, canEdit: true };
  if (isAdmin) return { restricted: true, canView: true, canEdit: true };
  const isOwner = membershipId !== null && membershipId === ownerMembershipId;
  const mine = membershipId ? grants.find((g) => g.membershipId === membershipId) : undefined;
  const canView = isOwner || mine !== undefined;
  const canEdit = isOwner || mine?.level === 'edit';
  return { restricted: true, canView, canEdit };
}
