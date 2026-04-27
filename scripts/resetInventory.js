/**
 * resetInventory.js
 * Deletes ALL rows from the inventory table in Supabase.
 * Run once with: node scripts/resetInventory.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetInventory() {
  console.log("⚠️  Deleting ALL rows from inventory table...");

  // Delete all rows — filter on item_name column which always has a value
  const { error, count } = await supabase
    .from("inventory")
    .delete({ count: "exact" })
    .neq("item_name", "__no_such_item__");

  if (error) {
    console.error("❌ Failed to reset inventory:", error.message);
    process.exit(1);
  }

  console.log(`✅ Inventory table cleared. Rows deleted: ${count ?? "unknown"}`);
  console.log("🚀 You can now re-add stock and all items will be properly normalized.");
}

resetInventory();
