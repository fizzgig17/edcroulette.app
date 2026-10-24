// Shared by make-sample-images.mjs and make-demo-photo.mjs: draws one piece of gear as an SVG illustration.
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (c, t) => toHex(hex(c).map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t))));
const lum = (c) => { const [r, g, b] = hex(c); return (r * 299 + g * 587 + b * 114) / 1000; };

function shape(category, it) {
  // Returns { body: svg shapes (clip + fill), after: details }. Side view, centered in 320x320.
  switch (category) {
    case 'Knife':
      return {
        body: `<rect x="48" y="138" width="124" height="44" rx="20"/>`,
        blade: `<path d="M168 142 C205 128 250 140 282 168 C250 172 205 176 168 178 Z" fill="url(#steel)"/><path d="M182 160 L274 168" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>`,
        after: `<circle cx="168" cy="160" r="7" fill="url(#steel)" stroke="#0004"/><rect x="58" y="132" width="70" height="7" rx="3.5" fill="url(#steel)"/><circle cx="62" cy="160" r="5" fill="#0006"/>`,
        behind: true,
      };
    case 'Flashlight':
      return {
        body: `<rect x="44" y="136" width="170" height="48" rx="10"/><path d="M214 126 H262 L276 118 V202 L262 194 H214 Z"/>`,
        after: `<rect x="276" y="122" width="10" height="76" rx="4" fill="url(#steel)"/><ellipse cx="286" cy="160" rx="5" ry="30" fill="url(#lens)"/>
          ${[70, 82, 94, 106, 118].map((x) => `<line x1="${x}" y1="140" x2="${x}" y2="180" stroke="#0003" stroke-width="2"/>`).join('')}
          <rect x="150" y="124" width="60" height="9" rx="4.5" fill="url(#steel)"/><circle cx="52" cy="160" r="6" fill="#0005"/>`,
      };
    case 'Pen':
      return {
        body: `<path d="M44 148 H214 L270 156 L286 160 L270 164 L214 172 H44 Z" /><rect x="40" y="148" width="14" height="24" rx="6"/>`,
        after: `<path d="M196 148 V138 H250 V143 H206 V148 Z" fill="url(#steel)"/><path d="M270 156 L292 160 L270 164 Z" fill="url(#steel)"/><rect x="214" y="146" width="6" height="28" fill="#0004"/>`,
      };
    case 'Multi-tool':
      return {
        body: `<rect x="44" y="120" width="150" height="34" rx="14"/><rect x="44" y="166" width="150" height="34" rx="14"/>`,
        after: `<path d="M190 124 C220 126 250 140 272 154 L272 166 C250 180 220 194 190 196 Z" fill="url(#steel)" stroke="#0004"/><line x1="190" y1="160" x2="272" y2="160" stroke="#0006" stroke-width="3"/><circle cx="196" cy="160" r="8" fill="url(#steel)" stroke="#0005"/>`,
      };
    case 'Watch':
      return {
        body: `<circle cx="160" cy="160" r="72"/><rect x="132" y="22" width="56" height="70" rx="12"/><rect x="132" y="228" width="56" height="70" rx="12"/>`,
        after: `<circle cx="160" cy="160" r="58" fill="#111418"/><circle cx="160" cy="160" r="58" fill="url(#glass)"/>
          ${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `<line x1="${160 + Math.sin(a) * 48}" y1="${160 - Math.cos(a) * 48}" x2="${160 + Math.sin(a) * 54}" y2="${160 - Math.cos(a) * 54}" stroke="#EEF0F3" stroke-width="${i % 3 ? 2 : 4}"/>`; }).join('')}
          <line x1="160" y1="160" x2="160" y2="120" stroke="#EEF0F3" stroke-width="5" stroke-linecap="round"/><line x1="160" y1="160" x2="188" y2="172" stroke="#EEF0F3" stroke-width="4" stroke-linecap="round"/><circle cx="160" cy="160" r="4" fill="#E8A33D"/>
          <rect x="230" y="150" width="14" height="20" rx="4" fill="url(#steel)"/>`,
      };
    case 'Wallet':
      return {
        body: `<rect x="50" y="96" width="220" height="140" rx="16"/>`,
        behind: `<g><rect x="70" y="80" width="170" height="40" rx="6" fill="#EEF0F3"/><rect x="88" y="70" width="170" height="40" rx="6" fill="#C9CED6"/></g>`,
        after: `<rect x="50" y="96" width="220" height="140" rx="16" fill="none" stroke="#0003"/><rect x="60" y="106" width="200" height="120" rx="10" fill="none" stroke="#fff" stroke-opacity=".25" stroke-dasharray="6 5"/><rect x="226" y="96" width="14" height="140" fill="#0003"/>`,
      };
    case 'Keychain':
      return {
        body: `<rect x="96" y="150" width="128" height="40" rx="12"/>`,
        behind: `<circle cx="160" cy="96" r="44" fill="none" stroke="url(#steel)" stroke-width="9"/>`,
        after: `<circle cx="124" cy="170" r="7" fill="#0006"/><rect x="150" y="190" width="20" height="62" rx="8" fill="url(#steel)"/><path d="M150 252 h20 v10 h-10 v6 h10 v8 h-20 Z" fill="url(#steel)"/><circle cx="160" cy="146" r="8" fill="url(#steel)"/>`,
      };
    default: // Pry bar
      return {
        body: `<path d="M46 150 H228 C246 150 262 146 284 138 L296 142 V178 L284 182 C262 174 246 170 228 170 H46 Z"/>`,
        after: `<path d="M284 146 L296 148 V172 L284 174 Z" fill="#fff" fill-opacity=".3"/><circle cx="76" cy="160" r="9" fill="#0007"/><circle cx="118" cy="160" r="9" fill="#0007"/><rect x="150" y="140" width="40" height="8" rx="4" fill="#0004"/>`,
      };
  }
}

