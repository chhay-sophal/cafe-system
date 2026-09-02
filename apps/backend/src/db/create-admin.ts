// First-time setup has no way to log in otherwise: every user-management
// endpoint requires an already-authenticated ADMIN, and demo-data seeding
// was intentionally removed from the setup flow (a real store doesn't want
// fake products) - but a store still needs at least one real account to get
// in the door. Run via `pnpm db:create-admin`; called from scripts/setup.ps1
// on a fresh install.
import { randomUUID } from 'crypto';
import { createInterface, type Interface } from 'node:readline/promises';
import { client, db } from './index.js';
import { users } from './schema.js';
import { hashPin, verifyPin } from '../middleware/auth.js';

const PIN_PATTERN = /^\d{4}$/;

async function promptName(rl: Interface): Promise<string> {
  while (true) {
    const answer = (await rl.question('Admin name: ')).trim();
    if (answer.length > 0) {
      return answer;
    }
    console.log('Name cannot be blank.');
  }
}

async function pinIsTaken(pin: string): Promise<boolean> {
  const existing = await db.select().from(users).all();
  for (const user of existing) {
    if (await verifyPin(pin, user.pinHash)) {
      return true;
    }
  }
  return false;
}

async function promptPin(rl: Interface): Promise<string> {
  while (true) {
    const answer = (await rl.question('Admin PIN (4 digits): ')).trim();
    if (!PIN_PATTERN.test(answer)) {
      console.log('PIN must be exactly 4 digits.');
      continue;
    }
    if (await pinIsTaken(answer)) {
      console.log('That PIN is already in use by another account - choose a different one.');
      continue;
    }
    return answer;
  }
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('Create the first admin account for this store.');
    const name = await promptName(rl);
    const pin = await promptPin(rl);
    const pinHash = await hashPin(pin);

    await db.insert(users).values({
      id: randomUUID(),
      name,
      pinHash,
      role: 'ADMIN',
      isActive: true,
    }).run();

    console.log(`Created admin account "${name}" - you can log in to IMS with this PIN now.`);
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error('Failed to create admin account:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    client.close();
  });
