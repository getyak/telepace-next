/**
 * All in-app route paths, in one place.
 *
 * Prevents drift when a page is moved or renamed. Import from here instead
 * of writing route strings inline in `<Link href="...">`.
 */

export const routes = {
  home: "/",
  product: {
    voice: "/product/voice",
    agent: "/product/agent",
  },
  pricing: "/pricing",
  docs: "/docs",
  mcp: "/mcp",
  security: "/security",
  demo: "/demo",
  terms: "/terms",
  privacy: "/privacy",
  customers: "/customers",
  changelog: "/changelog",
  careers: "/careers",

  login: "/login",
  signup: "/signup",
  forgot: "/forgot",

  app: {
    // The marketing home owns "/" — the app's landing surface is Studies.
    root: "/studies",
    inbox: "/inbox",
    audience: "/audience",
    insights: "/insights",
    copilot: "/copilot",
    integrations: "/integrations",
    settings: "/settings",
    studies: {
      root: "/studies",
      new: "/studies/new",
      byId: (id: string) => `/studies/${id}`,
    },
  },

  respondent: (campaignId: string) => `/r/${campaignId}`,
} as const;

export type Routes = typeof routes;
