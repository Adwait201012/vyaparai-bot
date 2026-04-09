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

module.exports = { logUdhaar, logWapas, getCustomerUdhaarTotal };
