import { test } from "node:test";
import assert from "node:assert/strict";
import { wagersNavBarContent } from "./navBarContent";

test("hub route opens the More menu and shows the portfolio link", () => {
  assert.deepEqual(wagersNavBarContent("/wagers"), {
    backLabel: "More",
    backHref: null,
    title: "Wagers",
    showPortfolioLink: true,
  });
});

test("portfolio route backs to the hub and hides its own link", () => {
  assert.deepEqual(wagersNavBarContent("/wagers/portfolio"), {
    backLabel: "Wagers",
    backHref: "/wagers",
    title: "My Portfolio",
    showPortfolioLink: false,
  });
});

test("a known category route backs to the hub with its display title", () => {
  assert.deepEqual(wagersNavBarContent("/wagers/matches"), {
    backLabel: "Wagers",
    backHref: "/wagers",
    title: "Matches",
    showPortfolioLink: true,
  });
});

test("every category slug maps to a display title", () => {
  assert.equal(wagersNavBarContent("/wagers/team-futures").title, "Team Futures");
  assert.equal(wagersNavBarContent("/wagers/player-futures").title, "Player Futures");
  assert.equal(wagersNavBarContent("/wagers/fourballs").title, "Fourballs");
  assert.equal(wagersNavBarContent("/wagers/props").title, "Props");
});
