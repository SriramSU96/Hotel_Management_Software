import { api } from './api';

interface ReceiptData { lines: string[]; paperMm: number; fontPx: number; copies: number }

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

/** Opens the computer's normal print window for any printer (USB, Wi-Fi, PDF). Text is escaped: nothing typed into an order can run as code. */
export function printLines(d: ReceiptData) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const doc = f.contentDocument!;
  const one = `<pre>${esc(d.lines.join('\n'))}</pre>`;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
    @page { size: ${d.paperMm}mm auto; margin: 0 }
    html,body { margin:0; background:#fff }
    pre { margin:0; padding:3mm; width:${d.paperMm}mm; box-sizing:border-box; font:${d.fontPx}px/1.25 "Courier New", monospace; color:#000; white-space:pre; overflow:hidden; page-break-after:always }
    pre:last-child { page-break-after:auto }
  </style></head><body>${Array.from({ length: d.copies }, () => one).join('')}</body></html>`);
  doc.close();
  const win = f.contentWindow!;
  const cleanup = () => setTimeout(() => f.remove(), 1000);
  win.addEventListener('afterprint', cleanup);
  setTimeout(() => { win.focus(); win.print(); setTimeout(cleanup, 60_000); }, 150);
}

/** Print an order's bill or kitchen ticket from the browser. */
export async function printReceipt(orderId: string, kind: 'BILL' | 'KOT' = 'BILL', copy = false) {
  printLines(await api<ReceiptData>(`/orders/${orderId}/receipt?kind=${kind}&copy=${copy ? '1' : '0'}`));
}

/** A sample slip so the owner can test the paper size and the printer in Settings. */
export function printTest(paperMm: number, fontPx: number, copies = 1) {
  const w = paperMm <= 58 ? 32 : paperMm <= 80 ? 42 : 64;
  const rule = '-'.repeat(w);
  printLines({ paperMm, fontPx, copies, lines: ['AMMAS PRINT TEST'.padStart((w + 16) / 2).padEnd(w), rule, `Paper ${paperMm} mm, ${w} characters per line`, '1 x Tea                         Rs. 10.00'.slice(0, w), rule, 'If this slip is complete,', 'the printer is ready.'] });
}
