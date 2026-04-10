const Groq = require("groq-sdk");
const env = require("../config/env");

const SYSTEM_PROMPT =
  "Classify the user message into one intent from: GREETING, LOG_UDHAAR, CHECK_UDHAAR, LOG_WAPAS, TODAY_HISAAB, SABKA_UDHAAR, SAVE_NUMBER, SEND_REMINDER, INVENTORY_ADD, CHECK_STOCK, ALL_STOCK, UNKNOWN. Return ONLY JSON with keys: intent, customerName, amount, phoneNumber, itemName, quantity, unit. Focus on extracting itemName, quantity, unit for inventory messages.";

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
  "INVENTORY_ADD",
  "CHECK_STOCK",
  "ALL_STOCK",
  "UNKNOWN",
]);
const ALLOWED_LANGUAGES = new Set(["hindi", "hinglish", "english"]);
const HINGLISH_HINT_WORDS = new Set([
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
  "namaste",
  "namaskar",
  "pranam",
  "aji",
  "ajj",
  "aaj",
]);

function getLatinWordTokens(text) {
  const matches = String(text || "").toLowerCase().match(/[a-z]+/g);
  return matches || [];
}

function detectLanguageFromText(messageText) {
  const text = String(messageText || "").trim();
  if (!text) {
    return "hinglish";
  }

  // Devanagari range indicates Hindi script.
  if (/[\u0900-\u097F]/.test(text)) {
    return "hindi";
  }

  const tokens = getLatinWordTokens(text);
  if (tokens.length === 0) {
    return "english";
  }

  const hasHinglishMarker = tokens.some((token) => HINGLISH_HINT_WORDS.has(token));
  if (hasHinglishMarker) {
    return "hinglish";
  }

  return "english";
}

function parseNumberAndUnit(text) {
  const compact = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams|ltr|l|ml|packet|packets|pcs|pc|piece|pieces|dozen|box|boxes)?/i);
  if (!compact) {
    return { quantity: null, unit: "" };
  }

  const quantity = Number(compact[1]);
  const unit = String(compact[2] || "").toLowerCase();
  return {
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit,
  };
}

function cleanupItemName(raw) {
  // Keep user-provided item wording (e.g., "rice" vs "chawal") as-is semantically;
  // only remove action/noise tokens. No language-based item translation is applied.
  const text = String(raw || "")
    .toLowerCase()
    .replace(/\b(aaj|today|got|received|added|add|aaya|aayi|aaye|inventory|stock|mein|me|ko|hai|kitna|kitni|dikhao|show|all|sabka|sabhi|ka|ki)\b/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(kg|g|gm|gram|grams|ltr|l|ml|packet|packets|pcs|pc|piece|pieces|dozen|box|boxes)?/gi, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function inferInventoryFromText(messageText) {
  const raw = String(messageText || "").trim();
  const lower = raw.toLowerCase();

  const isAllStock =
    /(^|\s)(sabka stock|sabhi stock|all stock|show all stock|stock dikhao|inventory dikhao)(\s|$)/i.test(
      lower,
    );
  if (isAllStock) {
    return { intent: "ALL_STOCK" };
  }

  const isStockQuery =
    /stock/.test(lower) && /(kitna|kitni|how much|quantity|hai|\?)/.test(lower);
  if (isStockQuery) {
    return {
      intent: "CHECK_STOCK",
      itemName: cleanupItemName(raw),
    };
  }

  const isInventoryAdd =
    /(aaya|aayi|aaye|got|received|added)/.test(lower) &&
    /\d/.test(lower);
  if (!isInventoryAdd) {
    return {};
  }

  const { quantity, unit } = parseNumberAndUnit(lower);
  const itemName = cleanupItemName(raw);
  return {
    intent: "INVENTORY_ADD",
    itemName,
    quantity,
    unit,
  };
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
  const itemName = String(parsed.itemName || "").trim();
  const quantity = Number(parsed.quantity);
  const unit = String(parsed.unit || "").trim();
  const modelLanguage = String(parsed.language || "hinglish").toLowerCase().trim();
  const strictLanguage = detectLanguageFromText(messageText);

  const inventoryFallback = inferInventoryFromText(messageText);
  const finalIntent = inventoryFallback.intent || intent;
  const finalItemName = inventoryFallback.itemName || itemName;
  const finalQuantity = Number.isFinite(inventoryFallback.quantity)
    ? inventoryFallback.quantity
    : quantity;
  const finalUnit = inventoryFallback.unit || unit;

  return {
    intent: finalIntent,
    customerName,
    phoneNumber,
    amount: Number.isFinite(amount) ? amount : null,
    itemName: finalItemName,
    quantity: Number.isFinite(finalQuantity) ? finalQuantity : null,
    unit: finalUnit,
    // Enforce language based on input text so replies always match user language.
    language: ALLOWED_LANGUAGES.has(strictLanguage)
      ? strictLanguage
      : ALLOWED_LANGUAGES.has(modelLanguage)
        ? modelLanguage
        : "hinglish",
  };
}

module.exports = { detectIntent, detectLanguageFromText };
