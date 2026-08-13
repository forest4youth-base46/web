// ============================================================
// POCKETBOOK — embedded data + app (prefixed)
// ============================================================

// Pocketbook data: activities, groups, adaptations
// Each activity has clean iconographic SVG glyph + visual

// `intensity` (0–1) is a rough, group-level "demand" score for the session
// plan export's "session shape" chart — every activity in a group shares its
// group's value, matching the arc's existing narrative (low on arrival,
// rising through the cooperative middle, low again on the way back). It's a
// starting point for that chart, not a clinical measure — flagged for
// practitioner sign-off before the export ships, since it's a judgment call
// this data model never needed to make explicit before.
const GROUPS = [
  { id: 1, num: 'i',   title: 'Getting There',              meta: 'Lower demand → settle',  intensity: 0.2 },
  { id: 2, num: 'ii',  title: 'Waking Up Your Senses',      meta: 'Ground attention',        intensity: 0.5 },
  { id: 3, num: 'iii', title: 'Discovering Yourself',       meta: 'Cooperative tasks',       intensity: 0.9 },
  { id: 4, num: 'iv',  title: 'Connecting with Others',     meta: 'Distribute agency',       intensity: 0.65 },
  { id: 5, num: 'v',   title: 'Coming Back to Yourself',    meta: 'Carry it forward',        intensity: 0.25 },
];

