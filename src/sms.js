const testMessages = [];

function getSmsProvider() {
  return process.env.SMS_PROVIDER || (process.env.NODE_ENV === 'production' ? 'telnyx' : 'log');
}

function buildOtpMessage(code) {
  return `Your HelloHello verification code is ${code}. It expires in 5 minutes.`;
}

function createSmsError(message, details = {}) {
  const error = new Error(message);
  error.code = 'SMS_DELIVERY_FAILED';
  error.status = 503;
  error.details = details;
  return error;
}

async function parseProviderError(response) {
  const body = await response.json().catch(() => ({}));
  return {
    httpStatus: response.status,
    providerCode: body.code || body.errors?.[0]?.code || null,
    providerMessage: body.message || body.errors?.[0]?.detail || body.errors?.[0]?.title || null,
    moreInfo: body.more_info || null
  };
}

async function sendWithTelnyx({ to, text }) {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!apiKey || (!from && !messagingProfileId)) {
    throw createSmsError('Telnyx SMS is not configured.', {
      provider: 'telnyx',
      missing: [
        !apiKey ? 'TELNYX_API_KEY' : null,
        !from && !messagingProfileId ? 'TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID' : null
      ].filter(Boolean)
    });
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
    throw createSmsError('Telnyx SMS delivery failed.', {
      provider: 'telnyx',
      ...(await parseProviderError(response))
    });
  }

  const body = await response.json().catch(() => ({}));
  return {
    provider: 'telnyx',
    messageId: body?.data?.id || null,
    status: body?.data?.status || 'sent'
  };
}

function buildTwilioAuth(accountSid, authToken) {
  return Buffer.from(`${accountSid}:${authToken}`).toString('base64');
}

function normalizeWhatsAppAddress(phoneE164) {
  return phoneE164.startsWith('whatsapp:') ? phoneE164 : `whatsapp:${phoneE164}`;
}

async function parseTwilioDelivery(response) {
  const responseBody = await response.json().catch(() => ({}));
  return {
    provider: 'twilio',
    messageId: responseBody.sid || null,
    status: responseBody.status || 'sent'
  };
}

async function sendWithTwilioSms({ to, text }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    throw createSmsError('Twilio SMS is not configured.', {
      provider: 'twilio',
      channel: 'sms',
      missing: [
        !accountSid ? 'TWILIO_ACCOUNT_SID' : null,
        !authToken ? 'TWILIO_AUTH_TOKEN' : null,
        !from && !messagingServiceSid ? 'TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID' : null
      ].filter(Boolean)
    });
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

  const auth = buildTwilioAuth(accountSid, authToken);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw createSmsError('Twilio SMS delivery failed.', {
      provider: 'twilio',
      channel: 'sms',
      ...(await parseProviderError(response))
    });
  }

  return parseTwilioDelivery(response);
}

async function sendWithTwilioWhatsApp({ to, code }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID || process.env.TWILIO_CONTENT_SID;

  if (!accountSid || !authToken || !from || !contentSid) {
    throw createSmsError('Twilio WhatsApp OTP is not configured.', {
      provider: 'twilio',
      channel: 'whatsapp',
      missing: [
        !accountSid ? 'TWILIO_ACCOUNT_SID' : null,
        !authToken ? 'TWILIO_AUTH_TOKEN' : null,
        !from ? 'TWILIO_WHATSAPP_FROM' : null,
        !contentSid ? 'TWILIO_WHATSAPP_CONTENT_SID' : null
      ].filter(Boolean)
    });
  }

  const body = new URLSearchParams({
    From: normalizeWhatsAppAddress(from),
    To: normalizeWhatsAppAddress(to),
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ 1: code })
  });

  const auth = buildTwilioAuth(accountSid, authToken);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw createSmsError('Twilio WhatsApp delivery failed.', {
      provider: 'twilio',
      channel: 'whatsapp',
      ...(await parseProviderError(response))
    });
  }

  return parseTwilioDelivery(response);
}

async function sendOtpSms({ to, code, channel = 'sms' }) {
  const provider = getSmsProvider();
  const text = buildOtpMessage(code);

  if (provider === 'log' || provider === 'test') {
    testMessages.push({ to, text, code, channel, createdAt: new Date() });
    if (provider === 'log') {
      console.info(`HelloHello OTP for ${to}: ${code}`);
    }
    return { provider, messageId: null, status: 'sent' };
  }

  if (provider === 'telnyx') {
    return sendWithTelnyx({ to, text });
  }

  if (provider === 'twilio') {
    if (channel === 'whatsapp') {
      return sendWithTwilioWhatsApp({ to, code });
    }
    return sendWithTwilioSms({ to, text });
  }

  throw createSmsError(`Unsupported SMS provider: ${provider}`, { provider });
}

function getLastTestSms() {
  return testMessages[testMessages.length - 1] || null;
}

function clearTestSmsMessages() {
  testMessages.length = 0;
}

export { sendOtpSms, getLastTestSms, clearTestSmsMessages };
