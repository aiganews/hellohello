import { jest } from '@jest/globals';
import { sendOtpSms } from '../src/sms.js';

describe('SMS providers', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('sends OTP messages through Twilio to the submitted phone number', async () => {
    process.env.SMS_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.TWILIO_FROM_NUMBER = '+12065550100';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SM00000000000000000000000000000000', status: 'queued' })
    });
    global.fetch = fetchMock;

    const delivery = await sendOtpSms({ to: '+251911234567', code: '847392' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC00000000000000000000000000000000/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toMatch(/^Basic /);
    expect(options.body.get('To')).toBe('+251911234567');
    expect(options.body.get('From')).toBe('+12065550100');
    expect(options.body.get('Body')).toContain('847392');
    expect(delivery).toEqual({
      provider: 'twilio',
      messageId: 'SM00000000000000000000000000000000',
      status: 'queued'
    });
  });
});
