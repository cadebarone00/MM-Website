
/**
 * Formats an absolute instant in whoever is running this code's own local
 * timezone — deliberately passes NO explicit `timeZone` option, which is
 * what makes `toLocaleTimeString` default to the runtime's local zone. Only
 * ever call this from a "use client" component after the component has
 * mounted in a real browser; calling it during server-side rendering
 * formats in the SERVER's zone, not the visitor's, which defeats the point.
 */
export function formatViewerLocalTeeTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
