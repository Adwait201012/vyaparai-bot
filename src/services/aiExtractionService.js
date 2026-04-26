const Groq = require("groq-sdk");
const env = require("../config/env");

const client = new Groq({ apiKey: env.groqApiKey });

const SYSTEM_PROMPT = `You are BharatBahi, AI assistant for Indian small businesses. Return ONLY valid JSON, no extra text:
{intent, customerName, amount, itemName, quantity, unit, phoneNumber, expenseCategory, language}
Intent rules:

Message has person name + amount + udhaar/baaki/credit → LOG_UDHAAR
Message has person name + kitna udhaar/baaki kitna → CHECK_UDHAAR
Message has person name + amount + wapas/diya/paid → LOG_WAPAS
Message has ANY item/product + aaya/aai/mila/received/bought/order → INVENTORY_ADD
Message has item + kitna hai/stock kitna/remaining → CHECK_STOCK
Message says sabka stock/all stock/inventory dikhao → ALL_STOCK
Message says aaj ka hisaab/today summary/daily report → TODAY_HISAAB
Message says sabka udhaar/all credit/baaki list → SABKA_UDHAAR
Message has expense keywords like bill/rent/salary/kharcha/bijli/paid for expense → LOG_EXPENSE
Message says hi/hello/namaste/hey/start → GREETING
Anything else → UNKNOWN

Number rules:

ALWAYS extract complete numbers: 100kg → quantity:100 unit:kg
NEVER extract partial numbers

Item vs person rule:

Human names (Sharma, Ramesh, Mohan, Sunita) → customerName
Products (chawal, aata, paracetamol, notebook, cement) → itemName
Key signal: if message has aaya/aai/mila → it's ALWAYS an item, never a person

Language rule:

Pure Hindi Devanagari script → hindi
Pure English → english
Mixed Hindi+English → hinglish
Always return the detected language`;

const ITEM_NORMALIZATION_MAP = {
  'rice': 'chawal',
  'wheat': 'aata',
  'oil': 'tel',
  'flour': 'aata',
  'atta': 'aata',
  'maggi': 'maggi',
  'sugar': 'cheeni',
  'salt': 'namak',
  'tea': 'chai',
  'coffee': 'coffee',
  'milk': 'doodh',
  'bread': 'bread',
  'butter': 'makhan',
  'ghee': 'ghee',
  'soap': 'sabun',
  'shampoo': 'shampoo',
  'toothpaste': 'toothpaste'
};

function normalizeItemName(itemName) {
  if (!itemName) return null;
  const normalized = String(itemName).toLowerCase().trim();
  return ITEM_NORMALIZATION_MAP[normalized] || normalized;
}

function normalizeCustomerName(customerName) {
  if (!customerName) return null;
  return String(customerName)
    .toLowerCase()
    .replace(/\b(ji|bhai|ben|devi|sahab|sir|mr|mrs|ms)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguage(message) {
  const text = String(message || "").trim();
  if (!text) return "hinglish";
  
  // Check for pure Hindi script
  if(/[\u0900-\u097F]/.test(text) && !/[a-zA-Z]/.test(text)) {
    return "hindi";
  }
  
  // Check for pure English
  if(!/[\u0900-\u097F]/.test(text) && /[a-zA-Z]/.test(text)) {
    return "english";
  }
  
  // Mixed = Hinglish
  return "hinglish";
}

function normalizeJsonText(rawText) {
  const cleaned = String(rawText || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "");
  return cleaned
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ': "$1"');
}

function getJsonObjectText(rawText) {
  const text = String(rawText || "");
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return text;
  }
  return text.slice(firstBrace, lastBrace + 1);
}

async function detectIntent(messageText) {
  let parsed = {};
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount < maxRetries) {
    try {
      const completion = await client.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: String(messageText || "") },
        ],
      });
      
      const output = completion.choices?.[0]?.message?.content || "";
      parsed = JSON.parse(normalizeJsonText(getJsonObjectText(output)));
      
      // Validate required fields
      if (parsed.intent && typeof parsed.intent === 'string') {
        break;
      } else {
        throw new Error("Invalid intent format");
      }
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error("Groq API failed after retries:", error.message);
        throw new Error("Network issue, try again!");
      }
    }
  }

  // Default fallback shouldn't be reached if it throws, but kept for safety
  if (!parsed.intent) {
    throw new Error("Network issue, try again!");
  }

  // Normalize extracted data
  return {
    intent: parsed.intent || "UNKNOWN",
    customerName: parsed.customerName ? normalizeCustomerName(parsed.customerName) : null,
    amount: parsed.amount ? Number(parsed.amount) : null,
    itemName: parsed.itemName ? normalizeItemName(parsed.itemName) : null,
    quantity: parsed.quantity ? Number(parsed.quantity) : null,
    unit: parsed.unit ? String(parsed.unit).toLowerCase() : null,
    phoneNumber: parsed.phoneNumber ? String(parsed.phoneNumber).trim() : null,
    expenseCategory: parsed.expenseCategory ? String(parsed.expenseCategory).trim() : null,
    language: parsed.language || detectLanguage(messageText)
  };
}

module.exports = {
  detectIntent,
  normalizeItemName,
  normalizeCustomerName,
  detectLanguage
};
