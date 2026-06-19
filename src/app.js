import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import { connectDb } from './db.js';
import {
  createOtpRequest,
  verifyOtp,
  issueTokens,
  refreshTokensFor,
  revokeRefreshToken,
  validateBearerToken,
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
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
  deleteDevice
} from './data.js';

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production');
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['http://localhost:8080', 'http://localhost:8081'];
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy does not allow access from origin ${origin}`));
    }
  },
  optionsSuccessStatus: 200
}));
app.use(express.json());

const openApiYaml = fs.readFileSync(new URL('../docs/api/openapi.yaml', import.meta.url), 'utf8');
const openApiDocument = yaml.parse(openApiYaml);

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/openapi.yaml', (req, res) => {
  res.type('application/x-yaml').send(openApiYaml);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/ready', async (req, res) => {
  try {
    await connectDb();
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'HelloHello API',
    message: 'Welcome to HelloHello backend. API routes are available at /v1',
    links: {
      docs: '/swagger',
      openapi: '/openapi.yaml',
      v1_api: '/v1'
    }
  });
});

const v1 = express.Router();

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phoneE164: user.phone_e164,
    email: user.email,
    countryCode: user.country_code,
    kycStatus: user.kyc_status,
    status: user.status,
    role: user.role || 'user',
    preferredCurrency: user.preferred_currency,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function serializeDevice(device) {
  if (!device) return null;
  return {
    deviceId: device.device_id,
    platform: device.platform,
    pushToken: device.push_token,
    appVersion: device.app_version,
    lastSeenAt: device.last_seen_at,
    createdAt: device.created_at
  };
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isValidE164(phoneE164) {
  return /^\+[1-9]\d{7,14}$/.test(phoneE164);
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
  }

  const token = auth.slice(7);
  const user = await validateBearerToken(token);
  if (!user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  next();
}

v1.get('/', (req, res) => {
  res.json({
    status: 'HelloHello API v1',
    message: 'Welcome to the HelloHello backend v1 API. See /swagger for full documentation.'
  });
});

v1.post('/auth/otp/request', asyncHandler(async (req, res) => {
  const { phoneE164, channel = 'sms' } = req.body;
  if (!phoneE164) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'phoneE164 is required' });
  }
  if (!isValidE164(phoneE164)) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'phoneE164 must be a valid E.164 phone number' });
  }
  if (!['sms', 'whatsapp'].includes(channel)) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'channel must be sms or whatsapp' });
  }

  try {
    const otp = await createOtpRequest(phoneE164, { channel });
    res.json({
      requestId: otp.id,
      expiresInSec: 300,
      deliveryStatus: otp.delivery_status || 'sent',
      delivery: {
        provider: otp.delivery_provider || null,
        messageId: otp.delivery_message_id || null,
        status: otp.delivery_status || 'sent'
      }
    });
  } catch (error) {
    if (error.code === 'SMS_DELIVERY_FAILED') {
      return res.status(error.status || 503).json({
        code: 'OTP_DELIVERY_FAILED',
        message: 'Unable to send OTP to that phone number',
        details: error.details || {}
      });
    }
    throw error;
  }
}));

v1.post('/auth/otp/verify', asyncHandler(async (req, res) => {
  const { phoneE164, code, requestId, otpRequestResponse, otpRequest } = req.body;
  const resolvedRequestId = requestId || otpRequestResponse?.requestId || otpRequest?.requestId;
  if (!phoneE164 || !code || !resolvedRequestId) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'phoneE164, code, and requestId or otpRequestResponse.requestId are required' });
  }
  const user = await verifyOtp(resolvedRequestId, phoneE164, code);
  if (!user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid OTP or expired request' });
  }
  const tokens = await issueTokens(user.id);
  res.json({ ...tokens, user });
}));

v1.post('/auth/token/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'refreshToken is required' });
  }
  const tokens = await refreshTokensFor(refreshToken);
  if (!tokens) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' });
  }
  const user = await getUserById(tokens.userId);
  res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresInSec: tokens.expiresInSec, user: serializeUser(user) });
}));

v1.post('/auth/logout', authMiddleware, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.status(204).send();
}));

v1.get('/users/me', authMiddleware, (req, res) => {
  res.json(serializeUser(req.user));
});

v1.patch('/users/me', authMiddleware, asyncHandler(async (req, res) => {
  const { email, preferredCurrency } = req.body;
  const updatedUser = await updateUser(req.user.id, { email, preferredCurrency });
  res.json(serializeUser(updatedUser));
}));

v1.post('/register', asyncHandler(async (req, res) => {
  const { phoneE164, email } = req.body;
  if (!phoneE164) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'phoneE164 is required' });
  }
  const role = process.env.ADMIN_PHONE && process.env.ADMIN_PHONE === phoneE164 ? 'admin' : 'user';
  const user = await createUser(phoneE164, { email, role });
  res.status(201).json(serializeUser(user));
}));

v1.post('/users', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { phoneE164, email, role } = req.body;
  if (!phoneE164) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'phoneE164 is required' });
  }
  const user = await createUser(phoneE164, { email, role });
  res.status(201).json(serializeUser(user));
}));

v1.get('/users/:userId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.userId);
  if (!user) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
  }
  res.json(serializeUser(user));
}));

v1.patch('/users/:userId', authMiddleware, asyncHandler(async (req, res) => {
  const { email, preferredCurrency } = req.body;
  const user = await updateUser(req.params.userId, { email, preferredCurrency });
  if (!user) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
  }
  res.json(serializeUser(user));
}));

v1.delete('/users/:userId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const user = await deleteUser(req.params.userId);
  if (!user) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
  }
  res.status(204).send();
}));

v1.get('/admin/users', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const users = await listUsers();
  res.json({ items: users.map(serializeUser), nextCursor: null });
}));

v1.get('/wallet', authMiddleware, asyncHandler(async (req, res) => {
  const wallet = await getWallet(req.user.id);
  res.json(wallet);
}));

v1.get('/wallet/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const items = await listWalletTransactions(req.user.id);
  res.json({ items, nextCursor: null });
}));

v1.post('/wallet/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const { type, amount, currency, referenceType, referenceId, metadata } = req.body;
  if (!type || amount === undefined || !currency) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'type, amount, and currency are required' });
  }
  const transaction = await createWalletTransaction(req.user.id, { type, amount, currency, referenceType, referenceId, metadata });
  if (!transaction) {
    return res.status(402).json({ code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
  }
  res.status(201).json(transaction);
}));

v1.get('/wallet/transactions/:transactionId', authMiddleware, asyncHandler(async (req, res) => {
  const transaction = await getWalletTransaction(req.user.id, req.params.transactionId);
  if (!transaction) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Transaction not found' });
  }
  res.json(transaction);
}));

v1.get('/rates/lookup', authMiddleware, asyncHandler(async (req, res) => {
  const { number } = req.query;
  if (!number) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'number query is required' });
  }
  const rate = await lookupRate(number);
  if (!rate) {
    return res.status(404).json({ code: 'DESTINATION_NOT_SUPPORTED', message: 'Destination not supported' });
  }
  res.json({
    number,
    countryCode: rate.country_code,
    destinationLabel: rate.description,
    ratePerMin: rate.retail_rate_per_min,
    currency: rate.currency,
    billingIncrementSec: rate.billing_increment_sec,
    estimatedMaxMinutes: 60
  });
}));

v1.get('/rates/countries', authMiddleware, asyncHandler(async (req, res) => {
  res.json({ countries: await getAllCountries() });
}));

v1.get('/rates', authMiddleware, asyncHandler(async (req, res) => {
  const rates = await listDestinationRates();
  res.json({ items: rates, nextCursor: null });
}));

v1.get('/rates/:rateId', authMiddleware, asyncHandler(async (req, res) => {
  const rate = await getDestinationRate(req.params.rateId);
  if (!rate) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Rate not found' });
  }
  res.json(rate);
}));

v1.post('/calls', authMiddleware, asyncHandler(async (req, res) => {
  const { to, deviceId, callerId } = req.body;
  if (!to || !deviceId) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'to and deviceId are required' });
  }
  const result = await createCall(req.user.id, to, deviceId, callerId);
  if (result.error) {
    return res.status(result.error === 'INSUFFICIENT_BALANCE' ? 402 : 400).json({ code: result.error, message: result.error === 'INSUFFICIENT_BALANCE' ? 'Insufficient balance' : 'Unable to place call' });
  }
  const { call, rate } = result;
  res.status(201).json({
    callId: call.id,
    status: call.status,
    estimatedRatePerMin: rate.retail_rate_per_min,
    currency: rate.currency,
    reservedAmount: call.reserved_amount,
    telephony: {
      provider: 'telnyx',
      connectionId: `call-${call.id}`,
      loginToken: `token-${call.id}`
    }
  });
}));

v1.get('/calls', authMiddleware, asyncHandler(async (req, res) => {
  const items = (await listCalls(req.user.id)).map((call) => ({
    id: call.id,
    to: call.to_e164,
    status: call.status,
    retailRatePerMin: call.retail_rate_per_min,
    currency: call.currency,
    durationSec: call.duration_sec,
    billedAmount: call.billed_amount,
    carrierId: call.carrier_id,
    failReason: call.fail_reason,
    startedAt: call.started_at,
    answeredAt: call.answered_at,
    endedAt: call.ended_at,
    createdAt: call.created_at
  }));
  res.json({ items, nextCursor: null });
}));

v1.get('/calls/:callId', authMiddleware, asyncHandler(async (req, res) => {
  const call = await getCall(req.user.id, req.params.callId);
  if (!call) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Call not found' });
  }
  res.json(call);
}));

v1.post('/calls/:callId/hangup', authMiddleware, asyncHandler(async (req, res) => {
  const call = await hangupCall(req.user.id, req.params.callId);
  if (!call) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Call not found or cannot hang up' });
  }
  res.json(call);
}));

v1.delete('/calls/:callId', authMiddleware, asyncHandler(async (req, res) => {
  const call = await hangupCall(req.user.id, req.params.callId);
  if (!call) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Call not found or cannot delete' });
  }
  res.status(204).send();
}));

v1.post('/topups', authMiddleware, asyncHandler(async (req, res) => {
  const { amount, currency, provider, successUrl, cancelUrl } = req.body;
  if (!amount || !currency || !provider) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'amount, currency, and provider are required' });
  }
  const session = await createTopup(req.user.id, { amount, currency, provider, successUrl, cancelUrl });
  res.status(201).json({ topupId: session.id, status: session.status, checkoutUrl: session.checkout_url });
}));

v1.get('/topups', authMiddleware, asyncHandler(async (req, res) => {
  const items = await listTopups(req.user.id);
  res.json({ items, nextCursor: null });
}));

v1.get('/topups/:topupId', authMiddleware, asyncHandler(async (req, res) => {
  const topup = await getTopup(req.user.id, req.params.topupId);
  if (!topup) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Topup not found' });
  }
  res.json(topup);
}));

v1.post('/topups/:topupId/apply', authMiddleware, asyncHandler(async (req, res) => {
  const topup = await applyTopup(req.user.id, req.params.topupId);
  if (!topup) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Topup not found or cannot be applied' });
  }
  res.json(topup);
}));

v1.post('/devices', authMiddleware, asyncHandler(async (req, res) => {
  const { deviceId, platform, pushToken, appVersion } = req.body;
  if (!deviceId || !platform || !pushToken) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'deviceId, platform, and pushToken are required' });
  }
  const registration = await registerDevice(req.user.id, { deviceId, platform, pushToken, appVersion });
  res.status(201).json(serializeDevice(registration));
}));

v1.get('/devices', authMiddleware, asyncHandler(async (req, res) => {
  const items = await listDevices(req.user.id);
  res.json({ items: items.map(serializeDevice), nextCursor: null });
}));

v1.get('/devices/:deviceId', authMiddleware, asyncHandler(async (req, res) => {
  const device = await getDevice(req.user.id, req.params.deviceId);
  if (!device) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });
  }
  res.json(serializeDevice(device));
}));

v1.delete('/devices/:deviceId', authMiddleware, asyncHandler(async (req, res) => {
  const deleted = await deleteDevice(req.user.id, req.params.deviceId);
  if (!deleted) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });
  }
  res.status(204).send();
}));

v1.post('/webhooks/stripe', asyncHandler(async (req, res) => {
  res.json({ status: 'ok' });
}));

v1.post('/webhooks/telnyx', asyncHandler(async (req, res) => {
  res.json({ status: 'ok' });
}));

app.use('/v1', v1);

app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
});

export default app;