// Reusable SVG glyphs (tiny, monoline, no filler) -------------------------
const GLYPH = {
  ear: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 22c0 3 2 5 5 5s5-2 5-5"/><path d="M10 14a6 6 0 0 1 12 0c0 3-2 4-3 5s-1 3-2 4"/><path d="M14 14a2 2 0 0 1 4 0"/></svg>`,
  leaf: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26C6 14 14 6 26 6c0 12-8 20-20 20Z"/><path d="M6 26 18 14"/></svg>`,
  hammock: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6v20M27 6v20"/><path d="M5 14c4 6 18 6 22 0"/><path d="M11 16h10"/></svg>`,
  foot: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 24c0-4 1-7 3-9 2-3 1-7 4-7 2 0 3 2 3 5 0 3-1 5-1 7s2 3 2 5-2 4-5 4-6-2-6-5Z"/><circle cx="9" cy="9" r="1"/><circle cx="13" cy="6" r="1"/><circle cx="17" cy="6" r="1"/></svg>`,
  swatch: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="9" height="9" rx="1"/><rect x="17" y="6" width="9" height="9" rx="1"/><rect x="6" y="17" width="9" height="9" rx="1"/><rect x="17" y="17" width="9" height="9" rx="1"/></svg>`,
  hand: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="2"/><path d="M16 6v4M16 22v4M6 16h4M22 16h4M9 9l2.5 2.5M20.5 20.5 23 23M9 23l2.5-2.5M20.5 11.5 23 9"/></svg>`,
  log: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="16" cy="11" rx="10" ry="3"/><path d="M6 11v10c0 1.7 4.5 3 10 3s10-1.3 10-3V11"/><path d="M16 14v10"/></svg>`,
  flame: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 0Z"/><path d="M14 22a2 2 0 0 0 4 0"/></svg>`,
  shelter: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26 16 6l10 20"/><path d="M11 26 16 16l5 10"/></svg>`,
  spot: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="3"/><circle cx="16" cy="16" r="7" opacity="0.5"/><circle cx="16" cy="16" r="11" opacity="0.25"/></svg>`,
  roles: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="11" r="3"/><circle cx="23" cy="11" r="3"/><circle cx="16" cy="22" r="3"/><path d="M9 14v3M23 14v3M16 19v-3"/></svg>`,
  seedling: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 26v-8"/><path d="M16 18c-4 0-7-2-7-7 4 0 7 2 7 7Z"/><path d="M16 18c4 0 7-3 7-8-4 0-7 3-7 8Z"/><path d="M8 26h16"/></svg>`,
  pebble: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18c0-5 4-10 10-10s10 4 10 9-4 7-10 7-10-1-10-6Z"/><path d="M11 16c1-2 3-4 5-4"/></svg>`,
  check: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="20" height="20" rx="2"/><path d="M11 16l3 3 7-7"/></svg>`,
  ember: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6c2 5 6 6 6 11a6 6 0 0 1-12 0c0-2 1-3 2-4 1 2 2 2 3 0 1-2 1-4 1-7Z"/><path d="M6 26h20"/></svg>`,
  letter: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 24V8l5 8 5-8v16"/><path d="M21 8h4M23 8v16M21 24h4"/></svg>`,
  tinyworld: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="20" r="8"/><path d="M8 20h16"/><path d="M11 14l2-3 2 2 3-4 2 3"/></svg>`,
};

// Visual SVGs (in-detail, larger illustrations) ---------------------------
const VISUAL = {
  introduce: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- ground / clearing -->
    <ellipse cx="240" cy="125" rx="180" ry="32" fill="#D9D2C2" opacity="0.6"/>
    <!-- two trees on flanks -->
    <g opacity="0.55">
      <rect x="56" y="60" width="6" height="80" fill="#6B5240"/>
      <ellipse cx="59" cy="56" rx="22" ry="14" fill="#3A6B5A"/>
      <rect x="418" y="60" width="6" height="80" fill="#6B5240"/>
      <ellipse cx="421" cy="56" rx="22" ry="14" fill="#3A6B5A"/>
    </g>
    <!-- person walks in, then crouches -->
    <g>
      <g opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.2s" fill="freeze"/>
        ${figureSVG({ x: 120, y: 130, h: 10, pose: 'crouch', facing: 1 })}
      </g>
    </g>
    <!-- letter R appears stick by stick -->
    <g stroke="#6B5240" stroke-width="3" stroke-linecap="round">
      <line x1="180" y1="135" x2="180" y2="100" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="0.9s" fill="freeze"/></line>
      <line x1="180" y1="100" x2="200" y2="100" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.1s" fill="freeze"/></line>
      <line x1="200" y1="100" x2="200" y2="115" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.3s" fill="freeze"/></line>
      <line x1="200" y1="115" x2="180" y2="115" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.5s" fill="freeze"/></line>
      <line x1="190" y1="115" x2="205" y2="135" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.7s" fill="freeze"/></line>
    </g>
    <!-- pebbles for letter O -->
    <g fill="#7C8E85">
      <circle cx="240" cy="100" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.0s" fill="freeze"/></circle>
      <circle cx="252" cy="103" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.15s" fill="freeze"/></circle>
      <circle cx="260" cy="115" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.3s" fill="freeze"/></circle>
      <circle cx="252" cy="127" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.45s" fill="freeze"/></circle>
      <circle cx="240" cy="130" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.6s" fill="freeze"/></circle>
      <circle cx="228" cy="127" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.75s" fill="freeze"/></circle>
      <circle cx="220" cy="115" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.9s" fill="freeze"/></circle>
      <circle cx="228" cy="103" r="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="3.05s" fill="freeze"/></circle>
    </g>
    <!-- leaves for letter S -->
    <g fill="#3A6B5A">
      <ellipse cx="290" cy="103" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="3.3s" fill="freeze"/></ellipse>
      <ellipse cx="300" cy="100" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="3.45s" fill="freeze"/></ellipse>
      <ellipse cx="310" cy="103" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="3.6s" fill="freeze"/></ellipse>
      <ellipse cx="305" cy="115" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="3.75s" fill="freeze"/></ellipse>
      <ellipse cx="295" cy="118" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="3.9s" fill="freeze"/></ellipse>
      <ellipse cx="290" cy="127" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="4.05s" fill="freeze"/></ellipse>
      <ellipse cx="300" cy="130" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="4.2s" fill="freeze"/></ellipse>
      <ellipse cx="310" cy="127" rx="5" ry="3" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="4.35s" fill="freeze"/></ellipse>
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">a name in sticks, leaves, stones</text>
  </svg>`,

  tinyworld: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- ground patch -->
    <ellipse cx="240" cy="135" rx="170" ry="28" fill="#A89274" opacity="0.35"/>
    <ellipse cx="240" cy="135" rx="170" ry="28" fill="none" stroke="#6B5240" stroke-width="0.5" stroke-dasharray="2 3"/>
    <!-- elements appear one by one -->
    <!-- pond -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <ellipse cx="150" cy="130" rx="22" ry="8" fill="#7FA396" opacity="0.8"/>
      <ellipse cx="150" cy="128" rx="14" ry="4" fill="#FBF9F4" opacity="0.4"/>
    </g>
    <!-- twig bridge -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.9s" fill="freeze"/>
      <line x1="170" y1="128" x2="195" y2="120" stroke="#6B5240" stroke-width="2"/>
      <line x1="172" y1="130" x2="197" y2="122" stroke="#6B5240" stroke-width="2"/>
    </g>
    <!-- moss hill -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.4s" fill="freeze"/>
      <ellipse cx="220" cy="120" rx="20" ry="11" fill="#3A6B5A"/>
      <circle cx="215" cy="116" r="2" fill="#7FA396"/>
      <circle cx="225" cy="114" r="2" fill="#7FA396"/>
    </g>
    <!-- mini tree -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.9s" fill="freeze"/>
      <rect x="259" y="110" width="3" height="20" fill="#6B5240"/>
      <ellipse cx="260" cy="108" rx="10" ry="7" fill="#3A6B5A"/>
    </g>
    <!-- stone path -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.4s" fill="freeze"/>
      <ellipse cx="290" cy="135" rx="4" ry="2" fill="#7C8E85"/>
      <ellipse cx="300" cy="138" rx="4" ry="2" fill="#7C8E85"/>
      <ellipse cx="312" cy="135" rx="4" ry="2" fill="#7C8E85"/>
      <ellipse cx="322" cy="138" rx="4" ry="2" fill="#7C8E85"/>
    </g>
    <!-- bark hut -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.9s" fill="freeze"/>
      <path d="M340 130 L355 110 L370 130 Z" fill="#6B5240"/>
      <rect x="350" y="120" width="10" height="10" fill="#3A2F22"/>
    </g>
    <!-- leaf garden -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="3.4s" fill="freeze"/>
      <ellipse cx="395" cy="125" rx="5" ry="3" fill="#3A6B5A"/>
      <ellipse cx="403" cy="128" rx="5" ry="3" fill="#7FA396"/>
      <ellipse cx="412" cy="125" rx="5" ry="3" fill="#3A6B5A"/>
      <ellipse cx="420" cy="128" rx="5" ry="3" fill="#7FA396"/>
    </g>
    <!-- two figures making, bent over their work -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="3.8s" fill="freeze"/>
      ${figureSVG({ x: 150, y: 140, h: 10, pose: 'bend', facing: 1 })}
      ${figureSVG({ x: 344, y: 140, h: 10, pose: 'bend', facing: -1 })}
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">an imaginary world from what's underfoot</text>
  </svg>`,

  soundscape: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- bg trees -->
    <g opacity="0.3">
      <rect x="40" y="70" width="6" height="70" fill="#6B5240"/><polygon points="43,30 28,75 58,75" fill="#3A6B5A"/>
      <rect x="420" y="60" width="6" height="80" fill="#6B5240"/><polygon points="423,20 408,68 438,68" fill="#234A3E"/>
      <rect x="380" y="80" width="5" height="60" fill="#6B5240"/><polygon points="382,45 370,82 395,82" fill="#3A6B5A"/>
    </g>
    <!-- person seated on the ground, eyes closed, listening -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.1s" fill="freeze"/>
      ${figureSVG({ x: 240, y: 148, h: 11, pose: 'ground', facing: 1 })}
    </g>
    <!-- expanding awareness rings -->
    <circle cx="240" cy="100" r="40" fill="none" stroke="#7FA396" stroke-width="0.7" opacity="0">
      <animate attributeName="r" from="20" to="80" dur="3.5s" begin="1.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.45;0" dur="3.5s" begin="1.2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="240" cy="100" r="60" fill="none" stroke="#7FA396" stroke-width="0.7" opacity="0">
      <animate attributeName="r" from="20" to="120" dur="3.5s" begin="2.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.3;0" dur="3.5s" begin="2.4s" repeatCount="indefinite"/>
    </circle>
    <!-- sound sources w/ labels appearing one by one -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.8s" fill="freeze"/>
      <circle cx="100" cy="55" r="3" fill="#234A3E"/>
      <line x1="100" y1="58" x2="100" y2="68" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="100" y="80" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">birdsong</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.4s" fill="freeze"/>
      <circle cx="375" cy="48" r="3" fill="#234A3E"/>
      <line x1="375" y1="51" x2="375" y2="61" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="375" y="73" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">wind</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.0s" fill="freeze"/>
      <circle cx="80" cy="140" r="3" fill="#234A3E"/>
      <line x1="80" y1="138" x2="80" y2="128" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="80" y="124" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">stream</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.6s" fill="freeze"/>
      <circle cx="400" cy="140" r="3" fill="#234A3E"/>
      <line x1="400" y1="138" x2="400" y2="128" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="400" y="124" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">distant voices</text>
    </g>
  </svg>`,

  naming: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <line x1="40" y1="155" x2="450" y2="155" stroke="#6B5240" stroke-width="0.5" opacity="0.4"/>
    <!-- guide walking, one arm extended to name what is there -->
    ${figureSVG({ x: 70, y: 155, h: 11, pose: 'reach', facing: 1 })}
    <!-- tree 1: oak (revealed first) -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.4s" fill="freeze"/>
      <ellipse cx="170" cy="78" rx="22" ry="16" fill="#3A6B5A" opacity="0.65"/>
      <rect x="167" y="92" width="6" height="55" fill="#6B5240"/>
      <line x1="170" y1="120" x2="195" y2="120" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="200" y="118" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">Oak</text>
      <text x="200" y="130" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">Quercus robur</text>
    </g>
    <!-- tree 2: birch -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.2s" fill="freeze"/>
      <path d="M280 80 Q270 62 280 50 Q290 62 280 80" fill="#3A6B5A" opacity="0.7"/>
      <path d="M290 84 Q282 66 292 58 Q300 68 290 84" fill="#7FA396" opacity="0.6"/>
      <rect x="282" y="80" width="4" height="65" fill="#FBF9F4" stroke="#14302A" stroke-width="0.5"/>
      <g stroke="#14302A" stroke-width="0.4" opacity="0.6"><line x1="282" y1="95" x2="286" y2="95"/><line x1="282" y1="110" x2="286" y2="110"/><line x1="282" y1="125" x2="286" y2="125"/></g>
      <line x1="290" y1="120" x2="315" y2="120" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="320" y="118" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">Birch</text>
      <text x="320" y="130" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">Betula pendula</text>
    </g>
    <!-- tree 3: pine -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.0s" fill="freeze"/>
      <polygon points="395,46 378,75 412,75" fill="#234A3E"/>
      <polygon points="395,62 380,90 410,90" fill="#234A3E"/>
      <polygon points="395,78 378,108 412,108" fill="#234A3E"/>
      <rect x="392" y="105" width="6" height="42" fill="#6B5240"/>
      <line x1="395" y1="135" x2="425" y2="135" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="430" y="133" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">Pine</text>
      <text x="430" y="145" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">P. sylvestris</text>
    </g>
  </svg>`,

  hammock: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- two trees -->
    <ellipse cx="80" cy="22" rx="34" ry="20" fill="#3A6B5A" opacity="0.55"><animate attributeName="opacity" from="0" to="0.55" dur="0.5s" begin="0s" fill="freeze"/></ellipse>
    <ellipse cx="400" cy="22" rx="34" ry="20" fill="#3A6B5A" opacity="0.55"><animate attributeName="opacity" from="0" to="0.55" dur="0.5s" begin="0s" fill="freeze"/></ellipse>
    <rect x="73" y="20" width="14" height="145" fill="#6B5240" rx="2"/>
    <rect x="393" y="20" width="14" height="145" fill="#6B5240" rx="2"/>
    <!-- ropes -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.6s" fill="freeze"/>
      <line x1="87" y1="60" x2="115" y2="85" stroke="#6B5240" stroke-width="1"/>
      <line x1="393" y1="60" x2="365" y2="85" stroke="#6B5240" stroke-width="1"/>
    </g>
    <!-- hammock fabric (sags into view) -->
    <path d="M115 85 Q240 105 365 85" fill="none" stroke="#234A3E" stroke-width="1.2" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.6s" begin="1.0s" fill="freeze"/></path>
    <path d="M115 85 Q240 145 365 85 L365 85 Q240 130 115 85 Z" fill="#7FA396" opacity="0"><animate attributeName="opacity" from="0" to="0.5" dur="0.6s" begin="1.0s" fill="freeze"/></path>
    <g stroke="#234A3E" stroke-width="0.4" opacity="0"><animate attributeName="opacity" from="0" to="0.5" dur="0.6s" begin="1.0s" fill="freeze"/>
      <path d="M115 85 Q240 132 365 85"/><path d="M115 85 Q240 138 365 85"/>
    </g>
    <!-- person resting, lying back in the fabric -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.6s" begin="1.7s" fill="freeze"/>
      ${figureSVG({ x: 252, y: 104, h: 11, pose: 'recline', facing: -1, shadow: false })}
    </g>
    <!-- gentle sway -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="0.6" dur="0.6s" begin="2.4s" fill="freeze"/>
      <path d="M180 78 Q240 82 300 78" fill="none" stroke="#7FA396" stroke-width="0.5" stroke-dasharray="2 3">
        <animate attributeName="d" values="M180 78 Q240 82 300 78;M180 80 Q240 76 300 80;M180 78 Q240 82 300 78" dur="6s" repeatCount="indefinite"/>
      </path>
    </g>
    <text x="240" y="160" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#7C8E85">settle in. nothing else required.</text>
  </svg>`,

  barefoot: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <!-- footprint trail above (animated) -->
    <g fill="#14302A">
      <ellipse cx="60" cy="32" rx="3" ry="5" opacity="0"><animate attributeName="opacity" from="0" to="0.55" dur="0.3s" begin="0.2s" fill="freeze"/></ellipse>
      <ellipse cx="144" cy="36" rx="3" ry="5" opacity="0"><animate attributeName="opacity" from="0" to="0.55" dur="0.3s" begin="0.7s" fill="freeze"/></ellipse>
      <ellipse cx="228" cy="32" rx="3" ry="5" opacity="0"><animate attributeName="opacity" from="0" to="0.55" dur="0.3s" begin="1.2s" fill="freeze"/></ellipse>
      <ellipse cx="312" cy="36" rx="3" ry="5" opacity="0"><animate attributeName="opacity" from="0" to="0.55" dur="0.3s" begin="1.7s" fill="freeze"/></ellipse>
      <ellipse cx="396" cy="32" rx="3" ry="5" opacity="0"><animate attributeName="opacity" from="0" to="0.55" dur="0.3s" begin="2.2s" fill="freeze"/></ellipse>
    </g>
    <!-- 5 texture tiles -->
    <g><rect x="22" y="52" width="76" height="72" rx="3" fill="#7FA396" opacity="0.6"/>
      <g stroke="#234A3E" stroke-width="0.5" opacity="0.5"><line x1="30" y1="118" x2="32" y2="60"/><line x1="40" y1="118" x2="42" y2="64"/><line x1="50" y1="118" x2="52" y2="60"/><line x1="60" y1="118" x2="62" y2="66"/><line x1="70" y1="118" x2="72" y2="60"/><line x1="80" y1="118" x2="82" y2="64"/><line x1="90" y1="118" x2="92" y2="60"/></g>
      <text x="60" y="142" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">grass</text>
    </g>
    <g><rect x="106" y="52" width="76" height="72" rx="3" fill="#6B5240" opacity="0.7"/>
      <g fill="#14302A" opacity="0.4"><circle cx="120" cy="72" r="1.2"/><circle cx="138" cy="88" r="1"/><circle cx="155" cy="70" r="1.4"/><circle cx="170" cy="98" r="1.1"/><circle cx="130" cy="108" r="1.3"/><circle cx="165" cy="115" r="1"/></g>
      <text x="144" y="142" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">soil</text>
    </g>
    <g><rect x="190" y="52" width="76" height="72" rx="3" fill="#6B5240" opacity="0.5"/>
      <g stroke="#14302A" stroke-width="0.6" opacity="0.5" fill="none"><path d="M200 64 Q228 84 256 66"/><path d="M200 84 Q228 102 256 86"/><path d="M200 104 Q228 118 256 106"/></g>
      <text x="228" y="142" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">bark</text>
    </g>
    <g><rect x="274" y="52" width="76" height="72" rx="3" fill="#3A6B5A" opacity="0.7"/>
      <g fill="#14302A" opacity="0.4"><circle cx="288" cy="72" r="2"/><circle cx="305" cy="84" r="1.6"/><circle cx="322" cy="68" r="2"/><circle cx="338" cy="92" r="1.8"/><circle cx="295" cy="104" r="1.6"/><circle cx="330" cy="112" r="2"/></g>
      <text x="312" y="142" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">moss</text>
    </g>
    <g><rect x="358" y="52" width="76" height="72" rx="3" fill="#C8D8D0"/>
      <g fill="#7C8E85" opacity="0.5"><ellipse cx="372" cy="74" rx="6" ry="4"/><ellipse cx="394" cy="92" rx="9" ry="5"/><ellipse cx="412" cy="70" rx="5" ry="3"/><ellipse cx="378" cy="108" rx="7" ry="4"/></g>
      <text x="396" y="142" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">stone</text>
    </g>
    <text x="240" y="170" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85" letter-spacing="0.1em">SHOES OFF · WALK SLOWLY · NOTICE THE CHANGE</text>
  </svg>`,

  palette: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- person holding palette card -->
    ${figureSVG({ x: 110, y: 150, h: 12, pose: 'stand', facing: 1 })}
    <!-- palette card in hand -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <rect x="50" y="120" width="120" height="42" rx="3" fill="#FBF9F4" stroke="#234A3E" stroke-width="1"/>
      <rect x="58" y="128" width="20" height="26" fill="#3A6B5A"/>
      <rect x="82" y="128" width="20" height="26" fill="#7FA396"/>
      <rect x="106" y="128" width="20" height="26" fill="#6B5240"/>
      <rect x="130" y="128" width="20" height="26" fill="#B8552E" opacity="0.7"/>
    </g>
    <!-- arrow towards forest -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.0s" fill="freeze"/>
      <path d="M180 100 Q220 80 260 100" stroke="#7C8E85" stroke-width="0.8" stroke-dasharray="3 3" fill="none"/>
      <path d="M254 96 L262 100 L254 104" fill="none" stroke="#7C8E85" stroke-width="0.8"/>
    </g>
    <!-- forest side: matched things found -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.4s" fill="freeze"/>
      <path d="M290 70 Q308 56 326 72 Q308 88 290 70" fill="#3A6B5A" opacity="0.9"/>
      <line x1="328" y1="72" x2="345" y2="72" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="350" y="76" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">moss</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.8s" fill="freeze"/>
      <path d="M290 100 Q305 90 320 102 Q305 112 290 100" fill="#7FA396"/>
      <line x1="322" y1="102" x2="345" y2="102" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="350" y="106" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">lichen</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.2s" fill="freeze"/>
      <rect x="288" y="128" width="36" height="8" rx="2" fill="#6B5240"/>
      <line x1="326" y1="132" x2="345" y2="132" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="350" y="136" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">bark</text>
    </g>
    <text x="240" y="30" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">find one for each colour</text>
  </svg>`,

  senses: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- person standing still, attention inward -->
    ${figureSVG({ x: 62, y: 150, h: 12, pose: 'stand', facing: 1 })}
    <!-- countdown ladder -->
    <g font-family="Montserrat, sans-serif" font-size="26" fill="#234A3E">
      <text x="130" y="80" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.3s" fill="freeze"/>5</text>
      <text x="180" y="80" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.8s" fill="freeze"/>4</text>
      <text x="230" y="80" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.3s" fill="freeze"/>3</text>
      <text x="280" y="80" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.8s" fill="freeze"/>2</text>
      <text x="330" y="80" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="2.3s" fill="freeze"/>1</text>
    </g>
    <line x1="125" y1="100" x2="345" y2="100" stroke="#7FA396" stroke-width="0.8" stroke-dasharray="3 3"/>
    <g font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#7C8E85" text-anchor="middle">
      <text x="138" y="118" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="0.5s" fill="freeze"/>see</text>
      <text x="188" y="118" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.0s" fill="freeze"/>touch</text>
      <text x="238" y="118" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.5s" fill="freeze"/>hear</text>
      <text x="288" y="118" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.0s" fill="freeze"/>smell</text>
      <text x="338" y="118" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="2.5s" fill="freeze"/>taste</text>
    </g>
    <text x="240" y="155" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85" letter-spacing="0.1em">NAME WHAT IS HERE · IN ORDER</text>
  </svg>`,

  sofa: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- log seat builds up: stages -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <ellipse cx="240" cy="125" rx="100" ry="8" fill="#6B5240"/>
      <rect x="140" y="115" width="200" height="15" fill="#6B5240"/>
      <ellipse cx="240" cy="115" rx="100" ry="8" fill="#8B6B52"/>
      <!-- Growth rings sit on the foreshortened top of the log, so they are
           ellipses in the same 100:8 ratio as it. Drawn as true circles they
           stood 80 units proud of a seat 8 units deep and read as loose
           rings floating over the whole scene. -->
      <g stroke="#4D3324" stroke-width="0.5" opacity="0.6" fill="none"><ellipse cx="240" cy="115" rx="80" ry="6.4"/><ellipse cx="240" cy="115" rx="55" ry="4.4"/><ellipse cx="240" cy="115" rx="30" ry="2.4"/></g>
    </g>
    <!-- people gather to the seat they built, and sit -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.2s" fill="freeze"/>
      ${figureSVG({ x: 152, y: 138, h: 11, pose: 'sit', facing: 1 })}
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.6s" fill="freeze"/>
      ${figureSVG({ x: 200, y: 138, h: 11, pose: 'sit', facing: 1 })}
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.0s" fill="freeze"/>
      ${figureSVG({ x: 282, y: 138, h: 11, pose: 'sit', facing: -1 })}
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.4s" fill="freeze"/>
      ${figureSVG({ x: 330, y: 138, h: 11, pose: 'sit', facing: -1 })}
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">a place the group has built — together</text>
  </svg>`,

  fire: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- 4 stages -->
    <g transform="translate(70 100)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.2s" fill="freeze"/>
      <g stroke="#6B5240" stroke-width="1" stroke-linecap="round"><line x1="-15" y1="20" x2="15" y2="20"/><line x1="-12" y1="22" x2="12" y2="22"/><line x1="-10" y1="24" x2="10" y2="24"/></g>
      <text x="0" y="48" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">tinder</text>
      <text x="0" y="60" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">dry, fluffy</text>
    </g>
    <path d="M115 110 L135 110" stroke="#7C8E85" stroke-width="0.6" stroke-dasharray="2 2"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.7s" fill="freeze"/></path>
    <g transform="translate(170 100)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.0s" fill="freeze"/>
      <g stroke="#6B5240" stroke-width="1.2" stroke-linecap="round"><line x1="-12" y1="24" x2="-2" y2="6"/><line x1="12" y1="24" x2="2" y2="6"/><line x1="-8" y1="24" x2="0" y2="10"/><line x1="8" y1="24" x2="0" y2="10"/></g>
      <text x="0" y="48" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">kindling</text>
      <text x="0" y="60" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">small sticks</text>
    </g>
    <path d="M225 110 L245 110" stroke="#7C8E85" stroke-width="0.6" stroke-dasharray="2 2"/>
    <g transform="translate(280 100)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.8s" fill="freeze"/>
      <g stroke="#6B5240" stroke-width="1.2" stroke-linecap="round"><line x1="-15" y1="24" x2="0" y2="2"/><line x1="15" y1="24" x2="0" y2="2"/><line x1="-10" y1="24" x2="3" y2="4"/><line x1="10" y1="24" x2="-3" y2="4"/></g>
      <text x="0" y="48" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">teepee</text>
      <text x="0" y="60" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">structure</text>
    </g>
    <path d="M335 110 L355 110" stroke="#7C8E85" stroke-width="0.6" stroke-dasharray="2 2"/>
    <g transform="translate(400 100)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.6s" fill="freeze"/>
      <g stroke="#6B5240" stroke-width="1.2" stroke-linecap="round"><line x1="-12" y1="24" x2="0" y2="6"/><line x1="12" y1="24" x2="0" y2="6"/></g>
      <path d="M0 8 Q-8 0 0 -10 Q8 0 0 8" fill="#B8552E" opacity="0.85">
        <animate attributeName="d" values="M0 8 Q-8 0 0 -10 Q8 0 0 8;M0 8 Q-9 -2 0 -12 Q9 -2 0 8;M0 8 Q-8 0 0 -10 Q8 0 0 8" dur="2s" repeatCount="indefinite"/>
      </path>
      <path d="M0 4 Q-5 -2 0 -7 Q5 -2 0 4" fill="#E8A05C" opacity="0.95">
        <animate attributeName="d" values="M0 4 Q-5 -2 0 -7 Q5 -2 0 4;M0 4 Q-6 -3 0 -8 Q6 -3 0 4;M0 4 Q-5 -2 0 -7 Q5 -2 0 4" dur="2s" repeatCount="indefinite"/>
      </path>
      <text x="0" y="48" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">light</text>
      <text x="0" y="60" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">flame</text>
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">a sequence learned through doing</text>
  </svg>`,

  bivouac: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- two anchor trees -->
    <ellipse cx="106" cy="32" rx="28" ry="16" fill="#3A6B5A" opacity="0.55"/>
    <ellipse cx="374" cy="32" rx="28" ry="16" fill="#3A6B5A" opacity="0.55"/>
    <rect x="100" y="30" width="12" height="135" fill="#6B5240" rx="2"/>
    <rect x="368" y="30" width="12" height="135" fill="#6B5240" rx="2"/>
    <!-- ridge pole appears -->
    <line x1="106" y1="60" x2="374" y2="60" stroke="#6B5240" stroke-width="3" stroke-linecap="round" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.4s" fill="freeze"/></line>
    <!-- knots -->
    <circle cx="106" cy="60" r="3" fill="#14302A" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.9s" fill="freeze"/></circle>
    <circle cx="374" cy="60" r="3" fill="#14302A" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.9s" fill="freeze"/></circle>
    <!-- tarp drops down -->
    <path d="M106 60 L60 145 L240 145 L240 60 Z" fill="#3A6B5A" opacity="0" stroke="#234A3E" stroke-width="1"><animate attributeName="opacity" from="0" to="0.7" dur="0.6s" begin="1.4s" fill="freeze"/></path>
    <path d="M374 60 L420 145 L240 145 L240 60 Z" fill="#3A6B5A" opacity="0" stroke="#234A3E" stroke-width="1"><animate attributeName="opacity" from="0" to="0.55" dur="0.6s" begin="1.4s" fill="freeze"/></path>
    <line x1="240" y1="60" x2="240" y2="145" stroke="#234A3E" stroke-width="0.6" stroke-dasharray="2 2" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.8s" fill="freeze"/></line>
    <!-- stakes -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="2.2s" fill="freeze"/>
      <polygon points="60,145 56,150 64,150" fill="#14302A"/>
      <polygon points="420,145 416,150 424,150" fill="#14302A"/>
    </g>
    <!-- two figures sitting under the tarp -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.6s" fill="freeze"/>
      ${figureSVG({ x: 182, y: 145, h: 9, pose: 'ground', facing: 1 })}
      ${figureSVG({ x: 300, y: 145, h: 9, pose: 'ground', facing: -1 })}
    </g>
    <!-- annotations -->
    <line x1="106" y1="60" x2="80" y2="40" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
    <text x="78" y="35" text-anchor="end" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">ridge pole</text>
    <line x1="60" y1="145" x2="40" y2="155" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
    <text x="38" y="158" text-anchor="end" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">stake</text>
  </svg>`,

  sitspot: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <ellipse cx="80" cy="120" rx="32" ry="7" fill="#7FA396" opacity="0.45"/>
      <circle cx="80" cy="100" r="14" fill="none" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.5"/>
      ${figureSVG({ x: 80, y: 128, h: 9, pose: 'ground', facing: 1 })}
      <text x="80" y="150" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">by the stream</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.9s" fill="freeze"/>
      <rect x="170" y="118" width="50" height="9" rx="3" fill="#6B5240"/>
      <circle cx="195" cy="103" r="14" fill="none" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.5"/>
      ${figureSVG({ x: 195, y: 127, h: 9, pose: 'sit', facing: 1 })}
      <text x="195" y="150" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">on the log</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.5s" fill="freeze"/>
      <ellipse cx="295" cy="120" rx="24" ry="14" fill="#6B5240" opacity="0.25"/>
      <ellipse cx="295" cy="120" rx="24" ry="14" fill="none" stroke="#6B5240" stroke-width="0.6"/>
      <circle cx="295" cy="103" r="14" fill="none" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.5"/>
      ${figureSVG({ x: 295, y: 128, h: 9, pose: 'ground', facing: 1 })}
      <text x="295" y="150" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">in the hollow</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.1s" fill="freeze"/>
      <path d="M395 50 L395 115" stroke="#6B5240" stroke-width="3"/>
      <ellipse cx="395" cy="46" rx="24" ry="13" fill="#3A6B5A" opacity="0.6"/>
      <circle cx="395" cy="103" r="14" fill="none" stroke="#234A3E" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.5"/>
      ${figureSVG({ x: 395, y: 128, h: 9, pose: 'ground', facing: 1 })}
      <text x="395" y="150" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="10" fill="#234A3E">under the pine</text>
    </g>
    <text x="240" y="35" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">a place to return to, week after week</text>
  </svg>`,

  roles: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <circle cx="100" cy="80" r="38" fill="#FBF9F4" stroke="#234A3E" stroke-width="1.2"/>
      ${figureSVG({ x: 100, y: 90, h: 8, pose: 'stand', facing: 1, shadow: false })}
      <text x="100" y="100" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">water</text>
      <text x="100" y="112" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">carrier</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.9s" fill="freeze"/>
      <circle cx="240" cy="80" r="38" fill="#FBF9F4" stroke="#234A3E" stroke-width="1.2"/>
      ${figureSVG({ x: 240, y: 90, h: 8, pose: 'stand', facing: 1, shadow: false })}
      <text x="240" y="100" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">fire</text>
      <text x="240" y="112" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">tender</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.5s" fill="freeze"/>
      <circle cx="380" cy="80" r="38" fill="#FBF9F4" stroke="#234A3E" stroke-width="1.2"/>
      ${figureSVG({ x: 380, y: 90, h: 8, pose: 'stand', facing: 1, shadow: false })}
      <text x="380" y="100" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#234A3E">time</text>
      <text x="380" y="112" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">keeper</text>
    </g>
    <line x1="138" y1="80" x2="202" y2="80" stroke="#7FA396" stroke-width="0.8" stroke-dasharray="3 3"/>
    <line x1="278" y1="80" x2="342" y2="80" stroke="#7FA396" stroke-width="0.8" stroke-dasharray="3 3"/>
    <text x="240" y="150" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#7C8E85">small functional roles, distributed</text>
  </svg>`,

  project: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <line x1="60" y1="120" x2="420" y2="120" stroke="#7C8E85" stroke-width="0.8"/>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <circle cx="80" cy="120" r="4" fill="#7FA396"/>
      <g stroke="#234A3E" stroke-width="0.8" fill="none"><line x1="70" y1="90" x2="90" y2="90" stroke-dasharray="2 2"/></g>
      <text x="80" y="138" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">wk 1</text>
      <text x="80" y="80" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="9" fill="#234A3E">sketch</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.9s" fill="freeze"/>
      <circle cx="190" cy="120" r="4" fill="#7FA396"/>
      <g stroke="#234A3E" stroke-width="1" fill="none"><line x1="180" y1="90" x2="200" y2="90"/><line x1="190" y1="88" x2="190" y2="78"/></g>
      <text x="190" y="138" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">wk 3</text>
      <text x="190" y="68" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="9" fill="#234A3E">plan</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.5s" fill="freeze"/>
      <circle cx="300" cy="120" r="4" fill="#3A6B5A"/>
      <g stroke="#234A3E" stroke-width="1.2" fill="none"><rect x="290" y="78" width="20" height="12" rx="1"/><line x1="294" y1="78" x2="294" y2="70"/><line x1="306" y1="78" x2="306" y2="70"/></g>
      <text x="300" y="138" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">wk 5</text>
      <text x="300" y="60" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="9" fill="#234A3E">build</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.1s" fill="freeze"/>
      <circle cx="410" cy="120" r="4" fill="#234A3E"/>
      <rect x="400" y="80" width="20" height="14" fill="#6B5240" rx="1"/>
      <path d="M396 80 L410 66 L424 80 Z" fill="#3A6B5A"/>
      <text x="410" y="138" text-anchor="middle" font-family="Open Sans, sans-serif" font-size="9" fill="#7C8E85">wk 8</text>
      <text x="410" y="60" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="9" fill="#234A3E">finish</text>
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">one piece of work, returned to across sessions</text>
  </svg>`,

  object: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <line x1="60" y1="120" x2="420" y2="120" stroke="#6B5240" stroke-width="0.5"/>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <circle cx="100" cy="108" r="9" fill="#7C8E85"/>
      <line x1="100" y1="120" x2="100" y2="132" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="100" y="146" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">solid</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.9s" fill="freeze"/>
      <ellipse cx="200" cy="110" rx="6" ry="11" fill="#3A6B5A" transform="rotate(-20 200 110)"/>
      <ellipse cx="206" cy="100" rx="2" ry="6" fill="#7FA396" transform="rotate(-20 206 100)"/>
      <line x1="200" y1="123" x2="200" y2="132" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="200" y="146" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">free</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="1.5s" fill="freeze"/>
      <ellipse cx="300" cy="112" rx="5" ry="9" fill="#6B5240"/>
      <path d="M300 102 L300 95" stroke="#3A6B5A" stroke-width="1"/>
      <line x1="300" y1="123" x2="300" y2="132" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="300" y="146" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">potential</text>
    </g>
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.1s" fill="freeze"/>
      <rect x="392" y="103" width="20" height="10" rx="2" fill="#6B5240"/>
      <line x1="402" y1="115" x2="402" y2="132" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
      <text x="402" y="146" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#234A3E">strength</text>
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">choose one. one word for what it carries.</text>
  </svg>`,

  checkin: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <!-- card -->
    <rect x="150" y="22" width="180" height="120" rx="6" fill="#FBF9F4" stroke="#234A3E" stroke-width="1"/>
    <text x="170" y="44" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#7C8E85">how am I leaving today?</text>
    <g font-family="Open Sans, sans-serif" font-size="11" fill="#1B2A24">
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.4s" fill="freeze"/>
        <circle cx="172" cy="62" r="5" fill="none" stroke="#234A3E" stroke-width="1"/>
        <text x="186" y="66">much better</text>
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.8s" fill="freeze"/>
        <circle cx="172" cy="82" r="5" fill="#234A3E" stroke="#234A3E" stroke-width="1"/>
        <text x="186" y="86">a bit better</text>
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.2s" fill="freeze"/>
        <circle cx="172" cy="102" r="5" fill="none" stroke="#234A3E" stroke-width="1"/>
        <text x="186" y="106">about the same</text>
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.6s" fill="freeze"/>
        <circle cx="172" cy="122" r="5" fill="none" stroke="#234A3E" stroke-width="1"/>
        <text x="186" y="126">a bit worse</text>
      </g>
    </g>
    <!-- hand placing in box -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.0s" fill="freeze"/>
      <rect x="350" y="100" width="40" height="30" rx="2" fill="none" stroke="#234A3E" stroke-width="1.2"/>
      <path d="M370 102 L390 102 L390 96 L370 96" fill="#FBF9F4" stroke="#234A3E" stroke-width="0.8"/>
      <line x1="332" y1="92" x2="350" y2="105" stroke="#7C8E85" stroke-width="0.5" stroke-dasharray="2 2"/>
    </g>
    <text x="240" y="160" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="11" fill="#7C8E85">private. quietly collected.</text>
  </svg>`,

  campfire: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="480" height="180" fill="#F4F1EA"/>
    <ellipse cx="240" cy="170" rx="200" ry="6" fill="#C8D8D0" opacity="0.6"/>
    <ellipse cx="240" cy="125" rx="130" ry="36" fill="#6B5240" opacity="0.1"/>
    <!-- fire first -->
    <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.3s" fill="freeze"/>
      <ellipse cx="240" cy="135" rx="22" ry="5" fill="#6B5240" opacity="0.4"/>
      <g stroke="#6B5240" stroke-width="1.5" stroke-linecap="round" fill="none">
        <line x1="226" y1="135" x2="240" y2="118"/>
        <line x1="254" y1="135" x2="240" y2="118"/>
      </g>
      <path d="M240 130 Q232 120 240 105 Q248 120 240 130" fill="#B8552E" opacity="0.85">
        <animate attributeName="d" values="M240 130 Q232 120 240 105 Q248 120 240 130;M240 130 Q230 118 240 100 Q250 118 240 130;M240 130 Q232 120 240 105 Q248 120 240 130" dur="2s" repeatCount="indefinite"/>
      </path>
      <path d="M240 126 Q235 118 240 110 Q245 118 240 126" fill="#E8A05C">
        <animate attributeName="d" values="M240 126 Q235 118 240 110 Q245 118 240 126;M240 126 Q233 116 240 106 Q247 116 240 126;M240 126 Q235 118 240 110 Q245 118 240 126" dur="2s" repeatCount="indefinite"/>
      </path>
    </g>
    <!-- figures gather one by one, seated in a ring around the fire.
         Those further round the circle sit higher and smaller: the ring
         recedes, so the same body reads at the depth it is sitting at. -->
    <g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.0s" fill="freeze"/>
        ${figureSVG({ x: 138, y: 141, h: 10, pose: 'ground', facing: 1 })}
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.4s" fill="freeze"/>
        ${figureSVG({ x: 182, y: 125, h: 8.6, pose: 'ground', facing: 1, opacity: 0.92 })}
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="1.8s" fill="freeze"/>
        ${figureSVG({ x: 212, y: 116, h: 8, pose: 'ground', facing: 1, opacity: 0.88 })}
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="2.0s" fill="freeze"/>
        ${figureSVG({ x: 268, y: 116, h: 8, pose: 'ground', facing: -1, opacity: 0.88 })}
      </g>
      <g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="2.6s" fill="freeze"/>
        ${figureSVG({ x: 342, y: 141, h: 10, pose: 'ground', facing: -1 })}
      </g>
    </g>
    <!-- ember sparks -->
    <g opacity="0"><animate attributeName="opacity" values="0;0.8;0" dur="3s" begin="3s" repeatCount="indefinite"/>
      <circle cx="232" cy="90" r="1" fill="#E8A05C"/>
      <circle cx="248" cy="85" r="0.8" fill="#E8A05C"/>
      <circle cx="240" cy="78" r="1" fill="#E8A05C"/>
    </g>
    <text x="240" y="40" text-anchor="middle" font-family="Montserrat, sans-serif" font-style="italic" font-size="12" fill="#7C8E85">a circle. shared stillness. then leaving.</text>
  </svg>`,
};

