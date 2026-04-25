// Lightweight inline-SVG icon set for RedVoice.
// 1.5px strokes, currentColor, 20px nominal — scale via CSS font-size or width/height.
const I = {
  Mic:        (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>,
  MicOff:     (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9V6a3 3 0 0 1 6 0v5"/><path d="M15 14a3 3 0 0 1-5.83 1"/><path d="M5 11a7 7 0 0 0 11 5"/><path d="M19 11a7 7 0 0 1-.5 2.6"/><path d="M12 18v3"/><path d="M3 3l18 18"/></svg>,
  Speaker:    (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>,
  Screen:     (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/></svg>,
  ScreenOff:  (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M3 3l18 18"/></svg>,
  Leave:      (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 17l-5-5 5-5"/><path d="M4 12h11"/></svg>,
  Settings:   (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  Logout:     (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>,
  Copy:       (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Check:      (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>,
  Plus:       (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  Link:       (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1"/></svg>,
  X:          (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6"/></svg>,
  Chevron:    (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
  ChevronDown:(p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  Grid:       (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Star:       (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.7 5.5 6.3.9-4.5 4.4 1 6.2L12 17l-5.5 3 1-6.2-4.5-4.4 6.3-.9z"/></svg>,
  Clock:      (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  Headphones: (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3z"/><path d="M3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>,
  Wave:       (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h-1"/></svg>,
  Pin:        (p) => <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 3h6l-1 5 3 3v3H7v-3l3-3z"/></svg>,
  // Logo dispatch — picks variant from data-logo on <html>, defaults to "monogram"
  Logo: (p) => {
    const v = (typeof document !== "undefined" && document.documentElement.dataset.logo) || "monogram";
    const Variant = LogoVariants[v] || LogoVariants.monogram;
    return <Variant size={p.size || 22}/>;
  },
};

// ── Logo variants ────────────────────────────────────────────
// Each variant is sized to a 28px square viewBox, and uses currentColor
// for the wordmark stroke where possible so it can ride on light/dark.

const LogoVariants = {
  // 1. Monogram R — bold custom-cut "R" on a red squircle, with a tiny
  //    record-dot punched into the bowl. Light from upper-left.
  monogram: ({ size }) => {
    const id = "rv-mg-" + Math.random().toString(36).slice(2, 7);
    return (
      <svg viewBox="0 0 28 28" width={size} height={size} fill="none">
        <defs>
          <radialGradient id={id + "-bg"} cx="32%" cy="22%" r="90%">
            <stop offset="0"   stopColor="oklch(0.72 0.19 22)"/>
            <stop offset=".55" stopColor="oklch(0.58 0.18 22)"/>
            <stop offset="1"   stopColor="oklch(0.38 0.14 22)"/>
          </radialGradient>
          <linearGradient id={id + "-r"} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.97 0.012 25)"/>
            <stop offset="1" stopColor="oklch(0.88 0.030 25)"/>
          </linearGradient>
        </defs>
        {/* squircle background */}
        <rect x="0" y="0" width="28" height="28" rx="6.4" fill={`url(#${id}-bg)`}/>
        {/* inner highlight ring */}
        <rect x="0.5" y="0.5" width="27" height="27" rx="6" fill="none"
              stroke="rgba(255,255,255,.10)" strokeWidth=".6"/>
        {/* drop shadow under R */}
        <path transform="translate(0.35,0.5)" fill="rgba(0,0,0,.20)"
              d="M8.1 5.9 h8.4 a4.7 4.7 0 0 1 4.7 4.7 v.95
                 a4.7 4.7 0 0 1 -3.45 4.55 l4.4 6.4 h-4.05
                 l-3.9 -5.95 h-2.35 v5.95 h-3.75 z
                 M11.85 9.3 v3.45 h4.4 a1.72 1.72 0 0 0 0 -3.45 z"/>
        {/* the R */}
        <path fill={`url(#${id}-r)`}
              d="M8.1 5.9 h8.4 a4.7 4.7 0 0 1 4.7 4.7 v.95
                 a4.7 4.7 0 0 1 -3.45 4.55 l4.4 6.4 h-4.05
                 l-3.9 -5.95 h-2.35 v5.95 h-3.75 z
                 M11.85 9.3 v3.45 h4.4 a1.72 1.72 0 0 0 0 -3.45 z"/>
        {/* record-dot in the bowl */}
        <circle cx="16.25" cy="11.05" r=".62" fill="oklch(0.58 0.18 22)"/>
      </svg>
    );
  },

  // 2. Tactile signal — concentric arcs broadcasting from a red dot.
  //    Reads as "signal / live / on-air."
  signal: ({ size }) => (
    <svg viewBox="0 0 28 28" width={size} height={size} fill="none">
      <defs>
        <radialGradient id="rv-sg" cx="50%" cy="60%" r="60%">
          <stop offset="0"   stopColor="oklch(0.72 0.18 22)"/>
          <stop offset="1"   stopColor="oklch(0.40 0.13 22)"/>
        </radialGradient>
      </defs>
      {/* arcs */}
      <path d="M5 19 a10 10 0 0 1 18 0"  stroke="oklch(0.42 0.13 22)" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M8 19 a7  7  0 0 1 12 0"  stroke="oklch(0.55 0.16 22)" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M11 19 a3.5 3.5 0 0 1 6 0" stroke="oklch(0.68 0.18 22)" strokeWidth="1.6" strokeLinecap="round"/>
      {/* dot */}
      <circle cx="14" cy="19" r="2.4" fill="url(#rv-sg)"/>
      <circle cx="14" cy="19" r="2.4" fill="none" stroke="oklch(0.85 0.12 22)" strokeWidth=".5" opacity=".7"/>
    </svg>
  ),

  // 3. Bracket-R — terminal/console flavor; fits the JetBrains Mono pairing.
  bracket: ({ size }) => (
    <svg viewBox="0 0 28 28" width={size} height={size} fill="none">
      <defs>
        <linearGradient id="rv-br" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.66 0.185 22)"/>
          <stop offset="1" stopColor="oklch(0.45 0.155 22)"/>
        </linearGradient>
      </defs>
      {/* left bracket */}
      <path d="M7 5 H4 V23 H7" stroke="url(#rv-br)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* right bracket */}
      <path d="M21 5 H24 V23 H21" stroke="url(#rv-br)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* R glyph */}
      <path d="M10 9 h5 a3 3 0 0 1 0 6 h-1.6 l3.2 4 h-2.8 l-3.2 -3.8 v3.8 h-1.8 z m1.8 1.7 v2.6 h3.2 a1.3 1.3 0 0 0 0 -2.6 z"
            fill="oklch(0.94 0.01 25)"/>
      {/* blinking caret pip */}
      <rect x="17.6" y="17" width="2" height="3" fill="oklch(0.66 0.185 22)" rx=".4">
        <animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite"/>
      </rect>
    </svg>
  ),

  // 4. Wolfie — pixel-art mascot. 16×16 grid, crunchy edges (shape-rendering: crispEdges).
  //    Palette: red coat, dark inner ears, white muzzle, black eyes, pink blush.
  wolfie: ({ size }) => {
    // Pixel map — each char is a color slot:
    //   . = transparent
    //   r = red coat        R = darker red shade
    //   k = black outline   d = dark inner-ear / shade
    //   w = white muzzle    p = pink blush
    //   e = eye highlight (white)
    const px = [
      "................",
      ".rr..........rr.",
      "rrdr........rdrr",
      "rddr........rddr",
      "rrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrr",
      "rrrwwrrrrrrwwrrr",
      "rrwekrrrrrrwekrr",
      "rrwkkrrwwrrwkkrr",
      "rrrrrwwwwwwrrrrr",
      "rrprwwwkkwwwrprr",
      "rrprwwwwwwwwprrr",
      "rrrrwwkwwkwwrrrr",
      ".RRrwwkkkkwwrRR.",
      "..RRRwwwwwwRRR..",
      "....RRRRRRRR....",
    ];
    const map = {
      r: "url(#wg)", R: "oklch(0.42 0.150 22)",
      k: "oklch(0.10 0.02 25)", d: "oklch(0.30 0.09 22)",
      w: "oklch(0.95 0.01 25)", p: "oklch(0.78 0.16 22)",
      e: "oklch(0.98 0 0)",
    };
    const rects = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = px[y][x];
        if (c === ".") continue;
        rects.push(<rect key={y+","+x} x={x} y={y} width="1.02" height="1.02" fill={map[c]}/>);
      }
    }
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
           shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
        <defs>
          <linearGradient id="rv-wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.70 0.185 22)"/>
            <stop offset="1" stopColor="oklch(0.55 0.180 22)"/>
          </linearGradient>
        </defs>
        {rects}
      </svg>
    );
  },
};

// ── Pixel painter helper for alt wolves ─────────────────────
// Shared 9-slot palette tuned to RedVoice red. All alt wolves use it.
const PIXEL_PAL = {
  D: "oklch(0.30 0.10 22)",   // dark coat / outline
  r: "oklch(0.50 0.17 22)",   // mid coat
  R: "oklch(0.62 0.19 22)",   // light coat highlight
  c: "oklch(0.92 0.04 22)",   // cream belly
  w: "oklch(0.97 0.01 25)",   // white tufts/paws
  k: "oklch(0.10 0.02 25)",   // black scarf
  K: "oklch(0.04 0.01 25)",   // pure black eye
  y: "oklch(0.78 0.14 80)",   // gold collar tag
  p: "oklch(0.78 0.16 22)",   // blush
};

function paintPixelGrid(grid, w, h) {
  const rects = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (c === "_" || c === " " || c === ".") continue;
      const fill = PIXEL_PAL[c];
      if (!fill) continue;
      rects.push(<rect key={y+","+x} x={x} y={y} width="1.02" height="1.02" fill={fill}/>);
    }
  }
  return rects;
}

// Alt 1 — LOAF: 32×24 chibi face, head only, both eyes forward
const WOLF_LOAF = [
  "________________________________",
  "________________________________",
  "________DD__________DD__________",
  "_______DwDD________DDwD_________",
  "______DDwwDD______DDwwDD________",
  "______DDwwDDDDDDDDDDwwDD________",
  "_____DDDDDDDDDDDDDDDDDDDD_______",
  "____DDDDDDcccccccccDDDDDDD______",
  "____DDDccccccccccccccDDDDD______",
  "___DDcccKccccccccccKccDDDD______",
  "___DDccKKcccccccccKKccDDD_______",
  "___DDccccccccccccccccDDD________",
  "___DDcccccccpccccccccDD_________",
  "____DDcccccKKKccccccDD__________",
  "_____DDcccccwccccccDD___________",
  "______DDDcccccccDDDD____________",
  "________DDDDDDDDDD______________",
  "_________kkkgykkk_______________",
  "__________kkkkkk________________",
  "________________________________",
  "________________________________",
  "________________________________",
  "________________________________",
  "________________________________",
];
// note: g unmapped → falls through. Add to palette.
PIXEL_PAL.g = "oklch(0.78 0.14 80)";

// Alt 2 — TROTTER: 24×24 side-view trotting wolf
const WOLF_TROTTER = [
  "________________________",
  "________________________",
  "________________________",
  "_DD___________________DD",
  "_DwDD________________DrR",
  "_DwwDDD_____________DrrR",
  "_DDDDDDD___________DrrR_",
  "DDccccDDDDDDDDDDDDDrrR__",
  "DcKccccrrrrrrrrrrrrrR___",
  "DcccccccrrrrrrrrrrrR____",
  "Kcccccccrrrrrrrrrrrr____",
  "DccpcccccrrrrrrrrrrR____",
  "_ccccccccrrrrrrrrrrr____",
  "_kkgykcccccccccccccr____",
  "__kkkkccccccccccccc_____",
  "___ccccccccccccccc______",
  "___c__cccccc__c_________",
  "___w__wwwww___w_________",
  "___w__wwwww___w_________",
  "___ww__www____ww________",
  "________________________",
  "________________________",
  "________________________",
  "________________________",
];

// Alt 3 — ALPHA: 24×24 front-facing standing wolf
const WOLF_ALPHA = [
  "________________________",
  "____DDD________DDD______",
  "___DDwDD______DDwDD_____",
  "___DDwwDD____DDwwDD_____",
  "____DDDDDDDDDDDDDDD_____",
  "___DDDDDDDDDDDDDDDDDD___",
  "___DDccccccccccccccDD___",
  "___DcKKccccccccccKKcD___",
  "___DccccccccccccccccD___",
  "___DccccccpccccpccccD___",
  "___DDcccccKKKKccccccDD__",
  "____DDcccccwwccccccDD___",
  "______DDccccccccDDD_____",
  "________DDDDDDDD________",
  "_______kkkgykkkk________",
  "______kkkkkkkkkkk_______",
  "______rrcccccccrr_______",
  "_____rrcccccccccrr______",
  "____rrrcccccccccrrr_____",
  "____rrrcccccccccrrr_____",
  "____rrrrcccccccrrrr_____",
  "____rrr_rrr_rrr_rrr_____",
  "____www_www_www_www_____",
  "____www_www_www_www_____",
];

// Wrap each as a LogoVariant (px-art crisp render)
function makeWolfVariant(grid, w, h) {
  return ({ size }) => (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={size} fill="none"
         shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
      {paintPixelGrid(grid, w, h)}
    </svg>
  );
}
LogoVariants.wolfie_loaf    = makeWolfVariant(WOLF_LOAF,    32, 24);
LogoVariants.wolfie_trotter = makeWolfVariant(WOLF_TROTTER, 24, 24);
LogoVariants.wolfie_alpha   = makeWolfVariant(WOLF_ALPHA,   24, 24);

window.LogoVariants = LogoVariants;
window.I = I;
