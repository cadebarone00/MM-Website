/** Keep one-line names intact; choose the fullest top line with a substantial bottom line. */
export function tripTitleLines(name: string, width: number, measure: (text: string) => number): string[] | null {
 const text = name.trim().replace(/\s+/g, ' ');
 if (measure(text) <= width) return [text];
 const words = text.split(' ');
 for (let split = words.length - 1; split > 0; split--) {
  const top = words.slice(0, split).join(' '), bottom = words.slice(split).join(' ');
  if (Array.from(bottom).length >= Math.ceil(Array.from(top).length * .67) && measure(top) <= width && measure(bottom) <= width) return [top, bottom];
 }
 // Names that cannot fit in two whole-word lines retain the existing two-line truncation.
 return null;
}
