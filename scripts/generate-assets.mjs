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

// ── Generate icon.png ─────────────────────────────────────────────────────────
console.log('Generating public/icon.png…');
await sharp(Buffer.from(iconSvg))
  .resize(512, 512)
  .png()
  .toFile(join(publicDir, 'icon.png'));
console.log('✅ public/icon.png');

// ── Generate favicon.ico (32×32 PNG served as ico) ───────────────────────────
console.log('Generating public/favicon.ico…');
await sharp(Buffer.from(iconSvg))
  .resize(32, 32)
  .png()
  .toFile(join(publicDir, 'favicon.ico'));
console.log('✅ public/favicon.ico');

// ── Load icon for OG composite ────────────────────────────────────────────────
const iconForOg = await sharp(join(publicDir, 'icon.png'))
  .resize(160, 160)
  .png()
  .toBuffer();

// ── OG image SVG (1200×630) ───────────────────────────────────────────────────
const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Background -->
  <rect width="1200" height="630" fill="#0A0A0A"/>
  <!-- Subtle grid lines -->
  <line x1="0" y1="315" x2="1200" y2="315" stroke="#1a1a1a" stroke-width="1"/>
  <line x1="600" y1="0" x2="600" y2="630" stroke="#1a1a1a" stroke-width="1"/>
  <!-- Icon placeholder (160×160 centred at 600,200) -->
  <rect x="520" y="120" width="160" height="160" rx="36" fill="#0F6E56"/>

  <!-- "Make the Jump" in gold -->
  <text
    x="600" y="360"
    font-family="system-ui, -apple-system, sans-serif"
    font-size="80"
    font-weight="800"
    fill="#D4A843"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="-2"
  >Make the Jump</text>

  <!-- Tagline in white -->
  <text
    x="600" y="440"
    font-family="system-ui, -apple-system, sans-serif"
    font-size="32"
    font-weight="400"
    fill="#CCCCCC"
    text-anchor="middle"
    dominant-baseline="middle"
  >Craft resumes that take you there.</text>

  <!-- "Portkey" brand small -->
  <text
    x="600" y="570"
    font-family="system-ui, -apple-system, sans-serif"
    font-size="22"
    font-weight="600"
    fill="#0F6E56"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="4"
  >PORTKEY</text>
</svg>
`.trim();

console.log('Generating public/og-image.png…');
await sharp(Buffer.from(ogSvg))
  .composite([
    {
      input: iconForOg,
      top: 120,
      left: 520,
    },
  ])
  .png()
  .toFile(join(publicDir, 'og-image.png'));
console.log('✅ public/og-image.png (1200×630)');
console.log('\nAll assets generated. Commit public/ to deploy.');
