/**
 * Build all icon PNG sizes from assets/icon.svg using sharp.
 *
 * Run via:  node scripts/build-icons.js
 *
 * sharp is intentionally NOT a project dependency — it's only needed when
 * rebuilding the icon set, so we resolve it via `npx -p sharp` in the
 * companion `npm run build:icons` script (see package.json) or expect the
 * developer to `npm install --no-save sharp` ahead of time. This keeps the
 * runtime install fast.
 */

const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch (err) {
  console.error(
    "[build-icons] `sharp` is not installed.\n" +
    "Install it temporarily with:  npm install --no-save sharp\n" +
    "Then re-run:                  node scripts/build-icons.js"
  );
  process.exit(1);
}

const root      = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");
const masterSvg = path.join(assetsDir, "icon.svg");
const sizes     = [16, 32, 48, 64, 80, 128, 256, 512];
// Sizes embedded in the multi-resolution .ico used by Windows shortcuts.
// Skipping 80/512 — those are taskpane/store sizes, not shell sizes.
const icoSizes  = [16, 32, 48, 64, 128, 256];

if (!fs.existsSync(masterSvg)) {
  console.error(`[build-icons] master SVG not found at ${masterSvg}`);
  process.exit(1);
}

const svgBuffer = fs.readFileSync(masterSvg);

async function main() {
  const pngBuffers = {};
  for (const size of sizes) {
    const buf = await sharp(svgBuffer, { density: 384 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    pngBuffers[size] = buf;
    const out = path.join(assetsDir, `icon-${size}.png`);
    fs.writeFileSync(out, buf);
    console.log(`  ${size.toString().padStart(3)}×${size}  →  ${path.relative(root, out)}  (${buf.length} B)`);
  }

  // Assemble a multi-resolution .ico with PNG-encoded entries (Vista+).
  // .lnk shortcuts and Explorer require .ico — PNG IconLocation silently
  // falls back to the generic document glyph.
  const icoPath = path.join(assetsDir, "pivot.ico");
  const entries = icoSizes.map((s) => ({ size: s, png: pngBuffers[s] }));
  const headerSize = 6 + entries.length * 16;
  let offset = headerSize;
  const dirEntries = entries.map((e) => {
    const entry = { ...e, offset };
    offset += e.png.length;
    return entry;
  });
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);             // reserved
  header.writeUInt16LE(1, 2);             // type = 1 (icon)
  header.writeUInt16LE(entries.length, 4);
  dirEntries.forEach((e, i) => {
    const o = 6 + i * 16;
    header.writeUInt8(e.size >= 256 ? 0 : e.size, o + 0);   // width  (0 == 256)
    header.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);   // height
    header.writeUInt8(0, o + 2);          // color count
    header.writeUInt8(0, o + 3);          // reserved
    header.writeUInt16LE(1, o + 4);       // color planes
    header.writeUInt16LE(32, o + 6);      // bits per pixel
    header.writeUInt32LE(e.png.length, o + 8);
    header.writeUInt32LE(e.offset, o + 12);
  });
  const ico = Buffer.concat([header, ...dirEntries.map((e) => e.png)]);
  fs.writeFileSync(icoPath, ico);
  console.log(`  .ico    →  ${path.relative(root, icoPath)}  (${ico.length} B, ${entries.length} sizes)`);
}

main().catch((err) => {
  console.error("[build-icons] failed:", err);
  process.exit(1);
});
