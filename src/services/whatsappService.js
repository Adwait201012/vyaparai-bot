const env = require("../config/env");
const twilio = require("twilio");

const client = twilio(env.twilioAccountSid, env.twilioAuthToken);

function withWhatsappPrefix(value) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

async function sendTextMessage({ to, text }) {
  const response = await client.messages.create({
    from: withWhatsappPrefix(env.twilioWhatsappFrom),
    to: withWhatsappPrefix(to),
    body: text,
  });

  return response;
}

module.exports = { sendTextMessage };
