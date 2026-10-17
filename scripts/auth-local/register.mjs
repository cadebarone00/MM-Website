// node --import ./scripts/auth-local/register.mjs … — lets the app's real route handlers run in plain Node for the
// local auth tests: "next/headers" becomes a cookie jar the test controls (one jar = one browser) and "server-only"
// becomes empty. registerHooks (Node 23.5+) covers both import and require, which tsx uses for the app's TS files.
import { registerHooks } from "node:module";

const stub = new URL("./next-headers-stub.mjs", import.meta.url).href;
const serverOnly = new URL("./server-only-stub.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/headers" || specifier === "next/headers.js") return { url: stub, format: "module", shortCircuit: true };
    if (specifier === "server-only") return { url: serverOnly, format: "module", shortCircuit: true };
    return next(specifier, context);
  },
});
