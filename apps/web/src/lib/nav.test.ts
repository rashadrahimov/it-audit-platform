import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, navForCategory } from './nav';

/** T-V50: scoped-навигация внешнего аудитора. */
describe('navForCategory', () => {
  it('internal → полная навигация (без изменений)', () => {
    expect(navForCategory('internal')).toBe(NAV_GROUPS);
  });

  it('неизвестная category → полная (fail-open к internal)', () => {
    expect(navForCategory('whatever')).toBe(NAV_GROUPS);
  });

  it('auditor → скрыта группа org', () => {
    const groups = navForCategory('auditor');
    expect(groups.find((g) => g.group === 'org')).toBeUndefined();
    // остальные группы на месте
    for (const key of ['overview', 'compliance', 'engagements', 'risk', 'security', 'thirdParty']) {
      expect(groups.find((g) => g.group === key)).toBeDefined();
    }
  });

  it('auditor → скрыты IAM-разделы /iam и /access-reviews', () => {
    const groups = navForCategory('auditor');
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain('/iam');
    expect(hrefs).not.toContain('/access-reviews');
    // комплаенс-база и активы/уязвимости — видны
    for (const href of [
      '/controls',
      '/frameworks',
      '/policies',
      '/documents',
      '/vendors',
      '/assets',
      '/vulnerabilities',
      '/findings',
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it('auditor: настроечные разделы (config/roles/sso) недоступны', () => {
    const hrefs = navForCategory('auditor').flatMap((g) => g.items.map((i) => i.href));
    for (const href of [
      '/config',
      '/roles',
      '/members',
      '/api-keys',
      '/sso-settings',
      '/connectors',
    ]) {
      expect(hrefs).not.toContain(href);
    }
  });
});
