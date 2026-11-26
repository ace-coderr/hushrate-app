// A timestamp must name its zone exactly once. hourLabel already ends with " UTC"; a page that adds "UTC" after it renders "UTC UTC".
// Run: npm test -w web
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasDoubledZone, hourLabel } from "./time.js";
import { FrontierIntro } from "../components/FrontierIntro.js";
import { BillingCell } from "../components/BillingCell.js";

const text = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("hourLabel ends with the zone exactly once", () => {
  assert.equal(hourLabel("2026-11-22T16:00:00Z"), "22 Nov, 16:00 UTC");
  assert.equal(hourLabel("2026-11-22T16:17:22.210Z"), "22 Nov, 16:17 UTC");
  assert.ok(!hasDoubledZone(hourLabel("2026-11-22T16:00:00Z")));
});

test("the doubled-zone detector catches UTC UTC, GMT GMT, Z Z and a comma between them, and ignores a single zone", () => {
  for (const bad of ["16:00 UTC UTC", "16:00 UTC, UTC interval", "16:00 GMT GMT", "16:00 Z Z", "at 22 Nov, 16:00 UTC UTC interval"]) assert.ok(hasDoubledZone(bad), bad);
  for (const good of ["16:00 UTC", "16:00 UTC interval", "UTC and then 16:00 Z", "recorded 16:17 UTC, block 977,071"]) assert.ok(!hasDoubledZone(good), good);
});

test("the Frontier check intro renders each time with one UTC", () => {
  const t = text(createElement(FrontierIntro, { assistant: "a frontier chat assistant", intervalStart: "2026-11-22T16:00:00Z", recordedAt: "2026-11-22T16:17:22.210Z", blockHeight: 977071 }));
  assert.ok(t.includes("16:00 UTC interval"), t);
  assert.ok(t.includes("recorded 22 Nov, 16:17 UTC, block 977,071"), t);
  assert.ok(!hasDoubledZone(t), t);
});

test("the Receipts billing cell renders its time with one UTC, verified or pending", () => {
  const row = { rail: "escrow", billing_checked_at: "2026-11-22T18:17:08Z", billing_status: "pending" } as Parameters<typeof BillingCell>[0]["r"];
  for (const billing_verified of [true, null, false] as const) {
    const t = text(createElement(BillingCell, { r: { ...row, billing_verified } }));
    assert.ok(!hasDoubledZone(t), t);
  }
  assert.ok(text(createElement(BillingCell, { r: { ...row, billing_verified: true } })).includes("22 Nov, 18:17 UTC"));
  assert.ok(text(createElement(BillingCell, { r: { ...row, billing_verified: null } })).includes("checked 22 Nov, 18:17 UTC, epoch block"));
});

/** Every file under a directory, skipping build output and data. */
function files(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", "data"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, exts, out); else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

test("no page source writes a zone after hourLabel, and no source or doc text contains a doubled zone", () => {
  const root = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const decode = (p: string) => decodeURIComponent(p);
  const base = decode(root);
  for (const f of files(join(base, "web/src"), [".tsx", ".ts"])) {
    if (f.endsWith(".test.ts")) continue;
    const src = readFileSync(f, "utf8");
    assert.ok(!/hourLabel\([^)]*\)[^\n]{0,12}\b(UTC|GMT)\b/.test(src), `${f}: a zone is written right after hourLabel(), which already ends with UTC`);
    assert.ok(!hasDoubledZone(src), `${f}: doubled zone suffix`);
  }
  for (const f of [...files(join(base, "docs"), [".md"]), join(base, "README.md")]) assert.ok(!hasDoubledZone(readFileSync(f, "utf8")), `${f}: doubled zone suffix`);
});
