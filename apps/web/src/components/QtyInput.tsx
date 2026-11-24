import { useState } from 'react';

/**
 * Quantity number the cashier can tap and type over (1-99).
 * - typing a number updates the order straight away
 * - 0 + Enter/blur removes the item; empty + blur restores the old number
 * - the +/- buttons keep working beside it
 */
export default function QtyInput({ value, onChange, className = '', label = 'Quantity' }: { value: number; onChange: (n: number) => void; className?: string; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onChange(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      autoComplete="off"
      value={draft ?? String(value)}
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 2);
        setDraft(d);
        const n = parseInt(d, 10);
        if (n > 0) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`num text-center ${className}`}
    />
  );
}
