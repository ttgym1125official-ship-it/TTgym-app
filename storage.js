// Polyfills the `window.storage` key-value API that App.jsx and
// AdminDashboard.jsx were originally written against, backed by the
// Supabase "kv_store" table (key text primary key, value text) instead of
// per-device browser storage. Because both the member app and the admin
// dashboard read/write the same Supabase table, data recorded on a
// member's phone is visible to staff on a completely different device.
import { supabase } from "./supabaseClient.js";

async function get(key) {
  const { data, error } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return { value: data.value };
}

async function set(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  return true;
}

async function list(prefix) {
  const { data, error } = await supabase
    .from("kv_store")
    .select("key")
    .like("key", `${prefix}%`);
  if (error) return { keys: [] };
  return { keys: (data || []).map((row) => row.key) };
}

if (typeof window !== "undefined") {
  window.storage = { get, set, list };
}

export default { get, set, list };
