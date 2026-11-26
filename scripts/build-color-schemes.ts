// Writes app/color-schemes.css from app/globals.css (project_specs.md "Colour schemes in Settings → Appearance").
// Run after changing a maroon / gold / cream colour in globals.css or a scheme in lib/theme/colorSchemes.ts:
//   npm run build:schemes
import { readFileSync, writeFileSync } from "node:fs";
import { buildSchemeCss } from "../lib/theme/colorSchemes.ts";

writeFileSync("app/color-schemes.css", buildSchemeCss(readFileSync("app/globals.css", "utf8")));
console.log("Wrote app/color-schemes.css");
