function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedinGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

export function SocialLinks({ instagram, linkedin, className = "" }: { instagram?: string; linkedin?: string; className?: string }) {
  return (
    <div className={["flex gap-2", className].join(" ")}>
      {instagram ? (
        <a
          href={instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white shadow-md transition-opacity hover:opacity-80"
        >
          <InstagramGlyph />
        </a>
      ) : (
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white opacity-50">
          <InstagramGlyph />
        </span>
      )}
      {linkedin ? (
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white shadow-md transition-opacity hover:opacity-80"
        >
          <LinkedinGlyph />
        </a>
      ) : (
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white opacity-50">
          <LinkedinGlyph />
        </span>
      )}
    </div>
  );
}
