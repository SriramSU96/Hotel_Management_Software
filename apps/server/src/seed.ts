import mongoose from 'mongoose';
import { config } from './config.js';
import { seed } from './seed-lib.js';

await mongoose.connect(config.MONGODB_URI);
const r = await seed({ ownerPassword: config.SEED_OWNER_PASSWORD });
console.log('\nSeed complete.');
if (r.generatedOwnerPassword) {
  console.log('--------------------------------------------');
  console.log(' Owner login   username: owner');
  console.log(` Owner password (shown once): ${r.generatedOwnerPassword}`);
  console.log(' Change it after the first sign-in.');
  console.log('--------------------------------------------');
} else {
  console.log('Owner account already exists - password unchanged.');
}
await mongoose.disconnect();
