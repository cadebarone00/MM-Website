export interface BackupHealthInput {
  latestProviderBackupAt: string | null;
  latestIndependentBackupAt: string | null;
  latestRestoreDrillAt: string | null;
  pitrEnabled: boolean | null;
  databaseSizeBytes: number | null;
}
export interface BackupHealthPolicy {
  warningHours: number;
  criticalHours: number;
  restoreDrillDays: number;
  requirePitr: boolean;
}
export function backupHealth(input: BackupHealthInput, policy: BackupHealthPolicy, now: Date) {
  if (!Number.isFinite(now.getTime()) || ![policy.warningHours, policy.criticalHours, policy.restoreDrillDays].every(n => Number.isFinite(n) && n > 0) || policy.criticalHours < policy.warningHours) throw new Error("Invalid health policy or clock");
  const warnings: string[] = [];
  const age = (value: string | null, label: string) => {
    const elapsed = value === null ? NaN : (now.getTime() - Date.parse(value)) / 3600000;
    if (!Number.isFinite(elapsed) || elapsed < 0) { warnings.push(`${label} evidence missing or invalid`); return null; }
    return elapsed;
  };
  const providerAgeHours = age(input.latestProviderBackupAt, "Provider backup");
  const backupAgeHours = age(input.latestIndependentBackupAt, "Independent backup");
  const drillHours = age(input.latestRestoreDrillAt, "Restore drill");
  const restoreDrillAgeDays = drillHours === null ? null : drillHours / 24;
  const ages = [providerAgeHours, backupAgeHours].filter((n): n is number => n !== null);
  if (ages.some(n => n >= policy.warningHours)) warnings.push("Backup freshness exceeds policy");
  if (restoreDrillAgeDays !== null && restoreDrillAgeDays >= policy.restoreDrillDays) warnings.push("Restore drill overdue");
  if (input.pitrEnabled === null) warnings.push("PITR status unknown");
  if (policy.requirePitr && input.pitrEnabled === false) warnings.push("PITR required by planning policy");
  const databaseSizeBytes = input.databaseSizeBytes !== null && Number.isSafeInteger(input.databaseSizeBytes) && input.databaseSizeBytes >= 0 ? input.databaseSizeBytes : null;
  if (databaseSizeBytes === null) warnings.push("Database size unknown");
  const status: "healthy" | "warning" | "critical" | "unknown" = ages.some(n => n >= policy.criticalHours) ? "critical" : ages.length === 0 ? "unknown" : warnings.length ? "warning" : "healthy";
  return { ...input, databaseSizeBytes, providerAgeHours, backupAgeHours, restoreDrillAgeDays, status, warnings };
}
