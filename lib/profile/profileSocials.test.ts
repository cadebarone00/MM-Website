import { test } from "node:test";
import assert from "node:assert/strict";
import { profileSocialsFromBody, profileSocialsFromRows, socialDisplay, socialFromInput, socialUrlOk } from "./profileSocials";

const made = (platform: Parameters<typeof socialFromInput>[0], typed: string) => { const r = socialFromInput(platform, typed); return r.ok ? r.social.url : `ERR ${r.error}`; };

test("a typed username becomes that app's own address", () => {
  assert.equal(made("instagram", "@cade.b"), "https://instagram.com/cade.b");
  assert.equal(made("facebook", "cade.barone"), "https://facebook.com/cade.barone");
  assert.equal(made("youtube", "@maroongolf"), "https://youtube.com/@maroongolf");
  assert.equal(made("tiktok", "cadeb"), "https://tiktok.com/@cadeb");
  assert.equal(made("linkedin", "cade-barone"), "https://linkedin.com/in/cade-barone");
  assert.equal(made("x", "@cade_b"), "https://x.com/cade_b");
  assert.equal(made("threads", "cade.b"), "https://threads.net/@cade.b");
  assert.equal(made("snapchat", "cadeb"), "https://snapchat.com/add/cadeb");
  assert.equal(made("strava", "123456"), "https://strava.com/athletes/123456");
  assert.equal(made("website", "crownhomes.com/cade"), "https://crownhomes.com/cade");
});

test("a pasted profile link gives the username, but only from that app's own site", () => {
  assert.equal(made("instagram", "https://www.instagram.com/cade.b/?hl=en"), "https://instagram.com/cade.b");
  assert.equal(made("tiktok", "tiktok.com/@cadeb?lang=en"), "https://tiktok.com/@cadeb");
  assert.equal(made("x", "https://twitter.com/cade_b"), "https://x.com/cade_b");
  assert.equal(made("linkedin", "https://www.linkedin.com/in/cade-barone/"), "https://linkedin.com/in/cade-barone");
  assert.equal(made("strava", "https://www.strava.com/athletes/987"), "https://strava.com/athletes/987");
  assert.match(made("instagram", "https://evil.example/cade"), /^ERR .*isn't from Instagram/);
  assert.match(made("instagram", "instagram.com.evil.example/cade"), /^ERR/);
});

test("bad usernames, http websites and empty boxes are refused with a plain message", () => {
  assert.match(made("instagram", ""), /^ERR Type your Instagram username/);
  assert.match(made("instagram", "has space"), /^ERR/);
  assert.match(made("x", "waytoolongusername_x"), /^ERR/);
  assert.match(made("strava", "abc"), /^ERR .*athlete number/);
  assert.match(made("website", "http://plain.example"), /^ERR .*https/);
  assert.match(made("website", "javascript:alert(1)"), /^ERR/);
  assert.equal(socialUrlOk("instagram", "https://instagram.com/../x"), false);
  assert.equal(socialUrlOk("myspace", "https://myspace.com/x"), false);
});

test("save body: at most 4, one per app, every address checked again; rows read back the same way", () => {
  const ig = { platform: "instagram", url: "https://instagram.com/cade" };
  assert.deepEqual(profileSocialsFromBody({ links: [ig] }), { ok: true, socials: [{ platform: "instagram", title: "cade", url: "https://instagram.com/cade" }] });
  assert.equal(profileSocialsFromBody({ links: [ig, ig] }).ok, false, "one per app");
  assert.equal(profileSocialsFromBody({ links: [{ platform: "instagram", url: "https://evil.example/x" }] }).ok, false);
  const five = ["instagram", "tiktok", "x", "threads", "snapchat"].map((platform) => ({ platform, url: made(platform as "x", "cadeb") }));
  assert.equal(profileSocialsFromBody({ links: five }).ok, false, "max 4");
  assert.equal(profileSocialsFromBody(null).ok, false);
  assert.deepEqual(profileSocialsFromRows([ig, { platform: "x", url: "javascript:x" }, ig, null]).map((s) => s.platform), ["instagram"]);
});

test("what shows in the box: @name for @ apps, the plain name otherwise, Strava as Strava", () => {
  assert.equal(socialDisplay({ platform: "instagram", title: "cade", url: "https://instagram.com/cade" }), "@cade");
  assert.equal(socialDisplay({ platform: "linkedin", title: "cade-barone", url: "https://linkedin.com/in/cade-barone" }), "cade-barone");
  assert.equal(socialDisplay({ platform: "strava", title: "123", url: "https://strava.com/athletes/123" }), "Strava");
  assert.equal(socialDisplay({ platform: "website", title: "crownhomes.com", url: "https://crownhomes.com/" }), "crownhomes.com");
});
