import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { loadUserFromToken, parseCookies, SESSION_COOKIE } from './middleware/auth.js';
import { setIO } from './services/core.js';
import { config } from './config.js';

/** Live updates. Sockets carry only "something changed" pings; the app re-fetches through the permission-checked REST API. */
export function attachRealtime(server: HttpServer) {
  const io = new Server(server, {
    path: '/socket.io', serveClient: false,
    // Block cross-site WebSocket hijacking: a page on another website must not be able to open a socket with the visitor's cookie.
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      if (!origin) return cb(null, true); // non-browser clients (the cookie is still required below)
      try {
        const host = new URL(origin).host;
        cb(null, host === req.headers.host || host === new URL(config.PUBLIC_URL).host);
      } catch { cb(null, false); }
    },
  });
  io.use(async (socket, next) => {
    try {
      const user = await loadUserFromToken(parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE]);
      if (!user) return next(new Error('unauthenticated'));
      next();
    } catch (e) {
      next(e as Error);
    }
  });
  setIO(io);
  return io;
}
