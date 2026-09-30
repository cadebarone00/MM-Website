import { test } from "node:test";
import assert from "node:assert/strict";
import { backupHealth, type BackupHealthInput } from "./backupHealth";
const now = new Date("2026-09-30T12:00:00Z");
const policy = { warningHours: 24, criticalHours: 48, restoreDrillDays: 30, requirePitr: true };
const fixture: BackupHealthInput = { latestProviderBackupAt: now.toISOString(), latestIndependentBackupAt: now.toISOString(), latestRestoreDrillAt: now.toISOString(), pitrEnabled: true, databaseSizeBytes: 1024 };
test("health uses explicit planning thresholds and evidence", () => {
  assert.equal(backupHealth(fixture, policy, now).status, "healthy");
  assert.equal(backupHealth({ ...fixture, pitrEnabled: false }, policy, now).status, "warning");
  assert.equal(backupHealth({ ...fixture, latestIndependentBackupAt: "2026-09-29T12:00:00Z" }, policy, now).status, "warning");
  assert.equal(backupHealth({ ...fixture, latestIndependentBackupAt: "2026-09-28T12:00:00Z" }, policy, now).status, "critical");
  assert.equal(backupHealth({ ...fixture, latestProviderBackupAt: null, latestIndependentBackupAt: null }, policy, now).status, "unknown");
  assert.equal(backupHealth({ ...fixture, latestRestoreDrillAt: "2026-08-01" }, policy, now).status, "warning");
  const invalid = backupHealth({ ...fixture, latestIndependentBackupAt: "2027-01-01", latestProviderBackupAt: "invalid", databaseSizeBytes: -1 }, policy, now);
  assert.equal(invalid.status, "unknown");
  assert.equal(invalid.databaseSizeBytes, null);
  assert.throws(() => backupHealth(fixture, { ...policy, criticalHours: 1 }, now));
});
