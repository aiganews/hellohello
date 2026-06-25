import 'dotenv/config';
import crypto from 'crypto';
import { MongoClient, ServerApiVersion } from 'mongodb';

let memoryServer;
let client;
let db;

function normalizeMongoUri(uri) {
  const prefix = uri.startsWith('mongodb+srv://')
    ? 'mongodb+srv://'
    : uri.startsWith('mongodb://')
    ? 'mongodb://'
    : null;

  if (!prefix) {
    return uri;
  }

  const withoutPrefix = uri.slice(prefix.length);
  const atIndex = withoutPrefix.indexOf('@');
  if (atIndex === -1) {
    return uri;
  }

  const credentials = withoutPrefix.slice(0, atIndex);
  const rest = withoutPrefix.slice(atIndex + 1);
  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    return uri;
  }

  const user = credentials.slice(0, colonIndex);
  const pass = credentials.slice(colonIndex + 1);
  if (pass.includes('%') && /%[0-9A-Fa-f]{2}/.test(pass)) {
    return uri;
  }

  const encodedPassword = encodeURIComponent(pass);
  return `${prefix}${user}:${encodedPassword}@${rest}`;
}

async function startMemoryServer() {
  if (!memoryServer) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
  }
  return memoryServer.getUri('hellohello');
}

function envFlag(name) {
  const value = process.env[name];
  if (!value) return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase().trim());
}

async function buildConnectionUri() {
  const useInMemory =
    envFlag('USE_IN_MEMORY_MONGO') ||
    process.env.NODE_ENV === 'test';

  if (useInMemory) {
    return startMemoryServer();
  }

  if (process.env.MONGODB_URI?.trim()) {
    return normalizeMongoUri(process.env.MONGODB_URI);
  }

  if (process.env.NODE_ENV === 'development') {
    return startMemoryServer();
  }

  throw new Error(
    'MONGODB_URI is required when not running in development/test mode. ' +
    'For local production-style runs, use: npm run start:local:prod'
  );
}

function extractDbName(connectionString) {
  const pathSegment = connectionString.split('?')[0].split('/').pop();
  return pathSegment && pathSegment.length > 0 ? pathSegment : 'hellohello';
}

async function ensureCollection(name, validator, indexes = []) {
  const exists = await db.listCollections({ name }).hasNext();
  if (!exists) {
    await db.createCollection(name, { validator });
  }
  const collection = db.collection(name);
  for (const index of indexes) {
    await collection.createIndex(index.keys, index.options || {});
  }
}

async function seedDefaultRates() {
  const ratePlans = db.collection('rate_plans');
  const destinationRates = db.collection('destination_rates');
  const hasPlans = await ratePlans.countDocuments();
  if (hasPlans === 0) {
    const planId = `rateplan-${crypto.randomUUID()}`;
    await ratePlans.insertOne({
      id: planId,
      name: 'default',
      currency: 'USD',
      active: true,
      created_at: new Date()
    });

    await destinationRates.insertMany([
      {
        id: `rate-${crypto.randomUUID()}`,
        rate_plan_id: planId,
        prefix: '+25190064',
        country_code: 'ET',
        description: 'Ethiopia Mobile (9006)',
        retail_rate_per_min: 0.25,
        wholesale_rate_per_min: 0.20,
        billing_increment_sec: 60,
        min_duration_sec: 0,
        effective_from: new Date(),
        effective_to: null,
        created_at: new Date()
      },
      {
        id: `rate-${crypto.randomUUID()}`,
        rate_plan_id: planId,
        prefix: '+251911',
        country_code: 'ET',
        description: 'Ethiopia Mobile (911)',
        retail_rate_per_min: 0.25,
        wholesale_rate_per_min: 0.20,
        billing_increment_sec: 60,
        min_duration_sec: 0,
        effective_from: new Date(),
        effective_to: null,
        created_at: new Date()
      },
      {
        id: `rate-${crypto.randomUUID()}`,
        rate_plan_id: planId,
        prefix: '+254',
        country_code: 'KE',
        description: 'Kenya Mobile',
        retail_rate_per_min: 0.22,
        wholesale_rate_per_min: 0.18,
        billing_increment_sec: 60,
        min_duration_sec: 0,
        effective_from: new Date(),
        effective_to: null,
        created_at: new Date()
      },
      {
        id: `rate-${crypto.randomUUID()}`,
        rate_plan_id: planId,
        prefix: '+1206',
        country_code: 'US',
        description: 'United States (206)',
        retail_rate_per_min: 0.10,
        wholesale_rate_per_min: 0.08,
        billing_increment_sec: 60,
        min_duration_sec: 0,
        effective_from: new Date(),
        effective_to: null,
        created_at: new Date()
      }
    ]);
  }
}

