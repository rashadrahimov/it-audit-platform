import type { PasswordPolicy } from '@it-audit/shared';

/** Дефолтная политика; тенант переопределяет частично через tenant.settings.passwordPolicy (SEC-01). */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: false,
  expiryDays: null,
  lockoutThreshold: 5,
  lockoutMinutes: 15,
};

export function resolvePolicy(tenantSettings: unknown): PasswordPolicy {
  const override =
    tenantSettings && typeof tenantSettings === 'object'
      ? ((tenantSettings as Record<string, unknown>).passwordPolicy as
          Partial<PasswordPolicy> | undefined)
      : undefined;
  return { ...DEFAULT_PASSWORD_POLICY, ...override };
}

/** Список нарушений (пустой = пароль проходит). Тексты — на дефолтном EN; i18n придёт с T-022. */
export function validatePassword(password: string, policy: PasswordPolicy): string[] {
  const issues: string[] = [];
  if (password.length < policy.minLength) {
    issues.push(`Password must be at least ${policy.minLength} characters long`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    issues.push('Password must contain an uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    issues.push('Password must contain a lowercase letter');
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    issues.push('Password must contain a digit');
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    issues.push('Password must contain a special character');
  }
  return issues;
}
