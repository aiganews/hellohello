import twilio from 'twilio';

function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_SMS_FROM)
  );
}

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function normalizeWhatsAppAddress(phoneE164) {
  return phoneE164.startsWith('whatsapp:') ? phoneE164 : `whatsapp:${phoneE164}`;
}

export async function sendOtp(phoneE164, code, channel = 'sms') {
  const body = `Your HelloHello verification code is: ${code}`;

  if (!isTwilioConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and sender numbers.');
    }
    console.warn(`[dev] OTP for ${phoneE164} via ${channel}: ${code}`);
    return { sent: false, provider: 'dev', channel };
  }

  const client = getTwilioClient();

  if (channel === 'whatsapp') {
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!from) {
      throw new Error('TWILIO_WHATSAPP_FROM is required for WhatsApp OTP delivery.');
    }
    const message = await client.messages.create({
      from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      to: normalizeWhatsAppAddress(phoneE164),
      body
    });
    return { sent: true, provider: 'twilio', channel: 'whatsapp', sid: message.sid };
  }

  const from = process.env.TWILIO_SMS_FROM;
  if (!from) {
    throw new Error('TWILIO_SMS_FROM is required for SMS OTP delivery.');
  }
  const message = await client.messages.create({
    from,
    to: phoneE164,
    body
  });
  return { sent: true, provider: 'twilio', channel: 'sms', sid: message.sid };
}

export { isTwilioConfigured };
