const Groq = require("groq-sdk");
const env = require("../config/env");

const SYSTEM_PROMPT =
  "You are KiranaAI, a smart assistant for Indian kirana store owners. STRICT LANGUAGE RULE: detect the input language and keep output language exactly the same. Never switch languages. If owner says 'Sharma ji 500 udhaar' => language must be 'hinglish'. If owner says 'Sharma ji owes 500' => language must be 'english'. If owner says 'शर्मा जी का 500 उधार' => language must be 'hindi'. Classify intent into: GREETING, LOG_UDHAAR, CHECK_UDHAAR, LOG_WAPAS, TODAY_HISAAB, SABKA_UDHAAR, SAVE_NUMBER, SEND_REMINDER, UNKNOWN. Extract customerName, amount, phoneNumber where relevant. Reply ONLY in JSON: {intent: 'LOG_UDHAAR', customerName: 'Sharma ji', amount: 500, language: 'hindi'}";

const client = new Groq({ apiKey: env.groqApiKey });

function normalizeJsonText(rawText) {
  const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return cleaned
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ': "$1"');
}

function getJsonObjectText(rawText) {
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return rawText;
  }
  return rawText.slice(firstBrace, lastBrace + 1);
}

function fallbackIntent() {
  return {
    intent: "UNKNOWN",
    language: "hinglish",
  };
}

const ALLOWED_INTENTS = new Set([
  "GREETING",
  "LOG_UDHAAR",
  "CHECK_UDHAAR",
  "LOG_WAPAS",
  "TODAY_HISAAB",
  "SABKA_UDHAAR",
  "SAVE_NUMBER",
  "SEND_REMINDER",
  "UNKNOWN",
]);
const ALLOWED_LANGUAGES = new Set(["hindi", "hinglish", "english"]);
const HINGLISH_HINT_WORDS = [
  "udhaar",
  "udhar",
  "hisaab",
  "hisab",
  "wapas",
  "kitna",
  "batao",
  "karo",
  "diya",
  "ne",
  "ka",
  "ko",
  "aji",
  "ajj",
  "aaj",
];

function inferLanguageFromText(messageText) {
  const text = String(messageText || "").trim();
  if (!text) {
    return "hinglish";
  }

  // Devanagari range indicates Hindi script.
  if (/[\u0900-\u097F]/.test(text)) {
    return "hindi";
  }

  const lowered = text.toLowerCase();
  if (HINGLISH_HINT_WORDS.some((word) => lowered.includes(word))) {
    return "hinglish";
  }

  return "english";
}

async function detectIntent(messageText) {
  const completion = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0,
    response_format: { type: "json_object" },
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

  const normalized = normalizeJsonText(getJsonObjectText(output));
  let parsed;

  try {
    parsed = JSON.parse(normalized);
  } catch {
    return fallbackIntent();
  }

  if (!parsed || typeof parsed !== "object") {
    return fallbackIntent();
  }

  const intent = String(parsed.intent || "UNKNOWN").toUpperCase().trim();
  if (!ALLOWED_INTENTS.has(intent)) {
    return fallbackIntent();
  }

  const customerName = String(parsed.customerName || "").trim();
  const phoneNumber = String(parsed.phoneNumber || "").trim();
  const amount = Number(parsed.amount);
  const modelLanguage = String(parsed.language || "hinglish").toLowerCase().trim();
  const strictLanguage = inferLanguageFromText(messageText);

  return {
    intent,
    customerName,
    phoneNumber,
    amount: Number.isFinite(amount) ? amount : null,
    // Enforce language based on input text so replies always match user language.
    language: ALLOWED_LANGUAGES.has(strictLanguage)
      ? strictLanguage
      : ALLOWED_LANGUAGES.has(modelLanguage)
        ? modelLanguage
        : "hinglish",
  };
}

module.exports = { detectIntent };
