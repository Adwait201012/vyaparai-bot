const { supabase } = require("../config/supabase");

async function logUdhaar({ customerName, amount }) {
  const { data, error } = await supabase
    .from("udhaar_logs")
    .insert([
      {
        customer_name: customerName,
        amount,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return data;
}

async function logWapas({ customerName, amount }) {
  const { data, error } = await supabase
    .from("udhaar_logs")
    .insert([
      {
        customer_name: customerName,
        amount: -Math.abs(amount),
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return data;
}

async function getCustomerUdhaarTotal({ customerName }) {
  const { data, error } = await supabase
    .from("udhaar_logs")
    .select("amount")
    .ilike("customer_name", customerName);

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }

  const total = (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return total;
}

async function getTodayHisaab() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("udhaar_logs")
    .select("amount,created_at")
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString());

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }

  const rows = data || [];
  const newUdhaar = rows
    .filter((row) => Number(row.amount || 0) > 0)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const wapasReceived = rows
    .filter((row) => Number(row.amount || 0) < 0)
    .reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);

  const netUdhaar = newUdhaar - wapasReceived;

  return {
    newUdhaar,
    wapasReceived,
    netUdhaar,
  };
}

module.exports = { logUdhaar, logWapas, getCustomerUdhaarTotal, getTodayHisaab };
