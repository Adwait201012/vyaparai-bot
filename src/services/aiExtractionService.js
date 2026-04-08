const Groq = require("groq-sdk");
const env = require("../config/env");

const SYSTEM_PROMPT =
  "You are a kirana store assistant. Extract customer name and amount from the message. Reply ONLY in JSON like this: {customerName: 'Sharma ji', amount: 500, type: 'udhaar'} or {customerName: 'Sharma ji', amount: 200, type: 'wapas'} or {type: 'unknown'} if not relevant";

const client = new Groq({ apiKey: env.groqApiKey });

function normalizeJsonText(rawText) {
  const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return cleaned
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ': "$1"');
}

async function extractTransaction(messageText) {
  const completion = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: messageText,
      },
    ],
  });

  const output = completion.choices?.[0]?.message?.content || "";

  const normalized = normalizeJsonText(output);
  let parsed;

  try {
    parsed = JSON.parse(normalized);
  } catch {
    return { type: "unknown" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { type: "unknown" };
  }

  if (parsed.type === "udhaar" || parsed.type === "wapas") {
    const customerName = String(parsed.customerName || "").trim();
    const amount = Number(parsed.amount);

    if (!customerName || Number.isNaN(amount) || amount <= 0) {
      return { type: "unknown" };
    }

    return { customerName, amount, type: parsed.type };
  }

  return { type: "unknown" };
}

module.exports = { extractTransaction };
