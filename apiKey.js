// Stores the member's own Anthropic API key (used client-side for the meal
// photo / InBody OCR features) in this browser only. Never sent anywhere
// except directly from this browser to Anthropic's API.
const KEY = "ttgym_anthropic_api_key";

export function getApiKey() {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setApiKey(value) {
  try {
    if (value) {
      window.localStorage.setItem(KEY, value);
    } else {
      window.localStorage.removeItem(KEY);
    }
  } catch (e) {
    // ignore (e.g. private browsing / storage disabled)
  }
}
