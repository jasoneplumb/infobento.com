/**
 * Intent: One source for the `User-Agent` values server-side fetches send, so
 *         a version or URL change cannot leave providers identifying
 *         themselves differently.
 * Context: `User-Agent` is a forbidden request header in Chromium `fetch`
 *          (silently dropped) but Firefox sends it, so only server callers
 *          should set these.
 */

/** Bare product token. */
export const USER_AGENT_PRODUCT = 'InfoBento/1.0';

/**
 * Identifying form with a contact URL, for APIs whose usage policy asks for
 * one (Nominatim) or that reject anonymous runtime defaults (ipapi.co, #278).
 */
export const USER_AGENT = `${USER_AGENT_PRODUCT} (https://github.com/jasoneplumb/infobento.com)`;
