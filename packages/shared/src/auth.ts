import { z } from 'zod';
import { localeSchema } from './i18n';

/** Контракты /auth — локальные аккаунты (T-013, ADR-0006, SEC-01/02). */

export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(4),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireDigit: z.boolean(),
  requireSpecial: z.boolean(),
  /** null — пароль не истекает. */
  expiryDays: z.number().int().positive().nullable(),
  lockoutThreshold: z.number().int().positive(),
  lockoutMinutes: z.number().int().positive(),
});

export const registerRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  fullName: z.string().min(1),
  locale: localeSchema.optional(),
  /** Слаг тенанта — применяет его парольную политику (полная связка придёт с invite-flow T-015). */
  tenantSlug: z.string().optional(),
});

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/** LDAP-логин (T-025): username — uid/sAMAccountName/mail, что найдёт фильтр поиска. */
export const ldapLoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export const authTokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresInSeconds: z.number().int().positive(),
});

/** Логин при включённой MFA: сначала челлендж, потом /auth/mfa/verify (T-014). */
export const mfaChallengeResponseSchema = z.object({
  mfaRequired: z.literal(true),
  mfaToken: z.string(),
});

export const loginResponseSchema = z.union([authTokenResponseSchema, mfaChallengeResponseSchema]);

export const mfaSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrDataUrl: z.string(),
});

export const mfaEnableRequestSchema = z.object({ code: z.string().min(6) });

export const mfaEnableResponseSchema = z.object({
  recoveryCodes: z.array(z.string()).length(10),
});

export const mfaVerifyRequestSchema = z.object({
  mfaToken: z.string().min(1),
  /** TOTP-код или одноразовый recovery-код. */
  code: z.string().min(6),
});

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.email(),
  fullName: z.string(),
  locale: localeSchema,
});

export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LdapLoginRequest = z.infer<typeof ldapLoginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
export type MfaChallengeResponse = z.infer<typeof mfaChallengeResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;
export type MfaEnableRequest = z.infer<typeof mfaEnableRequestSchema>;
export type MfaEnableResponse = z.infer<typeof mfaEnableResponseSchema>;
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
