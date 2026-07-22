export const FLASH_COOKIE = 'statera_flash';

export type FlashKind = 'success' | 'error';

export interface FlashPayload {
  kind: FlashKind;
  key: string;
}
