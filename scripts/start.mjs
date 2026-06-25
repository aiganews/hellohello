import 'dotenv/config';

function envFlag(name) {
  const value = process.env[name];
  if (!value) return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase().trim());
}

const hasMongoUri = Boolean(process.env.MONGODB_URI?.trim());
const inMemoryDisabled = process.env.USE_IN_MEMORY_MONGO === 'false';

if (!hasMongoUri && !inMemoryDisabled && !envFlag('USE_IN_MEMORY_MONGO')) {
  process.env.USE_IN_MEMORY_MONGO = 'true';
  console.warn(
    'MONGODB_URI is not set. Using in-memory MongoDB. ' +
    'Set MONGODB_URI for Atlas/production or USE_IN_MEMORY_MONGO=false to require a real database.'
  );
}

await import('../src/index.js');
