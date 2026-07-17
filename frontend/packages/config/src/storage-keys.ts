/**
 * Namespaced storage keys — one place to change if we ever need to
 * invalidate all client-side state atomically.
 *
 * NOTE: auth tokens deliberately have no key here. Sessions live in
 * httpOnly cookies set by the BFF (`/api/auth/*`); nothing sensitive is
 * ever written to localStorage.
 */

const NS = "telepace";

export const storageKeys = {
  /** Non-sensitive: remembers which sign-in method was used last ("google" | "password"). */
  lastLoginMethod: `${NS}.auth.last_method`,
  /** Non-sensitive: desktop sidebar collapsed to the icon rail ("1" | "0"). */
  sidebarCollapsed: `${NS}.app.sidebar_collapsed`,
  /** Non-sensitive: plan chosen on the pricing page, carried through signup
   *  (e.g. "pro") so onboarding can resume the intended tier after registration. */
  selectedPlan: `${NS}.billing.selected_plan`,
} as const;
