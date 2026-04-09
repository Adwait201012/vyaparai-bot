const { extractTransaction } = require("../services/aiExtractionService");
const {
  logUdhaar,
  logWapas,
  getCustomerUdhaarTotal,
} = require("../services/udhaarService");
const { sendTextMessage } = require("../services/whatsappService");

const verifyWebhook = (req, res) => {
  res.status(200).send("Twilio webhook is active");
};

function parseUdhaarTotalQuery(text) {
  const cleaned = String(text || "").trim().replace(/\s+/g, " ");
  const kitnaMatch = cleaned.match(/^(.+?)\s+kitna\s+udhaar$/i);
  if (kitnaMatch) {
    return { customerName: kitnaMatch[1].trim() };
  }

  const bataoMatch = cleaned.match(/^(.+?)\s+ka\s+udhaar\s+batao$/i);
  if (bataoMatch) {
    return { customerName: bataoMatch[1].trim() };
  }

  return null;
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

    const totalQuery = parseUdhaarTotalQuery(text);
    if (totalQuery) {
      const total = await getCustomerUdhaarTotal({
        customerName: totalQuery.customerName,
      });
      const replyText = `${totalQuery.customerName} ka kul udhaar: ₹${total} hai`;
      await sendTextMessage({
        to: ownerWaId,
        text: replyText,
      });
      return;
    }

    const parsed = await extractTransaction(text);
    if (parsed.type === "unknown") {
      return;
    }

    if (parsed.type === "udhaar") {
      await logUdhaar({
        customerName: parsed.customerName,
        amount: parsed.amount,
      });

      const replyText = `✅ ${parsed.customerName} ka ₹${parsed.amount} udhaar logged!`;
      await sendTextMessage({
        to: ownerWaId,
        text: replyText,
      });
      return;
    }

    await logWapas({
      customerName: parsed.customerName,
      amount: parsed.amount,
    });

    const replyText = `✅ ${parsed.customerName} ka ₹${parsed.amount} wapas logged!`;
    await sendTextMessage({
      to: ownerWaId,
      text: replyText,
    });
  } catch (error) {
    console.error("Webhook processing error:", error.message);
  }
}

module.exports = { verifyWebhook, receiveWebhook };
