import 'dotenv/config';
import net from 'node:net';
import fs from 'node:fs';

/**
 * AMMAS print bridge. Runs on the cashier computer next to the printer.
 * It only makes OUTBOUND calls to the AMMAS server and only talks to the one configured printer.
 * No inbound port is opened, so nothing about the printer is exposed to the internet.
 */
const SERVER = (process.env.SERVER_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const MODE = (process.env.PRINTER_MODE ?? 'DRYRUN').toUpperCase();
const HOST = process.env.PRINTER_HOST ?? '';
const PORT = Number(process.env.PRINTER_PORT ?? 9100);
const PATH_ = process.env.PRINTER_PATH ?? '';
const POLL = Number(process.env.POLL_MS ?? 1500);
const CUT = process.env.CUT_PAPER !== '0';

if (!SERVER || TOKEN.length < 16) {
  console.error('Set SERVER_URL and BRIDGE_TOKEN (16+ chars) in apps/print-bridge/.env');
  process.exit(1);
}

const ESC = 0x1b, GS = 0x1d, DLE = 0x10, EOT = 0x04;
const INIT = Buffer.from([ESC, 0x40]);
const CUT_CMD = Buffer.from([GS, 0x56, 0x42, 0x00]); // feed + partial cut
const BOLD_ON = Buffer.from([ESC, 0x45, 1]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0]);

/** ESC/POS is single-byte: replace characters the printer cannot render so the bill never garbles. */
function toPrinterText(s: string) {
  return s.replace(/[^\x20-\x7e]/g, '?');
}

function build(lines: string[]) {
  const parts: Buffer[] = [INIT];
  lines.forEach((l, i) => {
    const heading = i === 0 || /^\*\*\*/.test(l.trim());
    if (heading) parts.push(BOLD_ON);
    parts.push(Buffer.from(toPrinterText(l) + '\n', 'ascii'));
    if (heading) parts.push(BOLD_OFF);
  });
  parts.push(Buffer.from('\n\n\n', 'ascii'));
  if (CUT) parts.push(CUT_CMD);
  return Buffer.concat(parts);
}

async function api(path: string, body?: unknown) {
  const res = await fetch(`${SERVER}/api/v1/bridge${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-Requested-With': 'ammas' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Server said ${res.status}`);
  return res.json() as Promise<any>;
}

function tcp(data: Buffer | null, queryStatus: boolean): Promise<{ confirmed: boolean; problem?: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: HOST, port: PORT, timeout: 5000 });
    const replies: number[] = [];
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; sock.destroy(); fn(); } };
    sock.on('timeout', () => done(() => reject(new Error('Printer did not answer (check power and cable)'))));
    sock.on('error', (e) => done(() => reject(new Error(`Cannot reach printer: ${e.message}`))));
    sock.on('data', (d: Buffer) => { for (const b of d) replies.push(b); });
    sock.on('connect', () => {
      if (data) sock.write(data);
      if (queryStatus) {
        // DLE EOT 1 = printer status, DLE EOT 4 = paper sensor
        sock.write(Buffer.from([DLE, EOT, 1, DLE, EOT, 4]));
        setTimeout(() => {
          if (replies.length >= 2) {
            const [printer, paper] = replies;
            if (printer & 0x08) return done(() => resolve({ confirmed: false, problem: 'Printer is offline' }));
            if (paper & 0x60) return done(() => resolve({ confirmed: false, problem: 'Paper is out' }));
            if (printer & 0x04) return done(() => resolve({ confirmed: false, problem: 'Cover is open' }));
            return done(() => resolve({ confirmed: true }));
          }
          // printer does not answer status requests: data was sent, but we cannot prove it printed
          done(() => resolve({ confirmed: false }));
        }, 900);
      } else {
        sock.end(() => done(() => resolve({ confirmed: false })));
      }
    });
  });
}

async function writeOut(data: Buffer): Promise<{ confirmed: boolean; problem?: string }> {
  if (MODE === 'TCP') return tcp(data, true);
  if (MODE === 'FILE') {
    if (!PATH_) throw new Error('PRINTER_PATH is not set');
    await fs.promises.appendFile(PATH_, data);
    return { confirmed: false };
  }
  console.log('\n--- DRYRUN: would print ---\n' + data.toString('ascii').replace(/[\x00-\x09\x0b-\x1f]/g, '') + '\n---------------------------');
  return { confirmed: true };
}

async function probe(): Promise<{ ok: boolean; detail: string }> {
  try {
    if (MODE === 'TCP') {
      const r = await tcp(null, true);
      if (r.problem) return { ok: false, detail: r.problem };
      return { ok: true, detail: r.confirmed ? 'Printer ready' : 'Printer reachable' };
    }
    if (MODE === 'FILE') {
      await fs.promises.access(PATH_, fs.constants.W_OK);
      return { ok: true, detail: 'Printer path writable' };
    }
    return { ok: true, detail: 'Dry-run mode (no real printer)' };
  } catch (e: any) {
    return { ok: false, detail: String(e.message ?? e).slice(0, 180) };
  }
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const { job } = await api('/claim');
    if (!job) return;
    console.log(`Printing job ${job.id} (${job.kind}${job.isCopy ? ', copy' : ''})`);
    try {
      const r = await writeOut(build(job.lines));
      if (r.problem) throw new Error(r.problem);
      await api(`/${job.id}/result`, { status: r.confirmed ? 'PRINTED' : 'SENT' });
    } catch (e: any) {
      console.error('Print failed:', e.message);
      await api(`/${job.id}/result`, { status: 'FAILED', error: String(e.message ?? e).slice(0, 250) }).catch(() => {});
    }
  } catch (e: any) {
    console.error('Server not reachable:', e.message);
  } finally {
    busy = false;
  }
}

async function heartbeat() {
  const p = await probe();
  await api('/heartbeat', { ...p, bridge: 'cashier-pc' }).catch((e) => console.error('Heartbeat failed:', e.message));
}

console.log(`AMMAS print bridge started. Mode=${MODE} Server=${SERVER}`);
setInterval(tick, POLL);
setInterval(heartbeat, 15_000);
heartbeat();
