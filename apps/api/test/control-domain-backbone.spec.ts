import { describe, expect, it } from 'vitest';
import { CONTROL_DOMAINS, GLOBAL_CONTROLS } from '../src/seed-data/global-controls';
import { CBAR_DOMAINS, GLOBAL_FRAMEWORKS } from '../src/seed-data/global-frameworks';

describe('32-domain audit methodology backbone', () => {
  it('defines exactly 32 unique localized control domains', () => {
    expect(CONTROL_DOMAINS).toHaveLength(32);
    const codes = CONTROL_DOMAINS.map((domain) => domain.code);
    expect(new Set(codes).size).toBe(32);
    for (const domain of CONTROL_DOMAINS) {
      expect(domain.name.en).toBeTruthy();
      expect(domain.name.az).toBeTruthy();
      expect(domain.name.ru).toBeTruthy();
    }
  });

  it('keeps at least one starter control in every domain', () => {
    const domainCodes = new Set(CONTROL_DOMAINS.map((domain) => domain.code));
    const controlDomains = new Set(GLOBAL_CONTROLS.map((control) => control.domain));
    expect([...controlDomains].filter((code) => !domainCodes.has(code))).toEqual([]);
    expect([...domainCodes].filter((code) => !controlDomains.has(code))).toEqual([]);
  });

  it('uses the same 32-domain scope for CBAR framework requirements', () => {
    const cbar = GLOBAL_FRAMEWORKS.find((framework) => framework.name.en === 'CBAR IT Audit');
    expect(cbar).toBeTruthy();
    expect(CBAR_DOMAINS).toHaveLength(32);
    expect(cbar?.requirements.map((requirement) => requirement.ref)).toEqual(
      CONTROL_DOMAINS.map((domain) => domain.code),
    );
  });
});
