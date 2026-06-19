const testMessages = [];

function getSmsProvider() {
  return process.env.SMS_PROVIDER || (process.env.NODE_ENV === 'production' ? 'telnyx' : 'log');
}

function buildOtpMessage(code) {
  return `Your HelloHello verification code is ${code}. It expires in 5 minutes.`;
}

function createSmsError(message) {
  const error = new Error(message);
  error.code = 'SMS_DELIVERY_FAILED';
  error.status = 503;
  return error;
}

async function sendWithTelnyx({ to, text }) {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!apiKey || (!from && !messagingProfileId)) {
    throw createSmsError('Telnyx SMS is not configured.');
  }

  const payload = {
    to,
    text
  };

  if (from) {
    payload.from = from;
  } else {
    payload.messaging_profile_id = messagingProfileId;
  }

  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw createSmsError(`Telnyx SMS delivery failed with status ${response.status}.`);
  }

  const body = await response.json().catch(() => ({}));
  return {
    provider: 'telnyx',
    messageId: body?.data?.id || null,
    status: body?.data?.status || 'sent'
  };
}

async function sendWithTwilio({ to, text }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    throw createSmsError('Twilio SMS is not configured.');
  }

  const body = new URLSearchParams({
    To: to,
    Body: text
  });

  if (from) {
    body.set('From', from);
  } else {
    body.set('MessagingServiceSid', messagingServiceSid);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw createSmsError(`Twilio SMS delivery failed with status ${response.status}.`);
  }

  const body = await response.json().catch(() => ({}));
  return {
    provider: 'twilio',
    messageId: body.sid || null,
    status: body.status || 'sent'
  };
}

async function sendOtpSms({ to, code }) {
  const provider = getSmsProvider();
  const text = buildOtpMessage(code);

  if (provider === 'log' || provider === 'test') {
    testMessages.push({ to, text, code, createdAt: new Date() });
    if (provider === 'log') {
      console.info(`HelloHello OTP for ${to}: ${code}`);
    }
    return { provider, messageId: null, status: 'sent' };
  }

  if (provider === 'telnyx') {
    return sendWithTelnyx({ to, text });
  }

  if (provider === 'twilio') {
    return sendWithTwilio({ to, text });
  }

  throw createSmsError(`Unsupported SMS provider: ${provider}`);
}

function getLastTestSms() {
  return testMessages[testMessages.length - 1] || null;
}

function clearTestSmsMessages() {
  testMessages.length = 0;
}

export { sendOtpSms, getLastTestSms, clearTestSmsMessages };
