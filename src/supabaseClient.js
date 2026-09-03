import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://udfbnjatqjdswokuoqoo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__rOCDCsWxALHCdQbYfGcBg_7TPateU2";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MEMBER_ID_KEY = "ttgym_member_id";

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Anonymous Supabase auth isn't enabled for this project, so each member's
// identity is just a random id kept in this browser's localStorage. That's
// fine because the actual data lives in the shared kv_store table (see
// storage.js), so staff can see it from the admin dashboard regardless of
// which device/browser the member used — only the *id* is local, not the data.
export async function getMemberId() {
  try {
    let id = window.localStorage.getItem(MEMBER_ID_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(MEMBER_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return randomId();
  }
}