function buildClientOptions(uri) {
  const isMemory = uri.startsWith('mongodb://127.0.0.1') || uri.startsWith('mongodb://localhost');
  const options = {
    appName: 'HelloHelloAPI'
  };

  if (!isMemory) {
    options.serverApi = ServerApiVersion.v1;
    options.serverSelectionTimeoutMS = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000);
  }

  return options;
}

async function connectDb() {
  if (db) return db;
  const uri = await buildConnectionUri();

  try {
    client = new MongoClient(uri, buildClientOptions(uri));
    await client.connect();
    db = client.db(extractDbName(uri));
  } catch (error) {
    const canFallback =
      process.env.NODE_ENV === 'development' &&
      process.env.MONGODB_URI &&
      process.env.USE_IN_MEMORY_MONGO !== 'false';

    if (canFallback) {
      console.warn('Failed to connect to MongoDB Atlas. Falling back to in-memory MongoDB for development.');
      console.warn(error.message || error);

      if (client) {
        await client.close();
        client = null;
      }

      const fallbackUri = await startMemoryServer();
      client = new MongoClient(fallbackUri, buildClientOptions(fallbackUri));
      await client.connect();
      db = client.db(extractDbName(fallbackUri));
    } else {
      throw error;
    }
  }

  const validators = {
    users: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'phone_e164', 'country_code', 'kyc_status', 'status', 'preferred_currency', 'created_at', 'updated_at'],
        properties: {
          id: { bsonType: 'string' },
          phone_e164: { bsonType: 'string' },
          email: { bsonType: ['string', 'null'] },
          country_code: { bsonType: 'string', minLength: 2, maxLength: 2 },
          kyc_status: { enum: ['pending', 'verified', 'rejected'] },
          status: { enum: ['active', 'suspended'] },
          role: { enum: ['user', 'admin'] },
          preferred_currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          created_at: { bsonType: 'date' },
          updated_at: { bsonType: 'date' }
        }
      }
    },
    devices: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['user_id', 'device_id', 'platform', 'created_at'],
        properties: {
          user_id: { bsonType: 'string' },
          device_id: { bsonType: 'string' },
          platform: { enum: ['ios', 'android'] },
          push_token: { bsonType: ['string', 'null'] },
          app_version: { bsonType: ['string', 'null'] },
          last_seen_at: { bsonType: ['date', 'null'] },
          created_at: { bsonType: 'date' }
        }
      }
    },
    wallets: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'user_id', 'currency', 'available_balance', 'held_balance', 'created_at', 'updated_at'],
        properties: {
          id: { bsonType: 'string' },
          user_id: { bsonType: 'string' },
          currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          available_balance: { bsonType: ['double', 'int'] },
          held_balance: { bsonType: ['double', 'int'] },
          created_at: { bsonType: 'date' },
          updated_at: { bsonType: 'date' }
        }
      }
    },
    wallet_transactions: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'wallet_id', 'type', 'amount', 'currency', 'idempotency_key', 'metadata', 'created_at'],
        properties: {
          id: { bsonType: 'string' },
          wallet_id: { bsonType: 'string' },
          type: { enum: ['topup', 'hold', 'capture', 'release', 'refund', 'adjustment'] },
          amount: { bsonType: ['double', 'int'] },
          currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          reference_type: { bsonType: ['string', 'null'] },
          reference_id: { bsonType: ['string', 'null'] },
          idempotency_key: { bsonType: 'string' },
          metadata: { bsonType: 'object' },
          created_at: { bsonType: 'date' }
        }
      }
    },
    rate_plans: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'name', 'currency', 'active', 'created_at'],
        properties: {
          id: { bsonType: 'string' },
          name: { bsonType: 'string' },
          currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          active: { bsonType: 'bool' },
          created_at: { bsonType: 'date' }
        }
      }
    },
    destination_rates: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'rate_plan_id', 'prefix', 'country_code', 'description', 'retail_rate_per_min', 'wholesale_rate_per_min', 'billing_increment_sec', 'min_duration_sec', 'effective_from', 'created_at'],
        properties: {
          id: { bsonType: 'string' },
          rate_plan_id: { bsonType: 'string' },
          prefix: { bsonType: 'string' },
          country_code: { bsonType: 'string', minLength: 2, maxLength: 2 },
          description: { bsonType: 'string' },
          retail_rate_per_min: { bsonType: ['double', 'int'] },
          wholesale_rate_per_min: { bsonType: ['double', 'int'] },
          billing_increment_sec: { bsonType: ['double', 'int'] },
          min_duration_sec: { bsonType: ['double', 'int'] },
          effective_from: { bsonType: 'date' },
          effective_to: { bsonType: ['date', 'null'] },
          created_at: { bsonType: 'date' }
        }
      }
    },
    carriers: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'name', 'provider_key', 'auth_type', 'status', 'priority', 'config', 'created_at', 'updated_at'],
        properties: {
          id: { bsonType: 'string' },
          name: { bsonType: 'string' },
          provider_key: { bsonType: 'string' },
          sip_host: { bsonType: ['string', 'null'] },
          auth_type: { bsonType: 'string' },
          status: { enum: ['active', 'disabled'] },
          priority: { bsonType: 'int' },
          config: { bsonType: 'object' },
          created_at: { bsonType: 'date' },
          updated_at: { bsonType: 'date' }
        }
      }
    },
    carrier_routes: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'carrier_id', 'prefix', 'cost_per_min', 'quality_score', 'active', 'created_at'],
        properties: {
          id: { bsonType: 'string' },
          carrier_id: { bsonType: 'string' },
          prefix: { bsonType: 'string' },
          cost_per_min: { bsonType: ['double', 'int'] },
          quality_score: { bsonType: ['double', 'int'] },
          active: { bsonType: 'bool' },
          created_at: { bsonType: 'date' }
        }
      }
    },
    calls: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'user_id', 'to_e164', 'status', 'retail_rate_per_min', 'currency', 'created_at', 'updated_at'],
        properties: {
          id: { bsonType: 'string' },
          user_id: { bsonType: 'string' },
          device_id: { bsonType: ['string', 'null'] },
          to_e164: { bsonType: 'string' },
          from_cli: { bsonType: ['string', 'null'] },
          status: { enum: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'cancelled'] },
          carrier_id: { bsonType: ['string', 'null'] },
          carrier_call_id: { bsonType: ['string', 'null'] },
          retail_rate_per_min: { bsonType: ['double', 'int'] },
          wholesale_rate_per_min: { bsonType: ['double', 'int', 'null'] },
          currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          hold_transaction_id: { bsonType: ['string', 'null'] },
          started_at: { bsonType: ['date', 'null'] },
          answered_at: { bsonType: ['date', 'null'] },
          ended_at: { bsonType: ['date', 'null'] },
          duration_sec: { bsonType: ['int', 'null'] },
          billed_amount: { bsonType: ['double', 'int', 'null'] },
          fail_reason: { bsonType: ['string', 'null'] },
          metadata: { bsonType: 'object' },
          reserved_amount: { bsonType: ['double', 'int'] },
          created_at: { bsonType: 'date' },
          updated_at: { bsonType: 'date' }
        }
      }
    },
    cdrs: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'call_id', 'carrier_call_id', 'event_type', 'raw_payload', 'received_at'],
        properties: {
          id: { bsonType: 'string' },
          call_id: { bsonType: 'string' },
          carrier_call_id: { bsonType: 'string' },
          event_type: { bsonType: 'string' },
          duration_sec: { bsonType: ['int', 'null'] },
          disposition: { bsonType: ['string', 'null'] },
          wholesale_cost: { bsonType: ['double', 'null'] },
          raw_payload: { bsonType: 'object' },
          received_at: { bsonType: 'date' }
        }
      }
    },
    topups: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'user_id', 'wallet_id', 'provider', 'amount', 'currency', 'status', 'idempotency_key', 'metadata', 'created_at', 'updated_at'],
        properties: {
          id: { bsonType: 'string' },
          user_id: { bsonType: 'string' },
          wallet_id: { bsonType: 'string' },
          provider: { enum: ['stripe', 'mpesa', 'telebirr'] },
          provider_ref: { bsonType: ['string', 'null'] },
          amount: { bsonType: ['double', 'int'] },
          currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          status: { enum: ['pending', 'succeeded', 'failed'] },
          checkout_url: { bsonType: ['string', 'null'] },
          idempotency_key: { bsonType: 'string' },
          metadata: { bsonType: 'object' },
          created_at: { bsonType: 'date' },
          updated_at: { bsonType: 'date' }
        }
      }
    },
    otp_requests: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'phone_e164', 'code_hash', 'channel', 'expires_at', 'attempt_count', 'created_at'],
        properties: {
          id: { bsonType: 'string' },
          phone_e164: { bsonType: 'string' },
          code_hash: { bsonType: 'string' },
          channel: { bsonType: 'string' },
          expires_at: { bsonType: 'date' },
          verified_at: { bsonType: ['date', 'null'] },
          attempt_count: { bsonType: 'int' },
          created_at: { bsonType: 'date' }
        }
      }
    },
    webhook_events: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'source', 'external_id', 'payload', 'processed_at'],
        properties: {
          id: { bsonType: 'string' },
          source: { bsonType: 'string' },
          external_id: { bsonType: 'string' },
          payload: { bsonType: 'object' },
          processed_at: { bsonType: 'date' }
        }
      }
    },
    auth_tokens: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['token', 'type', 'user_id', 'expires_at', 'created_at'],
        properties: {
          token: { bsonType: 'string' },
          type: { enum: ['access', 'refresh'] },
          user_id: { bsonType: 'string' },
          expires_at: { bsonType: 'date' },
          created_at: { bsonType: 'date' }
        }
      }
    }
  };

  const schemas = [
    {
      name: 'users',
      validator: validators.users,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { phone_e164: 1 }, options: { unique: true } },
        { keys: { email: 1 }, options: { unique: true, sparse: true } },
        { keys: { status: 1 } },
        { keys: { country_code: 1 } }
      ]
    },
    {
      name: 'devices',
      validator: validators.devices,
      indexes: [
        { keys: { user_id: 1, device_id: 1 }, options: { unique: true } },
        { keys: { user_id: 1 } }
      ]
    },
    {
      name: 'wallets',
      validator: validators.wallets,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { user_id: 1 }, options: { unique: true } }
      ]
    },
    {
      name: 'wallet_transactions',
      validator: validators.wallet_transactions,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { wallet_id: 1, created_at: -1 } },
        { keys: { reference_type: 1, reference_id: 1 } },
        { keys: { idempotency_key: 1 }, options: { unique: true } }
      ]
    },
    {
      name: 'rate_plans',
      validator: validators.rate_plans,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { name: 1 }, options: { unique: true } }
      ]
    },
    {
      name: 'destination_rates',
      validator: validators.destination_rates,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { rate_plan_id: 1, prefix: 1, effective_from: 1 }, options: { unique: true } },
        { keys: { prefix: 1, effective_from: -1 } },
        { keys: { country_code: 1 } }
      ]
    },
    {
      name: 'carriers',
      validator: validators.carriers,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { name: 1 }, options: { unique: true } }
      ]
    },
    {
      name: 'carrier_routes',
      validator: validators.carrier_routes,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { carrier_id: 1, prefix: 1 }, options: { unique: true } },
        { keys: { prefix: 1, active: 1 } }
      ]
    },
    {
      name: 'calls',
      validator: validators.calls,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { user_id: 1, created_at: -1 } },
        { keys: { status: 1 } },
        { keys: { carrier_call_id: 1 } },
        { keys: { to_e164: 1 } }
      ]
    },
    {
      name: 'cdrs',
      validator: validators.cdrs,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { call_id: 1 } },
        { keys: { carrier_call_id: 1 } }
      ]
    },
    {
      name: 'topups',
      validator: validators.topups,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { user_id: 1, created_at: -1 } },
        { keys: { provider: 1, provider_ref: 1 } },
        { keys: { idempotency_key: 1 }, options: { unique: true } }
      ]
    },
    {
      name: 'otp_requests',
      validator: validators.otp_requests,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { phone_e164: 1, created_at: -1 } }
      ]
    },
    {
      name: 'webhook_events',
      validator: validators.webhook_events,
      indexes: [
        { keys: { id: 1 }, options: { unique: true } },
        { keys: { source: 1, external_id: 1 }, options: { unique: true } }
      ]
    },
    {
      name: 'auth_tokens',
      validator: validators.auth_tokens,
      indexes: [
        { keys: { token: 1, type: 1 }, options: { unique: true } },
        { keys: { user_id: 1 } }
      ]
    }
  ];

  for (const schema of schemas) {
    await ensureCollection(schema.name, schema.validator, schema.indexes);
  }

  await seedDefaultRates();

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database has not been initialized. Call connectDb() first.');
  }
  return db;
}

async function closeDb() {
  if (client) {
    await client.close();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  db = null;
}

export { connectDb, getDb, closeDb, client };
