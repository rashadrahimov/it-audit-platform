/**
 * Провайдер-абстракция email (ADR-0002/0008): продукт зависит только от этого
 * интерфейса. SMTP — базовая реализация (on-prem); облачные провайдеры
 * добавляются новой реализацией без правок доменного кода.
 */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
}
