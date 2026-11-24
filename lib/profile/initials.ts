/** A person's initials for their avatar: the first letter of up to two words, or "?" with no name. Shared by the
 *  website and the Expo app (mobile/), so both show the same letters. */
export function initialsFor(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase());
  return letters.length ? letters.join("") : "?";
}
