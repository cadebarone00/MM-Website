import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupDatabase, checksum, connectionEnvironment, validateManifest, type Runner } from "./databaseBackup";

const connection = "postgresql://operator:private-password@db.example.test/postgres?sslmode=require";
test("missing or malformed credentials fail closed without echoing input", async () => {
  let calls = 0;
  await assert.rejects(backupDatabase({ runner: () => { calls++; return { status: 0 }; } }), /PRODUCTION_DATABASE_URL/);
  assert.equal(calls, 0);
  for (const value of ["private-password", connection + "&options=secret", connection.replace("require", "disable")]) {
    assert.throws(() => connectionEnvironment(value), e => e instanceof Error && !e.message.includes("private-password") && !e.message.includes(value));
  }
});
test("missing pg_dump explains prerequisites before creating output", async () => {
  await assert.rejects(backupDatabase({ connection, runner: () => ({ status: null }) }), /Install PostgreSQL client tools/);
});
test("timestamped backup, manifest and checksum; credentials never enter args or artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "maroon-backup-test-"));
  const runner: Runner = (command, args, env) => {
    assert.ok(!args.join(" ").includes("private-password"));
    if (command === "git") return { status: 0, stdout: "a".repeat(40) };
    if (args.includes("--version")) { assert.equal(env.PGPASSWORD, undefined); return { status: 0 }; }
    assert.equal(env.PGPASSWORD, "private-password");
    assert.ok(args.includes("--format=custom"));
    writeFileSync(args[args.indexOf("--file") + 1], "fixture dump");
    return { status: 0 };
  };
  const folder = await backupDatabase({ connection, root, runner, now: new Date("2026-09-30T12:00:00Z") });
  assert.ok(folder.includes("2026-09-30T12-00-00-000Z"));
  const raw = await readFile(join(folder, "manifest.json"), "utf8");
  assert.ok(!raw.includes("private-password") && !raw.includes("operator"));
  const manifest = JSON.parse(raw);
  assert.ok(validateManifest(manifest));
  assert.equal(manifest.files[0].sha256, await checksum(join(folder, "database.dump")));
  await writeFile(join(folder, "database.dump"), "tampered");
  assert.notEqual(manifest.files[0].sha256, await checksum(join(folder, "database.dump")));
  for (const change of [{ files: [] }, { files: [null] }, { state: "invented" }, { timestamp: "invalid" }, { databaseIdentifier: connection }, { rowCounts: { scores: -1 } }]) assert.equal(validateManifest({ ...manifest, ...change }), false);
});
test("failed dump preserves failed manifest and suppresses child secret diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "maroon-backup-failure-"));
  await assert.rejects(backupDatabase({ connection, root, runner: (_command, args) => {
    if (args.includes("--file")) throw new Error(connection);
    return { status: 0 };
  } }), e => e instanceof Error && !e.message.includes("private-password"));
  const [folder] = await readdir(root);
  const manifest = JSON.parse(await readFile(join(root, folder, "manifest.json"), "utf8"));
  assert.equal(manifest.state, "failed");
  assert.ok(validateManifest(manifest));
});
