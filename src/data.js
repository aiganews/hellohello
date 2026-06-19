import crypto from 'crypto';
import { getDb, client } from './db.js';
import { sendOtpSms } from './sms.js';

const now = () => new Date();
const otpHashSecret =
  process.env.OTP_HASH_SECRET ||
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.REFRESH_TOKEN_SECRET ||
  crypto.randomBytes(32).toString('hex');
const OTP_TTL_MS = 300_000;
const OTP_MAX_ATTEMPTS = 5;

function normalizeCountry(phoneE164) {
  if (phoneE164.startsWith('+1')) return 'US';
  if (phoneE164.startsWith('+251')) return 'ET';
  return 'KE';
}

async function getUserByPhone(phoneE164) {
  const db = await getDb();
  return db.collection('users').findOne({ phone_e164: phoneE164 });
}

function generateOtpCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashOtpCode(requestId, phoneE164, code) {
  return crypto
    .createHmac('sha256', otpHashSecret)
    .update(`${requestId}:${phoneE164}:${code}`)
    .digest('hex');
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function getUserById(userId) {
  const db = await getDb();
  return db.collection('users').findOne({ id: userId });
}

async function getWallet(userId) {
  const db = await getDb();
  let wallet = await db.collection('wallets').findOne({ user_id: userId });
  if (!wallet) {
    wallet = {
      id: crypto.randomUUID(),
      user_id: userId,
      currency: 'USD',
      available_balance: 0,
      held_balance: 0,
      created_at: now(),
      updated_at: now()
    };
    await db.collection('wallets').insertOne(wallet);
  }
  return wallet;
}

async function createUser(phoneE164, { email = null, role = 'user' } = {}) {
  const existing = await getUserByPhone(phoneE164);
  if (existing) {
    if (email && !existing.email) {
      await updateUser(existing.id, { email });
      return getUserById(existing.id);
    }
    return existing;
  }
  const db = await getDb();
  const user = {
    id: crypto.randomUUID(),
    phone_e164: phoneE164,
    email,
    country_code: normalizeCountry(phoneE164),
    kyc_status: 'pending',
    status: 'active',
    role,
    preferred_currency: 'USD',
    created_at: now(),
    updated_at: now()
  };
  await db.collection('users').insertOne(user);
  await getWallet(user.id);
  return user;
}

async function createOtpRequest(phoneE164, { channel = 'sms' } = {}) {
  const db = await getDb();
  const requestId = crypto.randomUUID();
  const code = generateOtpCode();
  const request = {
    id: requestId,
    phone_e164: phoneE164,
    code_hash: hashOtpCode(requestId, phoneE164, code),
    channel,
    expires_at: new Date(Date.now() + OTP_TTL_MS),
    verified_at: null,
    attempt_count: 0,
    created_at: now()
  };
  await db.collection('otp_requests').insertOne(request);
  try {
    const delivery = await sendOtpSms({ to: phoneE164, code, channel });
    request.delivery_provider = delivery.provider;
    request.delivery_message_id = delivery.messageId;
    request.delivery_status = delivery.status;
    await db.collection('otp_requests').updateOne(
      { id: requestId },
      {
        $set: {
          delivery_provider: delivery.provider,
          delivery_message_id: delivery.messageId,
          delivery_status: delivery.status
        }
      }
    );
  } catch (error) {
    await db.collection('otp_requests').deleteOne({ id: requestId });
    throw error;
  }
  return request;
}

async function verifyOtp(requestId, phoneE164, code) {
  const db = await getDb();
  const request = await db.collection('otp_requests').findOne({ id: requestId, phone_e164: phoneE164 });
  if (!request) return null;
  if (request.expires_at < now()) return null;
  if (request.verified_at) return null;
  if (request.attempt_count >= OTP_MAX_ATTEMPTS) return null;

  const expectedHash = hashOtpCode(requestId, phoneE164, code);
  if (!timingSafeEqualString(request.code_hash, expectedHash)) {
    await db.collection('otp_requests').updateOne({ id: requestId }, { $inc: { attempt_count: 1 } });
    return null;
  }

  await db.collection('otp_requests').updateOne({ id: requestId }, { $set: { verified_at: now() } });
  return createUser(phoneE164);
}

async function issueTokens(userId) {
  const db = await getDb();
  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  const accessExpires = new Date(Date.now() + 3600 * 1000);
  const refreshExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await db.collection('auth_tokens').insertMany([
    {
      token: accessToken,
      type: 'access',
      user_id: userId,
      expires_at: accessExpires,
      created_at: now()
    },
    {
      token: refreshToken,
      type: 'refresh',
      user_id: userId,
      expires_at: refreshExpires,
      created_at: now()
    }
  ]);

  return { accessToken, refreshToken, expiresInSec: 3600 };
}

async function validateBearerToken(token) {
  const db = await getDb();
  const entry = await db.collection('auth_tokens').findOne({ token, type: 'access', expires_at: { $gt: now() } });
  if (!entry) return null;
  return getUserById(entry.user_id);
}

async function refreshTokensFor(refreshToken) {
  const db = await getDb();
  const entry = await db.collection('auth_tokens').findOne({ token: refreshToken, type: 'refresh', expires_at: { $gt: now() } });
  if (!entry) return null;
  await db.collection('auth_tokens').deleteOne({ token: refreshToken, type: 'refresh' });
  const tokens = await issueTokens(entry.user_id);
  return { ...tokens, userId: entry.user_id };
}

async function revokeRefreshToken(refreshToken) {
  const db = await getDb();
  await db.collection('auth_tokens').deleteOne({ token: refreshToken, type: 'refresh' });
}

async function updateUser(userId, { email, preferredCurrency, role } = {}) {
  const db = await getDb();
  const updates = {};
  if (email !== undefined) updates.email = email;
  if (preferredCurrency !== undefined) updates.preferred_currency = preferredCurrency;
  if (role !== undefined) updates.role = role;
  if (Object.keys(updates).length === 0) {
    return getUserById(userId);
  }
  updates.updated_at = now();
  await db.collection('users').updateOne({ id: userId }, { $set: updates });
  return getUserById(userId);
}

async function deleteUser(userId) {
  const db = await getDb();
  await db.collection('users').updateOne(
    { id: userId },
    { $set: { status: 'deleted', updated_at: now() } }
  );
  return getUserById(userId);
}

async function listUsers() {
  const db = await getDb();
  return db.collection('users').find({}).sort({ created_at: -1 }).toArray();
}

async function createWalletTransaction(userId, transaction) {
  const db = await getDb();
  const wallet = await getWallet(userId);
  const amount = Number(transaction.amount);
  if (!transaction.type || !transaction.currency || Number.isNaN(amount) || amount <= 0) {
    throw new Error('INVALID_TRANSACTION');
  }

  const tx = {
    id: crypto.randomUUID(),
    wallet_id: wallet.id,
    type: transaction.type,
    amount,
    currency: transaction.currency,
    reference_type: transaction.referenceType || null,
    reference_id: transaction.referenceId || null,
    idempotency_key: crypto.randomUUID(),
    metadata: transaction.metadata || {},
    created_at: now()
  };

  if (transaction.type === 'debit') {
    const updateResult = await db.collection('wallets').updateOne(
      { id: wallet.id, available_balance: { $gte: amount } },
      { $inc: { available_balance: -amount }, $set: { updated_at: now() } }
    );
    if (updateResult.modifiedCount === 0) return null;
  } else {
    await db.collection('wallets').updateOne(
      { id: wallet.id },
      { $inc: { available_balance: amount }, $set: { updated_at: now() } }
    );
  }

  await db.collection('wallet_transactions').insertOne(tx);
  return tx;
}

async function getWalletTransaction(userId, transactionId) {
  const db = await getDb();
  const wallet = await getWallet(userId);
  return db.collection('wallet_transactions').findOne({ id: transactionId, wallet_id: wallet.id });
}

async function listTopups(userId) {
  const db = await getDb();
  return db.collection('topups').find({ user_id: userId }).sort({ created_at: -1 }).toArray();
}

async function listDevices(userId) {
  const db = await getDb();
  return db.collection('devices').find({ user_id: userId }).sort({ last_seen_at: -1 }).toArray();
}

async function getDevice(userId, deviceId) {
  const db = await getDb();
  return db.collection('devices').findOne({ user_id: userId, device_id: deviceId });
}

async function deleteDevice(userId, deviceId) {
  const db = await getDb();
  const result = await db.collection('devices').deleteOne({ user_id: userId, device_id: deviceId });
  return result.deletedCount > 0;
}

async function listDestinationRates() {
  const db = await getDb();
  return db.collection('destination_rates').find({}).toArray();
}

async function getDestinationRate(rateId) {
  const db = await getDb();
  return db.collection('destination_rates').findOne({ id: rateId });
}

async function addWalletTransaction(transaction) {
  const db = await getDb();
  await db.collection('wallet_transactions').insertOne(transaction);
}

async function listWalletTransactions(userId) {
  const db = await getDb();
  const wallet = await getWallet(userId);
  return db.collection('wallet_transactions').find({ wallet_id: wallet.id }).sort({ created_at: -1 }).toArray();
}

async function lookupRate(number) {
  if (!number) return null;
  const db = await getDb();
  const candidates = await db.collection('destination_rates').find({}).toArray();
  return candidates.sort((a, b) => b.prefix.length - a.prefix.length).find((rate) => number.startsWith(rate.prefix)) || null;
}

async function getAllCountries() {
  const db = await getDb();
  const results = await db.collection('destination_rates').aggregate([
    {
      $group: {
        _id: '$country_code',
        country_code: { $first: '$country_code' },
        country_name: { $first: '$description' },
        starting_rate_per_min: { $min: '$retail_rate_per_min' },
        currency: { $first: '$currency' }
      }
    }
  ]).toArray();
  return results.map((row) => ({
    countryCode: row.country_code,
    countryName: row.country_name,
    startingRatePerMin: row.starting_rate_per_min,
    currency: row.currency
  }));
}

async function createCall(userId, to, deviceId, callerId) {
  const rate = await lookupRate(to);
  if (!rate) return { error: 'DESTINATION_NOT_SUPPORTED' };
  const db = await getDb();
  const reservedAmount = Number((rate.retail_rate_per_min * 5).toFixed(2));
  const wallet = await db.collection('wallets').findOne({ user_id: userId });
  if (!wallet) {
    return { error: 'WALLET_NOT_FOUND' };
  }

  const walletUpdate = await db.collection('wallets').updateOne(
    { user_id: userId, available_balance: { $gte: reservedAmount } },
    {
      $inc: { available_balance: -reservedAmount, held_balance: reservedAmount },
      $set: { updated_at: now() }
    }
  );
  if (walletUpdate.modifiedCount === 0) {
    return { error: 'INSUFFICIENT_BALANCE' };
  }

  const holdTransactionId = crypto.randomUUID();
  const callId = crypto.randomUUID();
  const call = {
    id: callId,
    user_id: userId,
    wallet_id: wallet.id,
    device_id: deviceId,
    to_e164: to,
    from_cli: null,
    status: 'initiated',
    carrier_id: null,
    carrier_call_id: null,
    retail_rate_per_min: rate.retail_rate_per_min,
    wholesale_rate_per_min: rate.wholesale_rate_per_min,
    currency: rate.currency,
    hold_transaction_id: holdTransactionId,
    started_at: now(),
    answered_at: null,
    ended_at: null,
    duration_sec: null,
    billed_amount: null,
    fail_reason: null,
    metadata: {},
    reserved_amount: reservedAmount,
    created_at: now(),
    updated_at: now()
  };

  await db.collection('calls').insertOne(call);
  await db.collection('wallet_transactions').insertOne({
    id: holdTransactionId,
    wallet_id: wallet.id,
    type: 'hold',
    amount: reservedAmount,
    currency: rate.currency,
    reference_type: 'call',
    reference_id: callId,
    idempotency_key: crypto.randomUUID(),
    metadata: {},
    created_at: now()
  });

  return { call, rate };
}

async function listCalls(userId) {
  const db = await getDb();
  return db.collection('calls').find({ user_id: userId }).sort({ created_at: -1 }).toArray();
}

async function getCall(userId, callId) {
  const db = await getDb();
  return db.collection('calls').findOne({ id: callId, user_id: userId });
}

async function hangupCall(userId, callId) {
  const db = await getDb();
  const call = await db.collection('calls').findOne({ id: callId, user_id: userId });
  if (!call || call.status !== 'initiated') {
    return null;
  }

  const wallet = await db.collection('wallets').findOne({ id: call.wallet_id });
  if (!wallet) {
    return null;
  }

  await db.collection('calls').updateOne(
    { id: callId, user_id: userId },
    {
      $set: {
        status: 'cancelled',
        ended_at: now(),
        updated_at: now()
      }
    }
  );

  const releaseAmount = call.reserved_amount || 0;
  await db.collection('wallets').updateOne(
    { id: wallet.id },
    {
      $inc: { available_balance: releaseAmount, held_balance: -releaseAmount },
      $set: { updated_at: now() }
    }
  );

  await db.collection('wallet_transactions').insertOne({
    id: crypto.randomUUID(),
    wallet_id: wallet.id,
    type: 'release',
    amount: releaseAmount,
    currency: call.currency,
    reference_type: 'call',
    reference_id: call.id,
    idempotency_key: crypto.randomUUID(),
    metadata: {},
    created_at: now()
  });

  return db.collection('calls').findOne({ id: callId });
}

async function createTopup(userId, { amount, currency, provider, successUrl, cancelUrl }) {
  const db = await getDb();
  const wallet = await getWallet(userId);
  const topup = {
    id: crypto.randomUUID(),
    user_id: userId,
    wallet_id: wallet.id,
    provider,
    provider_ref: null,
    amount,
    currency,
    status: 'pending',
    checkout_url: `https://checkout.hellohello.app/${crypto.randomUUID()}`,
    idempotency_key: crypto.randomUUID(),
    metadata: { successUrl, cancelUrl },
    created_at: now(),
    updated_at: now()
  };
  await db.collection('topups').insertOne(topup);
  return topup;
}

async function getTopup(userId, topupId) {
  const db = await getDb();
  return db.collection('topups').findOne({ id: topupId, user_id: userId });
}

async function applyTopup(userId, topupId) {
  const db = await getDb();
  const topup = await db.collection('topups').findOne({ id: topupId, user_id: userId, status: 'pending' });
  if (!topup) return null;

  await db.collection('topups').updateOne(
    { id: topupId, user_id: userId },
    { $set: { status: 'succeeded', provider_ref: crypto.randomUUID(), updated_at: now() } }
  );
  await db.collection('wallets').updateOne(
    { id: topup.wallet_id },
    { $inc: { available_balance: topup.amount }, $set: { updated_at: now() } }
  );
  await db.collection('wallet_transactions').insertOne({
    id: crypto.randomUUID(),
    wallet_id: topup.wallet_id,
    type: 'topup',
    amount: topup.amount,
    currency: topup.currency,
    reference_type: 'topup',
    reference_id: topup.id,
    idempotency_key: crypto.randomUUID(),
    metadata: {},
    created_at: now()
  });

  return db.collection('topups').findOne({ id: topupId });
}

async function registerDevice(userId, device) {
  const db = await getDb();
  const document = {
    user_id: userId,
    device_id: device.deviceId,
    platform: device.platform,
    push_token: device.pushToken,
    app_version: device.appVersion || null,
    last_seen_at: now(),
    created_at: now()
  };
  await db.collection('devices').updateOne(
    { user_id: userId, device_id: device.deviceId },
    { $set: document },
    { upsert: true }
  );
  return document;
}

export {
  createOtpRequest,
  verifyOtp,
  issueTokens,
  refreshTokensFor,
  revokeRefreshToken,
  validateBearerToken,
  createUser,
  getUserByPhone,
  getUserById,
  listUsers,
  getWallet,
  listWalletTransactions,
  createWalletTransaction,
  getWalletTransaction,
  lookupRate,
  getAllCountries,
  listDestinationRates,
  getDestinationRate,
  createCall,
  listCalls,
  getCall,
  hangupCall,
  createTopup,
  getTopup,
  listTopups,
  applyTopup,
  registerDevice,
  listDevices,
  getDevice,
  deleteDevice,
  deleteUser,
  updateUser
};
