import { PROVIDERS, type Provider, type ProviderCategory } from "./tripIntegrations.ts";

/**
 * Server-side entry point for Golf Trip integrations: Frontend → our API route → this file → the provider's API.
 * The only place integration env vars are read. Never import this from a client component.
 * No provider is implemented yet, so every request answers NOT_CONFIGURED (never fake data).
 */

export type IntegrationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_CONFIGURED" | "UNKNOWN_PROVIDER" | "PROVIDER_ERROR"; message: string };

export interface IntegrationRequest {
  category: ProviderCategory;
  provider: string;
  action: "search" | "import" | "sync";
  /** Provider-specific input (a search term, a confirmation number, …). */
  input: Record<string, string>;
}

/** Each provider status as this server sees it: "configured" once all its env keys are present. */
export function providerStatuses(env: Record<string, string | undefined> = process.env): Provider[] {
  return PROVIDERS.map((p) =>
    p.status === "planned" && p.envKeys?.length && p.envKeys.every((k) => Boolean(env[k])) ? { ...p, status: "configured" } : p,
  );
}

/** Implemented providers register here later: `"flight:flight-generic": (req) => …`. Empty on purpose. */
const HANDLERS: Record<string, (req: IntegrationRequest) => Promise<IntegrationResult<unknown>>> = {};

export async function runIntegration(req: IntegrationRequest): Promise<IntegrationResult<unknown>> {
  const provider = providerStatuses().find((p) => p.category === req.category && p.key === req.provider);
  if (!provider) return { ok: false, code: "UNKNOWN_PROVIDER", message: `No ${req.category} provider "${req.provider}".` };
  const handler = HANDLERS[`${req.category}:${req.provider}`];
  if (!handler || provider.status === "planned" || provider.status === "disabled" || !provider.capabilities.includes(req.action)) {
    return { ok: false, code: "NOT_CONFIGURED", message: `${provider.name} isn't connected yet — add it manually.` };
  }
  return handler(req);
}
