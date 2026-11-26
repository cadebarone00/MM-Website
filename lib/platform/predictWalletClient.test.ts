import assert from "node:assert/strict";
import test from "node:test";
import type { Book } from "./predictBook";
import { openWallet, walletTrade, type DeviceWallet, type WalletRequest } from "./predictWalletClient";

const memoryDevice = (book: Book | null = null) => {
  const state = { book, moved: false };
  const device: DeviceWallet = { read: () => state.book, write: (b) => { state.book = b; }, moved: () => state.moved, markMoved: () => { state.moved = true; } };
  return { state, device };
};
const buy = { kind: "buy" as const, key: "teamWinner", outcome: 0, chance: 0.5, spend: 100 };

test("not installed (503) or no saved trip: the device wallet is used, and trades save on the device", async () => {
  const { state, device } = memoryDevice();
  const opened = await openWallet(async () => ({ status: 503, body: {} }), device);
  assert.equal(opened.mode, "device");
  assert.equal((await openWallet(null, device)).mode, "device");
  const traded = await walletTrade(opened, buy, null, device);
  assert.ok(traded.ok);
  assert.equal(state.book?.balance, 900);
});

test("first open on the account moves this device's wallet over once", async () => {
  const local = { balance: 700, positions: [{ key: "a", outcome: 0, shares: 600, paid: 300 }] };
  const { state, device } = memoryDevice(local);
  const sent: unknown[] = [];
  const request: WalletRequest = async (method, body) => {
    sent.push([method, body]);
    return method === "GET" ? { status: 200, body: { book: { balance: 1000, positions: [] }, version: 0 } } : { status: 200, body: { book: local, version: 1 } };
  };
  const opened = await openWallet(request, device);
  assert.deepEqual([opened.mode, opened.version, opened.book.balance], ["account", 1, 700]);
  assert.deepEqual(sent[1], ["PUT", { version: 0, import: local }]);
  assert.ok(state.moved);
  sent.length = 0;
  await openWallet(request, device);
  assert.equal(sent.length, 1, "already moved: no second copy");
});

test("account trade: saved wallet replaces mine; a conflict shows the other device's wallet; offline keeps mine and says so", async () => {
  const { device } = memoryDevice();
  const start = { book: { balance: 1000, positions: [] }, version: 3, mode: "account" as const, error: null };
  const saved = await walletTrade(start, buy, async () => ({ status: 200, body: { book: { balance: 900, positions: [{ key: "teamWinner", outcome: 0, shares: 200, paid: 100 }] }, version: 4 } }), device);
  assert.ok(saved.ok && saved.state.version === 4 && saved.state.book.balance === 900);
  const conflict = await walletTrade(start, buy, async () => ({ status: 409, body: { error: "x", book: { balance: 500, positions: [] }, version: 7 } }), device);
  assert.ok(!conflict.ok && conflict.state.version === 7 && conflict.state.book.balance === 500 && /another device/.test(conflict.state.error ?? ""));
  const offline = await walletTrade(start, buy, async () => ({ status: 0, body: null }), device);
  assert.ok(!offline.ok && offline.state.book.balance === 1000 && /offline/.test(offline.state.error ?? ""));
  const thrown = await walletTrade(start, buy, async () => { throw new Error("no network"); }, device);
  assert.ok(!thrown.ok && thrown.state.book.balance === 1000);
});
