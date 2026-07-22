import { describe, expect, it } from 'vitest';
import { AiService, aiPrivacyPosture } from '../src/ai/ai.service';
import type { DbService } from '../src/db/db.service';

/**
 * DoD EP-AI (T-H21): каркас LLM ВЫКЛЮЧЕН по умолчанию (AI_PROVIDER не задан в тестовом env).
 * Инвариант: on-prem/дефолт остаётся без ИИ (ADR-0002), детерминированный fallback работает.
 * Env-уровневые методы не трогают БД — DbService-заглушки достаточно.
 */
describe('AiService — off by default', () => {
  const svc = new AiService({} as unknown as DbService);

  it('enabled()=false и status() без модели, когда провайдер не сконфигурирован', () => {
    expect(svc.enabled()).toBe(false);
    expect(svc.status()).toEqual({
      enabled: false,
      provider: 'none',
      model: null,
      baseUrl: null,
    });
  });

  it('draftText() возвращает null, когда ИИ выключен (вызывающий → детерминированный fallback)', async () => {
    expect(await svc.draftText('system', 'user')).toBeNull();
  });

  it('privacy posture keeps deterministic/off mode local-only with no training use', () => {
    expect(svc.privacyPostureForDeployment()).toMatchObject({
      provider: 'none',
      source: 'deterministic',
      externalAiEnabled: false,
      dataEgress: 'none',
      residencyMode: 'local_only',
      trainingUseAllowed: false,
      zeroDataRetentionRequired: false,
      requiresDpa: false,
      controls: {
        tenantIsolation: true,
        encryptedSecrets: true,
        evidenceGroundedOutputRequired: true,
        humanReviewRequired: true,
      },
      deploymentClass: 'deterministic_no_ai',
      processingObligations: {
        dataProcessingAgreementRequired: false,
        zeroDataRetentionRequired: false,
        privateDeploymentRecommended: false,
        customerDataUsedForTraining: false,
      },
    });
    const posture = svc.privacyPostureForDeployment();
    expect(posture.assuranceClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'no_training', status: 'enforced' }),
        expect.objectContaining({ key: 'tenant_isolation', status: 'enforced' }),
        expect.objectContaining({ key: 'encrypted_secrets', status: 'enforced' }),
        expect.objectContaining({ key: 'zero_retention', status: 'not_applicable' }),
      ]),
    );
  });

  it('classifies private OpenAI-compatible endpoints as private-network residency', () => {
    expect(
      aiPrivacyPosture({
        provider: 'openai_compat',
        baseUrl: 'http://ollama:11434/v1',
        model: 'llama3.1',
        source: 'tenant_override',
        configured: true,
      }),
    ).toMatchObject({
      externalAiEnabled: true,
      dataEgress: 'private_network',
      residencyMode: 'private_network',
      deploymentClass: 'private_ai_endpoint',
      trainingUseAllowed: false,
      zeroDataRetentionRequired: false,
      requiresDpa: false,
      processingObligations: {
        dataProcessingAgreementRequired: false,
        zeroDataRetentionRequired: false,
        privateDeploymentRecommended: false,
        customerDataUsedForTraining: false,
      },
    });
  });

  it('flags cloud providers as external data egress requiring DPA and zero retention', () => {
    const posture = aiPrivacyPosture({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      source: 'tenant_override',
      configured: true,
    });
    expect(posture).toMatchObject({
      externalAiEnabled: true,
      dataEgress: 'external_provider',
      residencyMode: 'external_provider',
      deploymentClass: 'external_ai_provider',
      trainingUseAllowed: false,
      zeroDataRetentionRequired: true,
      requiresDpa: true,
      processingObligations: {
        dataProcessingAgreementRequired: true,
        zeroDataRetentionRequired: true,
        privateDeploymentRecommended: true,
        customerDataUsedForTraining: false,
      },
    });
    expect(posture.assuranceClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'zero_retention', status: 'required' }),
        expect.objectContaining({ key: 'dpa_required', status: 'required' }),
        expect.objectContaining({ key: 'no_training', status: 'enforced' }),
      ]),
    );
  });
});