// ─── ACTIVITIES ──────────────────────────────────────────────────────────
const ACTIVITIES = [
  // Group 1 — Getting There
  { id:'introduce', group:1, name:'Introduce Yourself to the Forest', durMin:10, durMax:20, durAvg:15, glyph:'letter', visual:'introduce',
    caption:'A name spelled out in sticks, leaves and stones',
    purpose:'Build a personal connection with the forest. Find a place of your own.',
    materials:'None — the forest provides.',
    intro:'"Walk around and find a spot that speaks to you. Spell out your name there using natural materials — as big, small, simple or ornate as you feel today. A nickname or initial is fine."',
    close:'Signal the group back to a meeting point. Invite anyone who wants to share.',
    tags:['First session','Individual','Anxiety']
  },
  { id:'soundscape', group:1, name:'The Soundscape Map', durMin:10, durMax:15, durAvg:12, glyph:'ear', visual:'soundscape',
    caption:'Sound sources marked radiating from the listener\'s position',
    purpose:'Engage the senses on arrival.',
    materials:'Paper, pencil, clipboard per person.',
    intro:'"Find your own spot. Sit still for five minutes. Mark where you are, then mark where sounds come from and how they feel. Share anything you want when we come back."',
    close:'Bring the group together. Invite sharing. Ask: did you hear anything unexpected?',
    tags:['First session','Groups','Anxiety']
  },
  { id:'naming', group:1, name:'Naming the Forest', durMin:5, durMax:10, durAvg:7, glyph:'leaf', visual:'naming',
    caption:'Forest elements identified and named along the path',
    purpose:'Names reduce anxiety. Familiarity builds confidence.',
    materials:'Nothing, or a laminated sheet of local species.',
    intro:'"As we walk I\'ll point a few things out. You don\'t need to remember any of it. Everything here has a name."',
    close:'No formal close. Dissolves into the walk.',
    tags:['First session','Anxiety']
  },
  { id:'hammock', group:1, name:'The Hammock', durMin:30, durMax:60, durAvg:45, glyph:'hammock', visual:'hammock',
    caption:'A person resting in a hammock between two trees',
    purpose:'Settle into the woodland.',
    materials:'One or more hammocks hung between trees.',
    intro:'"There\'s a hammock over there. Go and lie in it if you want. You don\'t have to do or say anything. Just notice what it\'s like. We\'ll check in every half hour."',
    close:'No structured close. Let young people leave when ready. Have the next activity quietly ready.',
    tags:['Individual','Anxiety','Trauma-informed']
  },

  // Group 2
  { id:'barefoot', group:2, name:'Barefoot Trail', durMin:10, durMax:15, durAvg:12, glyph:'foot', visual:'barefoot',
    caption:'Five distinct textures along a barefoot path',
    purpose:'Engages touch and proprioception. Grounds ruminative or anxious thinking.',
    materials:'A short varied path of grass, soil, bark, moss, stone.',
    intro:'"If you\'re comfortable, take off your shoes. We\'re going to walk this bit very slowly. Just notice what you feel through your feet."',
    close:'Pause the group. Ask: what was the most interesting texture? What surprised you?',
    tags:['Groups','Anxiety','Somatic work']
  },
  { id:'palette', group:2, name:'Colour Palette Walk', durMin:15, durMax:20, durAvg:17, glyph:'swatch', visual:'palette',
    caption:'A colour palette card with forest elements matched to each swatch',
    purpose:'Focused looking without needing words.',
    materials:'Laminated colour palette or paint chips per person.',
    intro:'"As we walk, try to find something in the forest that matches each colour. You don\'t need to pick anything up, just find it."',
    close:'Gather the group. Who found a surprising match? Seasonal variation: make a palette from fallen leaves.',
    tags:['Groups','Children','Creative work']
  },
  { id:'senses', group:2, name:'Five Senses Inventory', durMin:5, durMax:10, durAvg:7, glyph:'hand', visual:'senses',
    caption:'5-4-3-2-1 grounding sequence',
    purpose:'Structured grounding (5-4-3-2-1). Produces quiet, focused attention.',
    materials:'Nothing, or a small prompt card.',
    intro:'"Stand still. Find five things you can see. Four you can hear. Three you can feel. Two you can smell. One you can taste or imagine tasting. Take your time."',
    close:'No formal close. Can be used as a reset at any point.',
    tags:['Anxiety','Trauma-informed','Somatic work']
  },
  { id:'tinyworld', group:2, name:'Build a Tiny World', durMin:45, durMax:60, durAvg:52, glyph:'tinyworld', visual:'tinyworld',
    caption:'Mud, sticks and leaves built into an imagined world',
    purpose:'Hands-on play, creativity and group immersion. Encourages touch, imagination and collaborative making.',
    materials:'Natural materials on site: mud, soil, leaves, sticks, stones, bark, moss, water.',
    intro:'"We\'re going to create an imaginary world using only what we can find. The theme is Build A Tiny World. Work in small groups for about an hour. There\'s no right or wrong way."',
    close:'Signal the end a few minutes early. Invite groups to walk through each other\'s worlds. Return materials to the ground. Invite reflections.',
    tags:['Groups','Children','Creative work']
  },

  // Group 3
  { id:'sofa', group:3, name:'Building the Forest Sofa', durMin:30, durMax:45, durAvg:37, glyph:'log', visual:'sofa',
    caption:'A collaborative seating circle built from logs and branches',
    purpose:'Create a shared space owned by the group. A gathering point for the rest of the programme.',
    materials:'Fallen branches and logs. No tools needed.',
    intro:'"We\'re going to make somewhere to sit that fits all of us. See what you can find — branches, logs, anything on the ground — and bring it back here."',
    close:'Sit in it together. Mark the moment. Return to it in future sessions.',
    tags:['Groups','Connection building','Relational work']
  },
  { id:'fire', group:3, name:'Fire Lighting', durMin:45, durMax:60, durAvg:52, glyph:'flame', visual:'fire',
    caption:'Tinder · kindling · structure · flame',
    purpose:'Shared goal, skill transfer, visible outcome.',
    materials:'Site permission, safety clearance, competent practitioner. Fire steel or matches, tinder, kindling, fuel wood, fire circle, water nearby.',
    intro:'"We\'re going to light a fire. I\'ll show you how to set it up, then anyone who wants to can try. It usually takes a few goes — it can be tricky!"',
    close:'Formal close required. Extinguish fully together. Every participant should see this. Leave the site as found.',
    tags:['Groups','Adolescents','Connection building']
  },
  { id:'bivouac', group:3, name:'Bivouac Building', durMin:45, durMax:60, durAvg:52, glyph:'shelter', visual:'bivouac',
    caption:'Ridge pole · two anchor points · tensioned tarp',
    purpose:'Cooperation, problem-solving, shared accomplishment.',
    materials:'Tarpaulins and rope, or on-site materials.',
    intro:'"We\'re going to build a shelter big enough for at least four of us. There\'s no one right way. See what you\'ve got and what you can find. I\'ll help if you get stuck."',
    close:'Test it together. Sit inside briefly. Mark the achievement.',
    tags:['Groups','Adolescents','Relational work']
  },

  // Group 4
  { id:'sitspot', group:4, name:'The Sit Spot', durMin:15, durMax:20, durAvg:17, glyph:'spot', visual:'sitspot',
    caption:'Each person finds a personal place, returned to each session',
    purpose:'Each young person finds a place in the forest that is theirs, returned to across sessions.',
    materials:'15–20 minutes unstructured. Site with enough variety for individual spots within earshot.',
    intro:'"Find somewhere in the forest that speaks to you. Somewhere you\'d want to sit. It can be anywhere. You don\'t need to explain why. We\'ll come back together in fifteen minutes."',
    close:'Invite anyone to show or describe their spot. Make returning to it a regular ritual.',
    tags:['Individual','Adolescents','Identity work']
  },
  { id:'roles', group:4, name:'Distributed Responsibility', durMin:0, durMax:0, durAvg:0, durLabel:'Throughout session', glyph:'roles', visual:'roles',
    caption:'Small functional roles distributed across the group',
    purpose:'Young people experience being depended on, not just cared for.',
    materials:'Specific practical roles before departure: who carries cups, tea, checks the path, holds the map.',
    intro:'"I need some help today. I can\'t do this alone. I\'m going to ask each of you to be responsible for something."',
    close:'At the end, name what each person did specifically. This is acknowledgement of a real contribution.',
    tags:['Groups','Adolescents','Connection building']
  },
  { id:'project', group:4, name:'The Individual Project', durMin:0, durMax:0, durAvg:0, durLabel:'Multi-session', glyph:'seedling', visual:'project',
    caption:'A personal project evolving across sessions',
    purpose:'One young person takes on a personal project across multiple sessions.',
    materials:'Session time, on-site materials.',
    intro:'"This part of the forest isn\'t being used for anything. I wondered if you might want to do something with it over the next few weeks? Build something, plant something, create something?"',
    close:'At programme end, the group visits together. The young person leads and describes what they made and why.',
    tags:['Individual','Adolescents','Identity work']
  },

  // Group 5
  { id:'object', group:5, name:'The Forest Object', durMin:5, durMax:10, durAvg:7, glyph:'pebble', visual:'object',
    caption:'Each person selects a small object to carry forward — one word for what it holds',
    purpose:'A small natural object to carry between sessions — a portable resource.',
    materials:'Permission to take small objects. A bag or envelope per person.',
    intro:'"Before we go, find something small you want to take with you. Something from today. You don\'t need to explain why."',
    close:'Invite anyone to show what they chose and say one word about it. One word only — not a reflection exercise.',
    tags:['Groups','Individual','Identity work','Life transitions']
  },
  { id:'checkin', group:5, name:'The Return Check-in', durMin:2, durMax:5, durAvg:3, glyph:'check', visual:'checkin',
    caption:'A private self-assessment quietly collected before the walk back',
    purpose:'Brief self-assessment before leaving. Builds self-reflection as a habit.',
    materials:'A simple rating card: much better / a bit better / about the same / a bit worse.',
    intro:'"Fill this in before we get on the bus. You don\'t need to share it. Just take a moment to notice."',
    close:'Collect cards quietly. Begin the walk back. Allow quiet on the return — don\'t process the session immediately.',
    tags:['Groups','Session check-in','Anxiety']
  },
  { id:'campfire', group:5, name:'Campfire Close', durMin:10, durMax:15, durAvg:12, glyph:'ember', visual:'campfire',
    caption:'A circle around the fire, shared stillness before departure',
    purpose:'A natural closing ritual. Shared stillness before departure.',
    materials:'A fire from the session, or tea on a small stove if no fire.',
    intro:'"Before we put the fire out, let\'s sit with it for a few minutes. You don\'t have to say anything. Just notice where you are. Then we\'ll head back."',
    close:'Extinguish the fire together. Walk back however the group chooses.',
    tags:['Groups','Session check-in']
  },
];

