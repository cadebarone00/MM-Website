import assert from "node:assert/strict";
import test from "node:test";
import { applyTrade, buyPrice, freshBook, parseBook, parseTrade, untouched } from "./predictBook";

test("buy locks in the price (1%-99%), spends at most the balance; sell cashes out at today's chance", () => {
  assert.equal(buyPrice(0), 0.01);
  assert.equal(buyPrice(1), 0.99);
  const bought = applyTrade(freshBook(), { kind: "buy", key: "teamWinner", outcome: 0, chance: 0.5, spend: 100 });
  assert.ok(bought.ok);
  assert.deepEqual(bought.book, { balance: 900, positions: [{ key: "teamWinner", outcome: 0, shares: 200, paid: 100 }] });
  const sold = applyTrade(bought.book, { kind: "sell", index: 0, key: "teamWinner", chance: 0.75 });
  assert.ok(sold.ok);
  assert.deepEqual(sold.book, { balance: 1050, positions: [] });
  const allIn = applyTrade({ balance: 30, positions: [] }, { kind: "buy", key: "x", outcome: 1, chance: 0.5, spend: 100 });
  assert.ok(allIn.ok);
  assert.equal(allIn.book.balance, 0);
  assert.equal(allIn.book.positions[0].paid, 30);
});

test("can't spend coins you don't have or sell what you don't own", () => {
  assert.deepEqual(applyTrade({ balance: 0, positions: [] }, { kind: "buy", key: "x", outcome: 0, chance: 0.5, spend: 10 }).ok, false);
  assert.equal(applyTrade(freshBook(), { kind: "sell", index: 0, key: "x", chance: 0.5 }).ok, false);
  const book = { balance: 900, positions: [{ key: "a", outcome: 0, shares: 10, paid: 5 }] };
  assert.equal(applyTrade(book, { kind: "sell", index: 0, key: "b", chance: 0.5 }).ok, false, "position at that spot is a different pick");
});

test("wallets and trades are checked before use", () => {
  assert.deepEqual(parseBook({ balance: 500, positions: [{ key: "a", outcome: 1, shares: 3, paid: 2 }] }), { balance: 500, positions: [{ key: "a", outcome: 1, shares: 3, paid: 2 }] });
  assert.equal(parseBook({ balance: -1, positions: [] }), null);
  assert.equal(parseBook({ balance: 10, positions: [{ key: "", outcome: 0, shares: 1, paid: 1 }] }), null);
  assert.equal(parseBook({ balance: 10, positions: [{ key: "a", outcome: 0, shares: Infinity, paid: 1 }] }), null);
  assert.equal(parseBook(null), null);
  assert.deepEqual(parseTrade({ kind: "buy", key: "a", outcome: 0, chance: 0.4, spend: 25 }), { kind: "buy", key: "a", outcome: 0, chance: 0.4, spend: 25 });
  assert.equal(parseTrade({ kind: "buy", key: "a", outcome: 0, chance: 1.4, spend: 25 }), null);
  assert.equal(parseTrade({ kind: "buy", key: "a", outcome: 0, chance: 0.4, spend: -5 }), null);
  assert.equal(parseTrade({ kind: "sell", key: "a", index: -1, chance: 0.4 }), null);
  assert.equal(parseTrade({ kind: "steal", key: "a", chance: 0.4 }), null);
  assert.ok(untouched(freshBook()));
  assert.ok(!untouched({ balance: 1000, positions: [{ key: "a", outcome: 0, shares: 1, paid: 1 }] }));
});

/** A wallet store in memory that behaves like the database row: writes only land on the version they started from. */
function memoryStore(state: { wallet: import("./predictBook").Wallet | null; installed?: boolean }) {
  return {
    async load() { return state.installed === false ? "not_installed" as const : state.wallet ?? { book: freshBook(), version: 0 }; },
    async write(version: number, book: import("./predictBook").Book) {
      if (state.installed === false) return "not_installed" as const;
      if ((state.wallet?.version ?? 0) !== version) return "conflict" as const;
      state.wallet = { book, version: version + 1 };
      return "ok" as const;
    },
  };
}

test("saves go up a version; a save from an older version is refused with the current wallet (two phones never lose a trade)", async () => {
  const { tradeOn } = await import("./predictBook");
  const state = { wallet: null as import("./predictBook").Wallet | null };
  const store = memoryStore(state);
  const buy = { kind: "buy" as const, key: "teamWinner", outcome: 0, chance: 0.5, spend: 100 };
  const first = await tradeOn(store, 0, buy);
  assert.ok(first.ok && first.wallet.version === 1 && first.wallet.book.balance === 900);
  // Phone B still thinks it's at version 0.
  const stale = await tradeOn(store, 0, { ...buy, spend: 50 });
  assert.equal(stale.ok, false);
  assert.ok(!stale.ok && stale.code === "conflict" && stale.wallet.version === 1 && stale.wallet.book.balance === 900);
  // After reloading, phone B's trade lands on top: both trades kept.
  const retry = await tradeOn(store, 1, { ...buy, spend: 50 });
  assert.ok(retry.ok && retry.wallet.book.balance === 850 && retry.wallet.book.positions.length === 2);
  const refused = await tradeOn(store, 2, { kind: "sell", index: 5, key: "teamWinner", chance: 0.5 });
  assert.ok(!refused.ok && refused.code === "refused");
});

test("both phones saving the very first wallet at once: the loser gets a conflict, not a lost trade", async () => {
  const { tradeOn } = await import("./predictBook");
  const state = { wallet: null as import("./predictBook").Wallet | null };
  const store = memoryStore(state);
  const [a, b] = await Promise.all([
    tradeOn(store, 0, { kind: "buy", key: "a", outcome: 0, chance: 0.5, spend: 10 }),
    tradeOn(store, 0, { kind: "buy", key: "b", outcome: 0, chance: 0.5, spend: 10 }),
  ]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal(state.wallet?.book.positions.length, 1);
});

test("not installed is passed on; a device wallet moves over only when nothing is saved yet", async () => {
  const { importTo, tradeOn } = await import("./predictBook");
  const off = await tradeOn(memoryStore({ wallet: null, installed: false }), 0, { kind: "buy", key: "a", outcome: 0, chance: 0.5, spend: 10 });
  assert.ok(!off.ok && off.code === "not_installed");
  const state = { wallet: null as import("./predictBook").Wallet | null };
  const moved = await importTo(memoryStore(state), { balance: 640, positions: [{ key: "a", outcome: 0, shares: 400, paid: 360 }] });
  assert.ok(moved.ok && moved.wallet.version === 1);
  const again = await importTo(memoryStore(state), freshBook());
  assert.ok(!again.ok && again.code === "conflict" && again.wallet.book.balance === 640);
});
