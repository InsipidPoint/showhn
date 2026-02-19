/**
 * Re-encode full screenshots to actual WebP and regenerate thumbnails.
 * Many existing .webp files are actually PNG data (Playwright doesn't support WebP natively).
 * This script detects them by checking the file header and converts via sharp.
 *
 * Run: npx tsx scripts/backfill-thumbnails.ts
 */
import path from "path";
import fs from "fs";
import sharp from "sharp";

const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");
const THUMB_WIDTH = 640;

// PNG files start with these magic bytes
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function isPng(filePath: string): boolean {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  return buf.equals(PNG_HEADER);
}

async function main() {
  const files = fs.readdirSync(SCREENSHOT_DIR)
    .filter(f => f.endsWith(".webp") && !f.includes("_thumb") && !f.startsWith("."));

  let converted = 0;
  let alreadyWebp = 0;
  let thumbsGenerated = 0;
  let failed = 0;

  console.log(`Found ${files.length} full screenshots to check.`);

  for (const file of files) {
    const fullPath = path.join(SCREENSHOT_DIR, file);
    const thumbFile = file.replace(/\.webp$/, "_thumb.webp");
    const thumbPath = path.join(SCREENSHOT_DIR, thumbFile);

    // Step 1: Convert full screenshot if it's actually PNG
    try {
      if (isPng(fullPath)) {
        const sizeBefore = fs.statSync(fullPath).size;
        const tmpPath = fullPath + ".tmp.webp";
        await sharp(fullPath).webp({ quality: 85 }).toFile(tmpPath);
        fs.renameSync(tmpPath, fullPath);
        const sizeAfter = fs.statSync(fullPath).size;
        const savings = Math.round((1 - sizeAfter / sizeBefore) * 100);
        console.log(`  Converted: ${file} (${(sizeBefore / 1024).toFixed(0)}KB → ${(sizeAfter / 1024).toFixed(0)}KB, -${savings}%)`);
        converted++;
      } else {
        alreadyWebp++;
      }
    } catch (err) {
      console.error(`  Failed (convert): ${file} — ${(err as Error).message}`);
      failed++;
      continue;
    }

    // Step 2: Regenerate thumbnail from the (now real WebP) full image
    try {
      await sharp(fullPath)
        .resize(THUMB_WIDTH)
        .webp({ quality: 80 })
        .toFile(thumbPath);
      thumbsGenerated++;
    } catch (err) {
      console.error(`  Failed (thumb): ${file} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Converted PNG→WebP: ${converted}`);
  console.log(`  Already WebP: ${alreadyWebp}`);
  console.log(`  Thumbnails regenerated: ${thumbsGenerated}`);
  console.log(`  Failed: ${failed}`);
}

main();
