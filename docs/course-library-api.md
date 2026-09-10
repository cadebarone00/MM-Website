Course Library API
==================

The host-only course search, import, and refresh use GolfCore:
https://www.golfcore.org/developers/
No account, API key, or database migration is required.

Open Tiger Center > Course Library, search for a course, and import it.
For a course already saved, choose Save to existing course or Find course online.
Review the imported tee sets, fill missing fields, and save and lock them for play.
Only 18-hole courses are supported. The catalog is searched on demand; this does
not download every course into the saved library automatically.

GolfCore attribution and source course links appear on search results and saved
course cards. Structured data may be persisted under GolfCore's API terms:
https://www.golfcore.org/terms/
Course imagery is not imported. Requests identify Maroon Masters in User-Agent.

Missing tee-specific hole data stays blank; reference layout yardages are never
substituted. Men's and women's ratings remain separate. Imports start unlocked.
Refresh preserves manual overrides and unlocks changed tees for review.
Provider-removed tees remain saved to preserve score references.

Existing manual and legacy GolfAPI courses remain intact. Link them to GolfCore
using Find course online. Matching tee names keep existing IDs and values.
Stable provider course IDs prevent repeated new imports; normalized matching
course names block new duplicates and direct the host to link the saved course.
CSV import, manual creation, and historical auto-seeding have been removed.
