// Draws the metal textures used for the Spin button and wheel trim.
// Run: node scripts/make-metals.mjs  (needs playwright). Writes assets/images/metals/*.jpg.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// ramp: stops from dark to light as [r,g,b] 0-255; turbulence feeds the ramp.
const ramp = (stops) => {
  const ch = (i) => stops.map((s) => (s[i] / 255).toFixed(3)).join(' ');
  return `<feComponentTransfer><feFuncR type="table" tableValues="${ch(0)}"/><feFuncG type="table" tableValues="${ch(1)}"/><feFuncB type="table" tableValues="${ch(2)}"/></feComponentTransfer>`;
};
const gray = `<feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"/>`;
// Contrast boost so the pattern bands read clearly.
const contrast = (k) => `<feComponentTransfer><feFuncR type="linear" slope="${k}" intercept="${(1 - k) / 2}"/><feFuncG type="linear" slope="${k}" intercept="${(1 - k) / 2}"/><feFuncB type="linear" slope="${k}" intercept="${(1 - k) / 2}"/></feComponentTransfer>`;

const S = 256;
const metals = {
  damascus: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="n" in2="n" scale="40" result="d"/>${gray}${contrast(3.2)}${ramp([[20, 22, 26], [92, 98, 106], [196, 202, 210], [236, 239, 244]])}</filter>`,
  mokume: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="9"/>${gray}${contrast(4)}${ramp([[92, 52, 30], [184, 107, 52], [205, 160, 82], [214, 214, 218], [120, 70, 40]])}</filter>`,
  timascus: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.045" numOctaves="3" seed="21"/>${gray}${contrast(3.4)}${ramp([[30, 24, 70], [78, 52, 150], [60, 120, 190], [210, 160, 80], [40, 30, 90]])}</filter>`,
  titanium: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="2" seed="2"/>${gray}${contrast(2.2)}${ramp([[88, 92, 100], [120, 126, 136], [150, 156, 166], [182, 188, 196]])}</filter>`,
  zirconium: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.035" numOctaves="3" seed="13"/>${gray}${contrast(3)}${ramp([[14, 16, 20], [34, 44, 70], [70, 60, 110], [24, 70, 90], [18, 20, 26]])}</filter>`,
  copper: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.12" numOctaves="2" seed="6"/>${gray}${contrast(2)}${ramp([[120, 62, 30], [176, 98, 52], [214, 140, 90], [236, 176, 128]])}</filter>`,
  brass: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.12" numOctaves="2" seed="7"/>${gray}${contrast(2)}${ramp([[128, 92, 28], [186, 144, 52], [226, 188, 98], [244, 220, 150]])}</filter>`,
  steel: `<filter id="f" x="-40" y="-40" width="${S + 80}" height="${S + 80}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.14" numOctaves="2" seed="8"/>${gray}${contrast(2)}${ramp([[104, 110, 118], [150, 156, 164], [196, 202, 210], [232, 236, 242]])}</filter>`,
};
mkdirSync('assets/images/metals', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: S, height: S } });
for (const [id, f] of Object.entries(metals)) {
  await p.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs>${f}</defs><rect x="-40" y="-40" width="${S + 80}" height="${S + 80}" filter="url(#f)"/></svg></body>`);
  await p.screenshot({ path: `assets/images/metals/${id}.jpg`, type: 'jpeg', quality: 88 });
}
await b.close();
console.log('drew', Object.keys(metals).length);
