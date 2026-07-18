import { z } from 'zod';

/** Языки продукта (ADR-0009): контент и письма — EN/AZ/RU, fallback на EN. */
export const localeSchema = z.enum(['en', 'az', 'ru']);

export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = 'en';

/** Мультиязычное поле контента (ADR-0009): en обязателен — он же fallback. */
export const i18nTextSchema = z.object({
  en: z.string().min(1),
  az: z.string().optional(),
  ru: z.string().optional(),
});

export type I18nText = z.infer<typeof i18nTextSchema>;

/**
 * Fallback на EN, если перевода нет (ADR-0009). Generic: подходит и для
 * контентных строк (I18nText), и для целых шаблонов (email T-041).
 */
export function resolveLocalized<T>(
  localized: Partial<Record<Locale, T>> & { en: T },
  locale: Locale,
): T {
  return localized[locale] ?? localized.en;
}
