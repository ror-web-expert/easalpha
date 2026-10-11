import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initSettings, loadSettings, saveSettings } from "./settings";

test("settings default, save and reload with printer sanitising", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-settings-"));
  initSettings(dir);
  const d = loadSettings();
  assert.equal(d.webUrl, "https://easalpha.com");
  assert.equal(d.printServerPort, 9977);
  assert.deepEqual(d.printers, []);

  saveSettings({
    webUrl: "https://pos.example.pk/",
    printServerPort: 9000,
    printers: [
      { id: "a", name: " Counter ", kind: "network", host: "192.168.1.9", port: 0, width: 58, role: "receipt" },
      { id: "b", name: "", kind: "usb", width: 80 as 80, vendorId: 1208, productId: 514 },
      { id: "c", name: "Office", kind: "system", width: 99 as unknown as 80, role: "bogus" as unknown as "kitchen", systemName: "HP" },
    ],
  });
  const s = loadSettings();
  assert.equal(s.webUrl, "https://pos.example.pk"); // trailing slash removed
  assert.equal(s.printServerPort, 9000);
  assert.equal(s.printers.length, 3);
  assert.equal(s.printers[0].name, "Counter");
  assert.equal(s.printers[0].port, 9100); // invalid port falls back to 9100
  assert.equal(s.printers[1].name, "Printer");
  assert.equal(s.printers[1].vendorId, 1208);
  assert.equal(s.printers[2].width, 80); // unknown width -> 80
  assert.equal(s.printers[2].role, undefined); // unknown role dropped
  assert.equal(s.printers[2].systemName, "HP");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("updateUrl is kept only when it is an http(s) address", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-settings-"));
  initSettings(dir);
  saveSettings({ updateUrl: "https://example.pk/desktop/" });
  assert.equal(loadSettings().updateUrl, "https://example.pk/desktop");
  saveSettings({ updateUrl: "not a url" });
  assert.equal(loadSettings().updateUrl, undefined);
});
