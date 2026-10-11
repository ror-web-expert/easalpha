#!/usr/bin/env node
// Writes <folder>/manifest.json for the website's Download page: the desktop version and which installer files exist.
// Usage: node scripts/downloads-manifest.mjs <downloads folder> <easalpha-desktop/package.json>
import fs from "node:fs";
import path from "node:path";
const [folder, pkgPath] = process.argv.slice(2);
if (!folder || !pkgPath) { console.error("usage: downloads-manifest.mjs <folder> <package.json>"); process.exit(2); }
const version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
// only this version's files: an older build left in the folder must not be offered
const files = fs.readdirSync(folder).filter((f) => /\.(exe|AppImage|deb|dmg|zip)$/i.test(f) && f.includes(version)).sort();
const os = (f) => (/\.exe$/i.test(f) ? "windows" : /\.(AppImage|deb)$/i.test(f) ? "linux" : "mac");
const manifest = { version, built_at: new Date().toISOString(), files: files.map((f) => ({ file: f, os: os(f), bytes: fs.statSync(path.join(folder, f)).size })) };
fs.writeFileSync(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json: version ${version}, ${files.length} file(s): ${files.join(", ") || "none"}`);
