/**
 * Site-wide constants shared across marketing + app + respondent.
 *
 * Only put things here that would be embarrassing to have wrong in three
 * places at once. External URLs, brand copy, contact addresses.
 */

export const siteConfig = {
  brand: {
    name: "telepace",
    tagline: "Voice-native, Agent-first user research infrastructure",
  },
  contact: {
    supportEmail: "support@telepace.io",
    securityEmail: "security@telepace.io",
    pgpFingerprint: "0xA1B2C3D4E5F6",
  },
  urls: {
    // These are external / marketing-visible URLs, distinct from the runtime
    // env-provided base URLs (which change per environment).
    home: "https://telepace.io",
    mcpEndpoint: "https://mcp.telepace.io",
    githubOrg: "https://github.com/telepace",
  },
} as const;

export type SiteConfig = typeof siteConfig;
