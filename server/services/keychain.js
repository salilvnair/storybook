/**
 * OS keychain wrapper — stores API keys in the native credential store.
 *
 *   macOS   → Keychain
 *   Windows → Credential Manager
 *   Linux   → libsecret / GNOME Keyring / KWallet
 *
 * All methods are async and fail-safe: if keytar is unavailable (native build
 * missing), operations silently return null/false so callers can fall back.
 */

const SERVICE = 'iStorybook';
let kt = null;
let ktChecked = false;

async function lib() {
  if (ktChecked) return kt;
  ktChecked = true;
  try {
    const mod = await import('keytar');
    kt = mod.default ?? mod;
  } catch {
    kt = null;
  }
  return kt;
}

/** Store an API key in the OS keychain. */
export async function setKey(account, secret) {
  const k = await lib();
  if (!k || !secret) return false;
  try { await k.setPassword(SERVICE, account, secret); return true; } catch { return false; }
}

/** Retrieve an API key from the OS keychain. Returns null if not found. */
export async function getKey(account) {
  const k = await lib();
  if (!k) return null;
  try { return await k.getPassword(SERVICE, account) || null; } catch { return null; }
}

/** Delete an API key from the OS keychain. */
export async function deleteKey(account) {
  const k = await lib();
  if (!k) return false;
  try { return await k.deletePassword(SERVICE, account); } catch { return false; }
}

/** Check if a key exists in the OS keychain without reading it. */
export async function hasKey(account) {
  const val = await getKey(account);
  return val !== null && val !== '';
}
