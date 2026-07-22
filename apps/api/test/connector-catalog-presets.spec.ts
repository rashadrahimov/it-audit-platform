import { describe, expect, it } from 'vitest';
import {
  CloudConfigJsonConnectorProvider,
  SiemLogsJsonConnectorProvider,
  TicketingJsonConnectorProvider,
} from '../src/connectors/providers/http-json.provider';

/** T-H100: explicit integration presets required by the AI-audit platform spec. */
describe('connector catalog presets', () => {
  it('exposes ticketing/Jira, cloud configuration and SIEM/log REST presets', () => {
    const providers = [
      new TicketingJsonConnectorProvider(),
      new CloudConfigJsonConnectorProvider(),
      new SiemLogsJsonConnectorProvider(),
    ];

    expect(providers.map((p) => p.provider).sort()).toEqual([
      'cloud_config_json',
      'siem_logs_json',
      'ticketing_jira_json',
    ]);
    expect(providers.find((p) => p.provider === 'ticketing_jira_json')?.capabilities).toEqual([
      'tickets',
      'tasks',
      'evidence',
    ]);
    expect(providers.find((p) => p.provider === 'cloud_config_json')?.capabilities).toEqual([
      'cloud',
      'inventory',
      'evidence',
    ]);
    expect(providers.find((p) => p.provider === 'siem_logs_json')?.capabilities).toEqual([
      'logs',
      'evidence',
      'vulns',
    ]);
    for (const provider of providers) {
      expect(provider.configFields.some((field) => field.key === 'authorization')).toBe(true);
      expect(provider.configFields.some((field) => field.secret)).toBe(true);
    }
  });
});
