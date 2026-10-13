import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const dir = new URL("../../assets/vendor/qrcode-generator/", import.meta.url);

test("qrcode-generator совпадает с записью в SOURCE.txt", () => {
  const source = readFileSync(new URL("SOURCE.txt", dir), "utf8");
  const want = /^sha256: ([0-9a-f]{64})$/m.exec(source)?.[1];
  assert.equal(want, "ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0");
  assert.match(source, /^версия: 2\.0\.4$/m);
  assert.match(source, /^путь в пакете: dist\/qrcode\.mjs$/m);
  const bytes = readFileSync(new URL("qrcode.js", dir));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), want);
});

test("изменение одного байта ловится", () => {
  const bytes = Buffer.from(readFileSync(new URL("qrcode.js", dir)));
  const before = createHash("sha256").update(bytes).digest("hex");
  bytes[100] ^= 1;
  assert.notEqual(createHash("sha256").update(bytes).digest("hex"), before);
});
