import "server-only";
import { requirePlatformAdmin } from "@/lib/portal/requirePlatformAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { HighlightAdminDeps, PendingDraftRow } from "./adminApi.ts";

/**
 * Real dependencies for the Highlights Admin API: the session-derived platform-admin check and the service-role
 * Supabase client (server only — its key is never sent to the browser). The database functions re-check admin.
 */
export function highlightAdminDeps(): HighlightAdminDeps {
  return {
    authorize: requirePlatformAdmin,
    rpc: async (fn, args) => {
      const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, args);
      return { data, error: error ? { code: error.code, message: error.message } : null };
    },
    pendingDrafts: async () => {
      const { data, error } = await createSupabaseServiceRoleClient().from("highlight_config_drafts")
        .select("id, file_name, change_kind, changes, report, config, base_version, created_at, expires_at")
        .eq("status", "pending").gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(20);
      return { data: (data ?? []) as PendingDraftRow[], error: error ? { code: error.code, message: error.message } : null };
    },
    log: (message) => console.error(message),
  };
}
