import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { checkPortsFree } from "./ports";

test("a busy port is reported, free ports give null", async () => {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as net.AddressInfo).port;
  assert.equal(await checkPortsFree([port]), port);
  await new Promise<void>((r) => server.close(() => r()));
  assert.equal(await checkPortsFree([port]), null);
});
