import request from 'supertest';
import app from '../src/app.js';
import { connectDb, closeDb } from '../src/db.js';
import { clearTestSmsMessages, getLastTestSms } from '../src/sms.js';

let auth;
let user;
let topupId;

describe('HelloHello API', () => {
  beforeAll(async () => {
    process.env.SMS_PROVIDER = 'test';
    await connectDb();
  });
  it('should request OTP and verify successfully', async () => {
    clearTestSmsMessages();
    const otpResponse = await request(app)
      .post('/v1/auth/otp/request')
      .send({ phoneE164: '+251911234567' });

    expect(otpResponse.status).toBe(200);
    expect(otpResponse.body.requestId).toBeDefined();
    expect(otpResponse.body.deliveryStatus).toBe('sent');
    expect(otpResponse.body.delivery.provider).toBe('test');

    const sentOtp = getLastTestSms();
    expect(sentOtp).toBeDefined();
    expect(sentOtp.to).toBe('+251911234567');
    expect(sentOtp.channel).toBe('whatsapp');
    expect(sentOtp.code).toMatch(/^\d{6}$/);

    const verifyResponse = await request(app)
      .post('/v1/auth/otp/verify')
      .send({
        phoneE164: '+251911234567',
        code: sentOtp.code,
        otpRequestResponse: otpResponse.body,
        deviceId: 'device-123'
      });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.accessToken).toBeDefined();
    expect(verifyResponse.body.refreshToken).toBeDefined();
    expect(verifyResponse.body.user).toBeDefined();

    auth = `Bearer ${verifyResponse.body.accessToken}`;
    user = verifyResponse.body.user;
  });

  it('should fetch current user profile', async () => {
    const response = await request(app).get('/v1/users/me').set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.phoneE164).toBe('+251911234567');
  });

  it('should update user profile', async () => {
    const response = await request(app)
      .patch('/v1/users/me')
      .set('Authorization', auth)
      .send({ email: 'hello@hellohello.app', preferredCurrency: 'USD' });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('hello@hellohello.app');
    expect(response.body.preferredCurrency).toBe('USD');
  });

  it('should return rate lookup data', async () => {
    const response = await request(app)
      .get('/v1/rates/lookup')
      .query({ number: '+251911234567' })
      .set('Authorization', auth);

    expect(response.status).toBe(200);
    expect(response.body.countryCode).toBe('ET');
    expect(response.body.ratePerMin).toBe(0.25);
  });

  it('should return insufficient balance for outbound call', async () => {
    const response = await request(app)
      .post('/v1/calls')
      .set('Authorization', auth)
      .send({ to: '+251911234567', deviceId: 'device-123' });

    expect(response.status).toBe(402);
    expect(response.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('should create a topup session', async () => {
    const response = await request(app)
      .post('/v1/topups')
      .set('Authorization', auth)
      .send({ amount: 20.0, currency: 'USD', provider: 'stripe', successUrl: 'https://ok', cancelUrl: 'https://cancel' });

    expect(response.status).toBe(201);
    expect(response.body.topupId).toBeDefined();
    expect(response.body.status).toBe('pending');
    topupId = response.body.topupId;
  });

  it('should fetch topup session status', async () => {
    const response = await request(app).get(`/v1/topups/${topupId}`).set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(topupId);
    expect(response.body.status).toBe('pending');
  });

  it('should register a device', async () => {
    const response = await request(app)
      .post('/v1/devices')
      .set('Authorization', auth)
      .send({ deviceId: 'device-123', platform: 'ios', pushToken: 'push-token', appVersion: '1.0.0' });

    expect(response.status).toBe(201);
    expect(response.body.deviceId).toBe('device-123');
    expect(response.body.platform).toBe('ios');
  });

  afterAll(async () => {
    await closeDb();
  });
});
