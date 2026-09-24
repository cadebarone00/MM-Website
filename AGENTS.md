# Living application workflow guide

When changing application behavior, update `docs/app-workflow.md` in the same change. This includes scoring, data sources or destinations, permissions, schemas, handicap calculations, tournament setup, archives, odds, broadcast, and feature availability. Keep descriptions grounded in the implementation and clearly distinguish live features, legacy paths, and placeholders.

Update the affected descriptions and Mermaid flowchart. If the overview boxes or workflow paths change, also update their mapping in `scripts/render-workflow.cjs`.

Add a dated entry at the top of the guide's `## What changed` section. Explain the user-visible behavior before and after, identify affected sections, and distinguish implemented changes from deployed changes. Preserve previous entries. Do not claim a release or deployment was verified unless it was. Pure documentation changes should be labeled as such.

Run `npm run docs:workflow` to regenerate `docs/app-workflow.html`, then `npm run docs:workflow:check` to verify it matches the Markdown. Include both files with the change. Do not hand-edit the generated HTML. For presentation changes, open the HTML in a browser and check the change panel, navigation, and search.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
