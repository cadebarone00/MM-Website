import { join } from "node:path";
import { backupDatabase } from "../lib/platform/databaseBackup";
import { FORBIDDEN_REFS, safeBackupDir } from "./legacy-local/guard.mjs";

// Backups hold personal data: they go to MAROON_BACKUP_DIR (absolute, outside every Git working copy and outside
// cloud-synced folders), never to out/ inside the repository. Only the production project may be backed up here.
const PRODUCTION_REF = Object.keys(FORBIDDEN_REFS).find(ref => FORBIDDEN_REFS[ref as keyof typeof FORBIDDEN_REFS] === "production")!;

let root: string;
try {
  root = join(safeBackupDir(process.env.MAROON_BACKUP_DIR), "database");
  if (!(process.env.PRODUCTION_DATABASE_URL ?? "").includes(PRODUCTION_REF)) {
    throw new Error(`PRODUCTION_DATABASE_URL is not the production project (${PRODUCTION_REF}). Nothing was backed up.`);
  }
} catch (error) {
  console.error(`BACKUP NOT STARTED. ${(error as Error).message}`);
  process.exit(1);
}

backupDatabase({ connection: process.env.PRODUCTION_DATABASE_URL, root }).then(folder => {
  console.log(`Database backup complete: ${folder}`);
}).catch(() => {
  console.error("BACKUP FAILED. Set PRODUCTION_DATABASE_URL explicitly to a PostgreSQL URI with TLS; install compatible pg_dump on PATH. Check any manifest for failure. Credentials and child diagnostics are never printed.");
  process.exitCode = 1;
});
