const { detectIntent } = require("../services/aiExtractionService");
const {
  logUdhaar,
  logWapas,
  getCustomerUdhaarTotal,
  getTodayHisaab,
  saveCustomerPhone,
  getCustomerPhone,
  getAllPendingUdhaar,
} = require("../services/udhaarService");
const { sendTextMessage } = require("../services/whatsappService");

const verifyWebhook = (req, res) => {
  res.status(200).send("Twilio webhook is active");
};

function formatAmount(value) {
  const numberValue = Number(value || 0);
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2);
}

function normalizeCustomerPhone(phone) {
  const raw = String(phone || "").trim();
  if (raw.startsWith("+")) {
    return raw;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return `+${digits}`;
}

async function handleTodayHisaab({ ownerWaId }) {
  const today = await getTodayHisaab();
  const replyText =
    `Aaj ka hisaab:\n` +
    `Naya udhaar: ₹${formatAmount(today.newUdhaar)}\n` +
    `Wapas mila: ₹${formatAmount(today.wapasReceived)}\n` +
    `Net udhaar aaj: ₹${formatAmount(today.netUdhaar)}`;

  await sendTextMessage({
    to: ownerWaId,
    text: replyText,
  });
}

async function receiveWebhook(req, res) {
  // Twilio expects quick 200 response to acknowledge webhook.
  res.status(200).send("ok");

  try {
    const ownerWaId = req.body?.From;
    const text = req.body?.Body;

    if (!ownerWaId || !text) {
      return;
    }

    const aiResult = await detectIntent(text);
    const intent = aiResult.intent || "UNKNOWN";
    const customerName = (aiResult.customerName || "").trim();
    const amount = Number(aiResult.amount);
    const phoneNumber = (aiResult.phoneNumber || "").trim();

    if (intent === "TODAY_HISAAB") {
      await handleTodayHisaab({ ownerWaId });
      return;
    }

    if (intent === "SABKA_UDHAAR") {
      const result = await getAllPendingUdhaar();

      if (!result.customers.length) {
        await sendTextMessage({
          to: ownerWaId,
          text: "Sabka udhaar:\nKoi pending udhaar nahi hai.\nTotal: Rs0",
        });
        return;
      }

      const lines = result.customers.map(
        (item) => `${item.customerName}: Rs${formatAmount(item.total)}`,
      );
      const replyText =
        `Sabka udhaar:\n` +
        `${lines.join("\n")}\n` +
        `Total: Rs${formatAmount(result.grandTotal)}`;

      await sendTextMessage({ to: ownerWaId, text: replyText });
      return;
    }

    if (intent === "SAVE_NUMBER") {
      if (!customerName || !phoneNumber) {
        await sendTextMessage({
          to: ownerWaId,
          text: "Customer name ya phone number samajh nahi aaya.",
        });
        return;
      }

      await saveCustomerPhone({
        customerName,
        phone: normalizeCustomerPhone(phoneNumber),
      });
      await sendTextMessage({
        to: ownerWaId,
        text: `${customerName} ka number save ho gaya.`,
      });
      return;
    }

    if (intent === "SEND_REMINDER") {
      if (!customerName) {
        await sendTextMessage({
          to: ownerWaId,
          text: "Kis customer ko reminder bhejna hai, samajh nahi aaya.",
        });
        return;
      }

      const customerPhone = await getCustomerPhone({ customerName });
      if (!customerPhone) {
        await sendTextMessage({
          to: ownerWaId,
          text: `${customerName} ka number nahi mila. Pehle "${customerName} number 9876543210" bhejein.`,
        });
        return;
      }

      const total = await getCustomerUdhaarTotal({ customerName });
      const reminderText =
        `Namaste ${customerName} ji! ` +
        `Aapka hamare shop mein ₹${formatAmount(total)} udhaar baaki hai. ` +
        `Kripya jald chukta karein. Dhanyawad!`;

      await sendTextMessage({ to: customerPhone, text: reminderText });
      await sendTextMessage({
        to: ownerWaId,
        text: `${customerName} ko reminder bhej diya gaya.`,
      });
      return;
    }

    if (intent === "CHECK_UDHAAR") {
      if (!customerName) {
        await sendTextMessage({
          to: ownerWaId,
          text: "Customer ka naam samajh nahi aaya.",
        });
        return;
      }

      const total = await getCustomerUdhaarTotal({ customerName });
      await sendTextMessage({
        to: ownerWaId,
        text: `${customerName} ka kul udhaar: ₹${formatAmount(total)} hai`,
      });
      return;
    }

    if (intent === "LOG_WAPAS") {
      if (!customerName || !Number.isFinite(amount) || amount <= 0) {
        await sendTextMessage({
          to: ownerWaId,
          text: "Wapas entry ke liye naam ya amount clear nahi hai.",
        });
        return;
      }

      await logWapas({ customerName, amount });
      const remainingTotal = await getCustomerUdhaarTotal({ customerName });
      await sendTextMessage({
        to: ownerWaId,
        text: `${customerName} ne ₹${formatAmount(amount)} wapas diya. Baaki udhaar: ₹${formatAmount(remainingTotal)}`,
      });
      return;
    }

    if (intent === "LOG_UDHAAR") {
      if (!customerName || !Number.isFinite(amount) || amount <= 0) {
        await sendTextMessage({
          to: ownerWaId,
          text: "Udhaar entry ke liye naam ya amount clear nahi hai.",
        });
        return;
      }

      await logUdhaar({ customerName, amount });
      await sendTextMessage({
        to: ownerWaId,
        text: `${customerName} ka ₹${formatAmount(amount)} udhaar logged!`,
      });
      return;
    }
  } catch (error) {
    console.error("Webhook processing error:", error.message);
  }
}

module.exports = { verifyWebhook, receiveWebhook };
