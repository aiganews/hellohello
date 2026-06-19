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
}

async function sendOtpSms({ to, code }) {
  const provider = getSmsProvider();
  const text = buildOtpMessage(code);

  if (provider === 'log' || provider === 'test') {
    testMessages.push({ to, text, code, createdAt: new Date() });
    if (provider === 'log') {
      console.info(`HelloHello OTP for ${to}: ${code}`);
    }
    return;
  }

  if (provider === 'telnyx') {
    await sendWithTelnyx({ to, text });
    return;
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
