// TEST ONLY (FerretDB lacks TTL indexes): tolerate syncIndexes errors, then start the real server.
import mongoose from 'mongoose';
const orig = mongoose.syncIndexes.bind(mongoose);
(mongoose as any).syncIndexes = async () => { try { return await orig(); } catch (e: any) { console.warn('syncIndexes tolerated:', Object.keys(e.errors ?? {})); } };
await import('../../src/index.ts');
