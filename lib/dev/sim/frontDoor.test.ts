import { test } from "node:test";
import assert from "node:assert/strict";
import { personFromHost, loginPage, SimLog } from "./frontDoor";

test("personFromHost reads the subdomain", () => {
  assert.equal(personFromHost("cam.localhost:3005"), "cam");
  assert.equal(personFromHost("Cade.localhost"), "cade");
  assert.equal(personFromHost("localhost:3005"), null);
  assert.equal(personFromHost("127.0.0.1:3005"), null);
  assert.equal(personFromHost(""), null);
});

test("loginPage clears storage and refuses off-site targets", () => {
  const page = loginPage("/play/abc");
  assert.ok(page.includes("localStorage.clear()"));
  assert.ok(page.includes("sessionStorage.clear()"));
  assert.ok(page.includes('location.replace("/play/abc")'));
  assert.ok(loginPage("//evil").includes('location.replace("/")'));
  assert.ok(loginPage("/\t/evil").includes('location.replace("/")'));
  assert.ok(loginPage("http://evil").includes('location.replace("/")'));
});

test("SimLog keeps the newest 2000 and since() filters", () => {
  const log = new SimLog();
  for (let i = 0; i < 2005; i++) log.add({ person: null, kind: "note", text: `t${i}`, ok: true });
  const all = log.since(0);
  assert.equal(all.length, 2000);
  assert.equal(all[0].text, "t5");
  assert.equal(all[1999].n, 2005);
  assert.deepEqual(log.since(2003).map((e) => e.text), ["t2003", "t2004"]);
});
