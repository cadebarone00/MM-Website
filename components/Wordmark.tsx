// "The Maroon" logo, set as live text in the site's title font (Spectral)
// so it always matches The Maroon header. Callers pick the size and color.
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`block whitespace-nowrap font-title font-bold leading-none tracking-tight ${className}`}>The Maroon</span>;
}
