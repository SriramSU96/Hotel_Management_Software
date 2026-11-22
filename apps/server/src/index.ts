import http from 'node:http';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { ensureRoles } from './seed-lib.js';
import { schedulerTick } from './services/delivery.js';
import { Feedback, Settings } from './models/index.js';
import { getSettings } from './services/core.js';

await mongoose.connect(config.MONGODB_URI);
await ensureRoles();
await Settings.updateOne({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true });
// make sure unique/sparse indexes exist before taking orders
await mongoose.syncIndexes();

const app = createApp();
const server = http.createServer(app);
attachRealtime(server);

cron.schedule('* * * * *', () => {
  schedulerTick().catch((e) => logger.error({ err: e }, 'scheduler tick failed'));
});

// Daily privacy housekeeping: delete feedback older than the configured retention.
cron.schedule('17 3 * * *', async () => {
  try {
    const s = await getSettings();
    const cutoff = new Date(Date.now() - s.feedbackRetentionDays * 86400_000);
    const r = await Feedback.deleteMany({ createdAt: { $lt: cutoff } });
    if (r.deletedCount) logger.info({ deleted: r.deletedCount }, 'Old feedback removed');
  } catch (e) {
    logger.error({ err: e }, 'retention job failed');
  }
});

server.listen(config.PORT, () => logger.info(`AMMAS server listening on :${config.PORT}`));

const stop = () => { server.close(); mongoose.disconnect().finally(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