// ─── ADAPTATIONS ─────────────────────────────────────────────────────────
const ADAPTATIONS = [
  { label:'High anxiety',
    text:'Prioritise activities with a clear task and visible outcome over open-ended activities in early sessions. The colour palette walk, distributed responsibility, and the sit spot all provide structure without requiring performance. Avoid activities requiring physical proximity to others or closed/dark spaces until trust in the setting is established. Graduate sensory intensity across the programme arc.' },
  { label:'Autistic young people',
    text:'Predictability of structure is paramount. Describe the session arc in advance, ideally using a visual schedule. Assess sensory sensitivities before any sensory activity: the barefoot trail and activities involving unfamiliar textures should be offered as genuine options, not defaults. Many autistic young people show strong intrinsic interest in natural systems; the naming activity and colour palette walk often produce strong engagement. Allow extended time where genuine absorption occurs.' },
  { label:'Very low mood',
    text:'The primary aim in early sessions is physical presence in the natural environment, not activity completion. The hammock, the fire, and the sit spot are the most appropriate starting points. Frame success as arriving and staying rather than participating, to reduce the risk of a first session that confirms the young person\'s belief that they cannot engage.' },
  { label:'High hyperactivity',
    text:'Use physical and task-based activities early in the session to allow discharge of arousal before quieter activities are introduced. Bivouac building, fire preparation, and distributed responsibility all provide legitimate physical engagement. Transition to quieter activities gradually: moderate activity, then a short focused activity, then genuinely unstructured time.' },
  { label:'First session resistance',
    text:'Use the lightest possible structure: no requirements, an explicit offer to sit out, and a guide who does not appear to be managing the resistant young person. Giving a resistant young person a specific and optional responsibility — one requiring minimal engagement but placing them adjacent to the group activity — often provides a route in that confrontational approaches do not.' },
];
