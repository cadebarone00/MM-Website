import { backupDatabase } from "../lib/platform/databaseBackup";

backupDatabase({ connection: process.env.PRODUCTION_DATABASE_URL }).then(folder => {
  console.log(`Database backup complete: ${folder}`);
}).catch(() => {
  console.error("BACKUP FAILED. Set PRODUCTION_DATABASE_URL explicitly to a PostgreSQL URI with TLS; install compatible pg_dump on PATH. Check any manifest for failure. Credentials and child diagnostics are never printed.");
  process.exitCode = 1;
});
