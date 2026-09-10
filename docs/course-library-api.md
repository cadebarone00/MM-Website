Course Library API setup
========================

The Course Library uses GolfAPI.io v2.3 for host-only course search, import,
and refresh. Documentation: https://www.golfapi.io/docs/ (linked Postman reference).

1. Obtain a GolfAPI.io account/key and a plan allowing course storage.
2. Set GOLF_API_KEY in the server environment locally and on the deployment.
   Never use a NEXT_PUBLIC variable for this key. Restart the server afterward.
3. Open Tiger Center → Course Library, search by club name, and import an
   18-hole course. Review the imported drafts and lock complete tee sets.

Existing manual courses can use Find course online to attach provider tee sets.
Manual tee sets are retained. Men's and women's ratings use separate tee sets.
Meters are converted to yards. Missing values remain draft placeholders.

Refresh compares each value to its previous provider snapshot. Locally edited
values stay local; untouched values receive updates. Changed tee sets unlock
for review. Unchanged locked tees remain available. Removed provider tees are
retained locally so saved references are not broken.

Provider IDs and snapshots live in the existing tee_sets JSON column; no new
database migration is required. Stable course IDs prevent duplicate new imports.
CSV and manual entry remain available as fallback workflows.

Search/import consumes provider API credits. Bulk catalog download is not enabled.
No provider account or key has been provisioned by this implementation.
