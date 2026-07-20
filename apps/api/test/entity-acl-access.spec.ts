import { describe, expect, it } from 'vitest';
import { resolveEntityAccess } from '../src/entity-acl/entity-acl.access';

/** T-V48: additive-restrictive per-entity ACL. */
describe('resolveEntityAccess', () => {
  it('нет грантов → открыто всем (restricted=false)', () => {
    expect(resolveEntityAccess([], 'm1', 'owner', false)).toEqual({
      restricted: false,
      canView: true,
      canEdit: true,
    });
  });

  it('есть гранты, member не в списке и не владелец → нет доступа', () => {
    const r = resolveEntityAccess([{ membershipId: 'm2', level: 'view' }], 'm1', 'owner', false);
    expect(r).toEqual({ restricted: true, canView: false, canEdit: false });
  });

  it('member с грантом view → view да, edit нет', () => {
    const r = resolveEntityAccess([{ membershipId: 'm1', level: 'view' }], 'm1', 'owner', false);
    expect(r).toEqual({ restricted: true, canView: true, canEdit: false });
  });

  it('member с грантом edit → view и edit', () => {
    const r = resolveEntityAccess([{ membershipId: 'm1', level: 'edit' }], 'm1', 'owner', false);
    expect(r).toEqual({ restricted: true, canView: true, canEdit: true });
  });

  it('владелец видит и правит даже без явного гранта', () => {
    const r = resolveEntityAccess([{ membershipId: 'm2', level: 'edit' }], 'owner', 'owner', false);
    expect(r).toEqual({ restricted: true, canView: true, canEdit: true });
  });

  it('админ всегда видит и правит ограниченную сущность', () => {
    const r = resolveEntityAccess([{ membershipId: 'm2', level: 'view' }], 'm1', 'owner', true);
    expect(r).toEqual({ restricted: true, canView: true, canEdit: true });
  });

  it('анонимный membership (null) при грантах → нет доступа', () => {
    const r = resolveEntityAccess([{ membershipId: 'm2', level: 'view' }], null, 'owner', false);
    expect(r).toEqual({ restricted: true, canView: false, canEdit: false });
  });
});
