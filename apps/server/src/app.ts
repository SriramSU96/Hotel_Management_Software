import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { authenticate, csrfGuard, requireLogin } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { menuRouter, uploadDir } from './routes/menu.js';
import { tablesRouter } from './routes/tables.js';
import { ordersRouter } from './routes/orders.js';
import { billsRouter } from './routes/bills.js';
import { bridgeRouter, printingRouter } from './routes/printing.js';
import { kitchenRouter } from './routes/kitchen.js';
import { stockRouter } from './routes/stock.js';
import { financeRouter } from './routes/finance.js';
import { reportsRouter } from './routes/reports.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { config, cookieSecure } from './config.js';
import mongoose from 'mongoose';

export function createApp() {
  const app = express();
  // web addresses (e.g. the Expo web app) that may call the API with a Bearer token; see APP_ORIGINS
  const appOrigins = config.APP_ORIGINS.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  // WebSocket address of this site for the live updates (some browsers do not treat 'self' as covering ws:)
  const liveOrigins = (() => { try { const u = new URL(config.PUBLIC_URL); return [`${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`]; } catch { return []; } })();
  // Only trust X-Forwarded-For when a reverse proxy really sits in front (TRUST_PROXY=1); otherwise anyone can fake their IP.
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'], styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", ...liveOrigins], fontSrc: ["'self'", 'data:'], scriptSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
        // forcing HTTPS would break the app on a plain-HTTP restaurant network; it is applied only when HTTPS is in use
        upgradeInsecureRequests: cookieSecure ? [] : null,
      },
    },
    hsts: cookieSecure ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ ok: up });
  });

  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true, setHeaders: (res) => { if (appOrigins.length) res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); } }));

  const api = express.Router();
  // CORS for the Expo web app only. No cookies are involved (it sends a Bearer token), so credentials are never allowed.
  api.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && appOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With, X-Client');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    }
    next();
  });
  // nothing from the API (orders, customers, reports) may be stored by browsers or shared caches
  api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use(authenticate);
  api.use(csrfGuard);
  api.use('/public', publicRouter);
  api.use('/bridge', bridgeRouter); // token-authenticated, not cookie-authenticated
  api.use('/auth', authRouter);
  api.use('/', menuRouter);
  api.use('/tables', tablesRouter);
  api.use('/orders', ordersRouter);
  api.use('/bills', billsRouter);
  api.use('/printing', printingRouter);
  api.use('/kitchen', kitchenRouter);
  api.use('/stock', stockRouter);
  api.use('/finance', financeRouter);
  api.use('/reports', reportsRouter);
  api.use('/', adminRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api/v1', api);

  // Serve the built web app (single deployable) when present.
  const dist = config.WEB_DIST ? path.resolve(config.WEB_DIST) : path.resolve(process.cwd(), '../web/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

// requireLogin is re-exported for route modules that want a plain guard
export { requireLogin };
