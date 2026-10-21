# Locally hosted fonts

Downloaded unchanged from official Google Fonts sources on 2026-10-21. Each family directory includes its upstream SIL Open Font License 1.1 (OFL.txt), metadata and a provenance manifest with source URLs, byte counts and SHA-256 hashes. Preserve these notices with distribution. OFL permits embedding and redistribution subject to its conditions, including retaining the license/copyright, reserved-name restrictions and not selling the fonts by themselves. No binaries were modified or renamed internally.

| Family | Configured weights | Styles | Used by |
| --- | --- | --- | --- |
| Spectral | 300, 400, 500, 600, 700, 800 | normal, italic | Shared brand titles/serif: V1, V2, marketing, dashboard |
| Barlow | 300, 400, 500, 600, 700 | normal, italic | Shared brand body text |
| Barlow Semi Condensed | 400, 500, 600, 700 | normal | Shared condensed labels |
| Inter | 400, 500, 600, 700 | normal | Apple notification preview fallback |
| Roboto | 400, 500, 700 | normal | Android notification previews |

Brand declarations live in lib/fonts/brand.ts. Notification declarations remain separate in lib/fonts/notifications.ts, imported only by the notification component. Existing CSS variables, swap behavior, fallback metrics and native system stacks are retained. No substitute family is introduced. All previously configured faces are retained; no extra weights are configured.

Brand binaries are from google/fonts GitHub. Inter and Roboto are official fonts.gstatic.com fixed-weight delivery files; their manifests record the Google CSS request. This freezes the previous default optical size/width rather than adding variable-master axes. Upstream metadata describes the family master, not these delivery filenames. Cached original Google delivery versions matched Spectral 2.005, Barlow/Semi Condensed 1.408, Inter 4.001 and Roboto 3.015. The 33 full-coverage TTF files total approximately 6.48 MB; they avoid conversion/subsetting and preserve upstream glyph coverage. Compression optimization is outside this change.

Engineering review: verified OFL notices permit self-hosting under their conditions. No new personal data, backend, tracking, payments or provider integration is introduced. Broader distribution/professional legal review remains review_required; this is not release authorization. Run node scripts/check-local-fonts.cjs to check vendored integrity.
