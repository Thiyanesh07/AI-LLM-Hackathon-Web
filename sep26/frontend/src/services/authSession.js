/**
 * authSession.js — Client-side session credential cache.
 *
 * Stores the Google ID token in sessionStorage (tab-scoped, cleared on tab close).
 * sessionStorage is ONLY a credential cache for re-sending to the backend on page
 * restore. Backend authorization is never derived from what is stored here.
 *
 * Security invariants:
 *   - Never use localStorage (persists across sessions).
 *   - Never trust sessionStorage content for authorization decisions.
 *   - Always re-validate with backend before granting portal access.
 *   - Expired or invalid tokens are cleared automatically.
 *   - Logout explicitly clears sessionStorage.
 */

const SESSION_KEY = "intellix_session_token";

/**
 * Decode the `exp` claim from a JWT without verifying the signature.
 * Used only to detect client-side expiry before sending to backend.
 * @param {string} token
 * @returns {number|null} UNIX timestamp in seconds, or null if undecodable.
 */
function parseJwtExpiry(token) {
  try {
    if (typeof token !== "string" || !token.includes(".")) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    // Base64url → base64 → JSON
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the token has verifiably expired on the client side.
 * A 60-second safety margin prevents using a token that expires mid-request.
 * @param {string} token
 * @returns {boolean}
 */
function isTokenExpired(token) {
  const exp = parseJwtExpiry(token);
  if (exp === null) return false; // Cannot verify — let backend decide.
  return Date.now() / 1000 >= exp - 60;
}

/**
 * Persist the authenticated Google ID token to sessionStorage.
 * Also keeps the in-memory reference in sync.
 * @param {string} token
 */
export function setAuthToken(token) {
  if (typeof token === "string" && token.length > 0) {
    try {
      sessionStorage.setItem(SESSION_KEY, token);
    } catch {
      // sessionStorage blocked (e.g. private mode with storage disabled) — fail silently.
    }
    _memoryToken = token;
  }
}

/**
 * Retrieve the current authenticated token.
 * If in-memory token is null (e.g. after a page refresh), automatically
 * attempts to restore from sessionStorage.
 * @returns {string|null}
 */
export function getAuthToken() {
  if (!_memoryToken) {
    _memoryToken = restoreSession();
  }
  return _memoryToken;
}

/**
 * Clear authentication — removes from sessionStorage and in-memory.
 * Called on explicit logout.
 */
export function clearAuthToken() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  _memoryToken = null;
}

/**
 * Attempt to restore a prior session from sessionStorage.
 * Returns the token only if it exists and has not verifiably expired.
 * Does NOT perform backend validation — caller must do that.
 * @returns {string|null}
 */
export function restoreSession() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) {
      _memoryToken = null;
      return null;
    }
    if (isTokenExpired(stored)) {
      // Proactively clear expired token.
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // ignore
      }
      _memoryToken = null;
      return null;
    }
    _memoryToken = stored;
    return stored;
  } catch {
    return null;
  }
}

// In-memory mirror for fast synchronous access within the same page load.
let _memoryToken = null;