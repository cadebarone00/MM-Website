import { statSync } from "node:fs";
import { resolve } from "node:path";
import { featureRegistry } from "../lib/compliance/featureRegistry.ts";
import { validateDocumentationReferences, validateRegistryStructure } from "../lib/compliance/registryStructure.ts";

// npm runs scripts from the package root. No credentials, network, writes or application imports.
const errors = validateRegistryStructure(featureRegistry);
if (!errors.length) {
  errors.push(...validateDocumentationReferences(featureRegistry.documentation, path => {
    try { return statSync(resolve(process.cwd(), path)).isFile(); }
    catch { return false; }
  }));
}
if (errors.length) {
  console.error("Compliance registry structure check failed:\n" + errors.map(error => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Compliance registry structure OK: ${featureRegistry.features.length} features; ${featureRegistry.documentation.length} documentation files.`);
  console.log("Structure only. Unresolved reviews are allowed. This is not a legal compliance or release-readiness determination.");
}
