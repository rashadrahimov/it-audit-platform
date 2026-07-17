import { z } from 'zod';

/** Языки продукта (ADR-0009): контент и письма — EN/AZ/RU, fallback на EN. */
export const localeSchema = z.enum(['en', 'az', 'ru']);

export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = 'en';
