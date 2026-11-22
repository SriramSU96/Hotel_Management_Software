/**
 * CSV cell escaping with spreadsheet-formula protection. Text that starts with = + - @ (or a tab/CR) is
 * prefixed with an apostrophe so Excel/Sheets show it as text instead of running it. Plain numbers are left alone.
 * This matters because the public QR feedback form lets any visitor put text into the owner's exports.
 */
export function csvCell(v: unknown): string {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
