import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code git worktrees (each has its own .next build output that
    // the plain ".next/**" pattern above doesn't reach since it's nested).
    ".claude/**",
    // Tool output, not app source: Vercel deployment copies (git-ignored)
    // and the brainstorming/planning workspace.
    ".vercel/**",
    ".superpowers/**",
  ]),
  // CommonJS scripts can only import with require().
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]);

export default eslintConfig;
