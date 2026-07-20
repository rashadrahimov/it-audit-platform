import { describe, expect, it } from 'vitest';
import {
  memberTransitionDenial,
  transitionDenialMessage,
} from '../src/engagements/engagement-stage-permissions';

/**
 * DoD T-123 (follow-up T-116): постадийные права члена команды — чистая логика
 * без БД. Дефолт по роли (observer не двигает; sign-off approval/report_issued —
 * lead/approver) + per-member override через stage_permissions (edit грант,
 * read_only/hidden запрет). Юнит-тест — без инфраструктуры.
 */
describe('memberTransitionDenial — дефолт по роли (T-123)', () => {
  it('lead/approver двигают в sign-off (approval, report_issued)', () => {
    expect(memberTransitionDenial('lead', null, 'report_issued')).toBeNull();
    expect(memberTransitionDenial('approver', null, 'report_issued')).toBeNull();
    expect(memberTransitionDenial('lead', null, 'approval')).toBeNull();
    expect(memberTransitionDenial('approver', null, 'approval')).toBeNull();
  });

  it('assessor/reviewer НЕ двигают в sign-off', () => {
    expect(memberTransitionDenial('assessor', null, 'report_issued')).toBe(
      'signoff_requires_approver',
    );
    expect(memberTransitionDenial('reviewer', null, 'approval')).toBe('signoff_requires_approver');
  });

  it('assessor/reviewer двигают в рабочие стадии', () => {
    expect(memberTransitionDenial('assessor', null, 'findings_drafting')).toBeNull();
    expect(memberTransitionDenial('reviewer', null, 'issued_to_respondents')).toBeNull();
    expect(memberTransitionDenial('assessor', null, 'closed')).toBeNull();
  });

  it('observer не двигает НИЧЕГО (ни рабочие, ни sign-off)', () => {
    expect(memberTransitionDenial('observer', null, 'findings_drafting')).toBe('observer');
    expect(memberTransitionDenial('observer', null, 'report_issued')).toBe('observer');
  });
});

describe('memberTransitionDenial — override через stage_permissions (T-123)', () => {
  it('edit — грант поверх дефолта роли (assessor в sign-off; observer куда угодно)', () => {
    expect(
      memberTransitionDenial('assessor', { report_issued: 'edit' }, 'report_issued'),
    ).toBeNull();
    expect(memberTransitionDenial('assessor', { approval: 'edit' }, 'approval')).toBeNull();
    expect(memberTransitionDenial('observer', { closed: 'edit' }, 'closed')).toBeNull();
  });

  it('read_only/hidden — запрет поверх дефолта роли (даже lead/approver)', () => {
    expect(memberTransitionDenial('lead', { closed: 'read_only' }, 'closed')).toBe('stage_locked');
    expect(memberTransitionDenial('approver', { report_issued: 'hidden' }, 'report_issued')).toBe(
      'stage_locked',
    );
  });

  it('override для ДРУГОЙ стадии не влияет на целевую', () => {
    expect(memberTransitionDenial('lead', { approval: 'hidden' }, 'closed')).toBeNull();
  });
});

describe('transitionDenialMessage (T-123)', () => {
  it('sign-off — про lead/approver (совместимо с regex T-116)', () => {
    const msg = transitionDenialMessage('signoff_requires_approver', 'assessor', 'report_issued');
    expect(msg).toMatch(/approver/);
  });
  it('observer — про наблюдателя', () => {
    expect(transitionDenialMessage('observer', 'observer', 'closed')).toMatch(/наблюдатель/);
  });
  it('stage_locked — про stage_permissions', () => {
    expect(transitionDenialMessage('stage_locked', 'lead', 'closed')).toMatch(/stage_permissions/);
  });
});
