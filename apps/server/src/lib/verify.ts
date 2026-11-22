/**
 * Digital bill verification. Only bills the system SENT to a customer (WhatsApp / SMS) are checked.
 * A bill is genuine only if the SYSTEM says so: it exists, was sent digitally, is fully paid and not yet verified.
 */
export type Verdict = 'GENUINE' | 'ALREADY_VERIFIED' | 'NOT_SENT' | 'NOT_PAID' | 'CANCELLED' | 'REFUNDED' | 'NOT_FOUND';

interface VerifiableOrder {
  status: string; paymentStatus: string; totalPaise: number; paidPaise: number; verifiedAt?: Date | null; digital?: { sentAt?: Date | null } | null;
}

export function verdictFor(order: VerifiableOrder | null | undefined): Verdict {
  if (!order || order.status === 'DRAFT') return 'NOT_FOUND';
  if (order.status === 'CANCELLED') return 'CANCELLED';
  if (order.paymentStatus === 'REFUNDED') return 'REFUNDED';
  if (!order.digital?.sentAt) return 'NOT_SENT';
  if (order.paidPaise < order.totalPaise || order.paymentStatus !== 'PAID') return 'NOT_PAID';
  if (order.verifiedAt) return 'ALREADY_VERIFIED';
  return 'GENUINE';
}

/** "12" means today's bill 12; a full number (AM-20261120-0012) is used for older bills. */
export function parseBillInput(input: unknown, todayYmd: string): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d{1,4}$/.test(t)) return `AM-${todayYmd}-${t.padStart(4, '0')}`;
  if (/^AM-\d{8}-\d{4}$/.test(t)) return t;
  return null;
}

/** Last 4 digits of an Indian mobile number, or null when the input is not a valid mobile. The full number is never stored here. */
export function phoneLast4(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const d = input.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d.slice(-4) : null;
}
