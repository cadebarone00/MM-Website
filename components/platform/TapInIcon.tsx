/** Original hand-and-button mark, drawn to stay crisp beside the Tap In label. */
export function TapInIcon({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 40" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3h13v5H14z" fill="currentColor" stroke="none" />
      <path d="M15 10c-4 3-7 6-7 11v9a2 2 0 0 0 4 0v-8l5-8" />
      <path d="M25 10c1 5 0 9-3 12l-4 5a2 2 0 0 1-3-3l5-7" />
      <path d="m22 22 1 1a2 2 0 0 1-3 3m-2 1a2 2 0 0 0 3 2l1-2" />
      <path d="M6 37v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M4 37h15" />
      <path d="m3 29-2-1m19 2 2-1" />
    </g>
  </svg>;
}
