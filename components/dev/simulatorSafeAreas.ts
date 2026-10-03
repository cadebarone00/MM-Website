/** Dev-only CSSOM substitution: exercise the app's actual safe-area declarations.
 * An iframe cannot change browser env() values. No source CSS is changed; only
 * this frame's loaded declarations get editable variables at runtime.
 */
const insetSheets = new WeakMap<Document, CSSStyleSheet>();

export function applySimulatorSafeAreas(document: Document, top: number, bottom: number) {
  // A constructed sheet leaves the server-rendered DOM intact during hydration.
  const Constructor = (document.defaultView as (Window & typeof globalThis) | null)?.CSSStyleSheet;
  if (!Constructor) return;
  let insets = insetSheets.get(document);
  if (!insets) {
    insets = new Constructor();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, insets];
    insetSheets.set(document, insets);
  }
  insets.replaceSync(`:root { --dev-safe-area-top: ${top}px; --dev-safe-area-bottom: ${bottom}px; }`);
  function walk(rules: CSSRuleList) {
    for (const rule of Array.from(rules)) {
      if ("style" in rule) {
        const style = (rule as CSSStyleRule).style;
        for (const property of Array.from(style)) {
          const value = style.getPropertyValue(property);
          const replaced = value.replace(/env\(safe-area-inset-(top|bottom)(?:\s*,\s*[^)]+)?\)/g, (_, edge: string) => `var(--dev-safe-area-${edge}, 0px)`);
          if (replaced !== value) style.setProperty(property, replaced, style.getPropertyPriority(property));
        }
      }
      if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules); } catch { /* Cross-origin styles retain their browser-native insets. */ }
  }
}
