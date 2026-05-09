/**
 * Generates public/icon.png (512x512) and public/og-image.png (1200x630).
 * Run with: node scripts/generate-assets.mjs
 * Replace public/icon.png with your actual logo then re-run to refresh og-image.
 */

import sharp from 'sharp';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// ── Icon SVG (512×512) ────────────────────────────────────────────────────────
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0F6E56"/>
      <stop offset="100%" style="stop-color:#0A4A3A"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- Key silhouette -->
  <circle cx="196" cy="220" r="88" fill="none" stroke="#E1F5EE" stroke-width="44"/>
  <line x1="260" y1="274" x2="380" y2="340" stroke="#E1F5EE" stroke-width="44" stroke-linecap="round"/>
  <line x1="340" y1="316" x2="340" y2="360" stroke="#E1F5EE" stroke-width="36" stroke-linecap="round"/>
  <line x1="372" y1="334" x2="372" y2="378" stroke="#E1F5EE" stroke-width="36" stroke-linecap="round"/>
  <!-- P letter overlay (top-right accent) -->
</svg>
`.trim();

// ── Generate icon.png (only if not already present) ──────────────────────────
if (!existsSync(join(publicDir, 'icon.png'))) {
  console.log('Generating public/icon.png (placeholder)…');
  await sharp(Buffer.from(iconSvg))
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'icon.png'));
  console.log('✅ public/icon.png (placeholder)');
} else {
  console.log('ℹ️  public/icon.png already exists — skipping (using existing logo)');
}

// ── Generate favicon.ico (32×32 from real icon) ──────────────────────────────
console.log('Generating public/favicon.ico…');
await sharp(join(publicDir, 'icon.png'))
  .resize(32, 32)
  .png()
  .toFile(join(publicDir, 'favicon.ico'));
console.log('✅ public/favicon.ico');

// ── OG image — resize icon to 1200×630 ───────────────────────────────────────
console.log('Generating public/og-image.png…');
await sharp(join(publicDir, 'icon.png'))
  .resize(1200, 630, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toFile(join(publicDir, 'og-image.png'));
console.log('✅ public/og-image.png (1200×630)');
console.log('\nAll assets generated. Commit public/ to deploy.');
