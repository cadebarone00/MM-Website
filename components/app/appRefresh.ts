/**
 * Pull-to-refresh and coming back to the app: every screen loaded with useAppData loads its data again (quietly,
 * keeping what's on screen until the new data arrives).
 */
const listeners = new Set<() => void>();

export function onAppRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Asks every open screen to reload. */
export function refreshApp(): void {
  listeners.forEach((listener) => listener());
}

/** Whether the open screen can reload (screens that load their own data don't offer pull-to-refresh). */
export const canRefreshApp = () => listeners.size > 0;