function texture(it, id) {
  const f = it.finish ?? 'Raw';
  const m = it.material ?? '';
  let t = '';
  if (m === 'Carbon fiber') t += `<rect width="320" height="320" fill="url(#weave)" opacity=".55"/>`;
  if (m === 'Wood') t += `<g stroke="#000" stroke-opacity=".22" fill="none">${Array.from({ length: 18 }, (_, i) => `<path d="M0 ${40 + i * 14} C100 ${30 + i * 14 + (i % 3) * 6} 200 ${60 + i * 14} 320 ${44 + i * 14}"/>`).join('')}</g>`;
  if (m === 'G10' || m === 'Micarta') t += `<g stroke="#fff" stroke-opacity=".08" stroke-width="3">${Array.from({ length: 22 }, (_, i) => `<line x1="0" y1="${i * 15}" x2="320" y2="${i * 15 + 20}"/>`).join('')}</g>`;
  if (m === 'Damascus') t += `<rect width="320" height="320" filter="url(#damask)" opacity=".5"/>`;
  if (f === 'Stonewashed') t += `<rect width="320" height="320" filter="url(#grain1)" opacity=".5"/>`;
  if (f === 'Blasted') t += `<rect width="320" height="320" filter="url(#grain2)" opacity=".55"/>`;
  if (f === 'Raw') t += `<rect width="320" height="320" filter="url(#grain2)" opacity=".3"/>`;
  if (f === 'Satin') t += `<g stroke="#fff" stroke-opacity=".14">${Array.from({ length: 80 }, (_, i) => `<line x1="0" y1="${i * 4}" x2="320" y2="${i * 4}"/>`).join('')}</g>`;
  if (f === 'Patina' && ['Copper', 'Brass'].includes(m)) t += `<rect width="320" height="320" filter="url(#patina)" opacity=".55"/>`;
  return t;
}

export function svg(it) {
  const s = shape(it.category, it);
  const base = it.color;
  const dark = lum(base) < 70;
  const shine = it.finish === 'Polished' ? 0.75 : it.finish === 'Anodized' ? 0.4 : it.finish === 'Coated' ? 0.15 : 0.28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
<defs>
 <radialGradient id="bg" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#3A414B"/><stop offset="1" stop-color="#14171B"/></radialGradient>
 <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(base, dark ? 0.5 : 0.35)}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${mix(base, -0.45)}"/></linearGradient>
 <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2F4F7"/><stop offset=".5" stop-color="#A9B0B9"/><stop offset="1" stop-color="#5E6670"/></linearGradient>
 <radialGradient id="lens" cx=".3" cy=".5"><stop offset="0" stop-color="#FFF6D6"/><stop offset="1" stop-color="#E8A33D"/></radialGradient>
 <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff" stop-opacity="${shine}"/><stop offset=".34" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
 <pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#000" fill-opacity=".35"/><rect width="6" height="6" fill="#fff" fill-opacity=".14"/><rect x="6" y="6" width="6" height="6" fill="#fff" fill-opacity=".14"/></pattern>
 <filter id="grain1"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.1 -.35"/></filter>
 <filter id="grain2"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="8"/><feColorMatrix values="0 0 0 0 .6  0 0 0 0 .6  0 0 0 0 .6  0 0 0 1.4 -.55"/></filter>
 <filter id="damask"><feTurbulence type="turbulence" baseFrequency=".02 .08" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -.45"/></filter>
 <filter id="patina"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="11"/><feColorMatrix values="0 0 0 0 .18  0 0 0 0 .5  0 0 0 0 .42  0 0 0 2 -.7"/></filter>
 <filter id="drop" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
 <clipPath id="clip">${s.body}</clipPath>
</defs>
<rect width="320" height="320" fill="url(#bg)"/>
<g transform="rotate(-24 160 160) translate(0 6)">
 <g filter="url(#drop)" opacity=".55" transform="translate(6 18)" fill="#000">${s.body}</g>
 ${s.behind && typeof s.behind === 'string' ? s.behind : ''}
 ${s.blade ?? ''}
 <g fill="url(#body)">${s.body}</g>
 <g clip-path="url(#clip)">${texture(it)}<rect width="320" height="320" fill="url(#spec)"/></g>
 <g fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.5">${s.body}</g>
 ${s.after}
</g></svg>`;
}

