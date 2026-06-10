<!-- Storybook environment behind the 3D scene — verbatim port of the legacy
     index.html env layers. Pure static SVG: visibility/animation are driven
     entirely by the body.time-* classes (engine/time-of-day) and hidden by
     body.cam-mode / body.ar-mode in style.css. -->
<svg id="envSun" class="env-layer" viewBox="0 0 100 100" width="78" height="78" aria-hidden="true">
  <g stroke="#f6c945" stroke-width="3" stroke-linecap="round">
    <line x1="50" y1="10" x2="50" y2="22"/>
    <line x1="50" y1="78" x2="50" y2="90"/>
    <line x1="10" y1="50" x2="22" y2="50"/>
    <line x1="78" y1="50" x2="90" y2="50"/>
    <line x1="22" y1="22" x2="30" y2="30"/>
    <line x1="70" y1="70" x2="78" y2="78"/>
    <line x1="78" y1="22" x2="70" y2="30"/>
    <line x1="30" y1="70" x2="22" y2="78"/>
  </g>
  <circle cx="50" cy="50" r="22" fill="#ffd23f"/>
</svg>
<svg id="envMoon" class="env-layer" viewBox="0 0 120 90" width="100" height="78" aria-hidden="true">
  <g class="stars">
    <circle cx="14" cy="20" r="1.6"/>
    <circle cx="32" cy="50" r="1.2"/>
    <circle cx="105" cy="68" r="1.5"/>
    <circle cx="50" cy="10" r="1.1"/>
  </g>
  <path d="M75 12a30 30 0 1 0 18 53A24 24 0 0 1 75 12Z" fill="#f6e8c4"/>
</svg>
<div id="envHills" class="env-layer" aria-hidden="true">
  <svg viewBox="0 0 1000 220" preserveAspectRatio="none" width="100%" height="220">
    <path d="M0 110 Q160 50 320 90 Q470 130 620 80 Q780 30 1000 100 L1000 220 L0 220 Z"
          fill="var(--hill-back, #b8dcb3)"/>
    <path d="M0 160 Q200 100 400 140 Q580 170 760 130 Q890 105 1000 150 L1000 220 L0 220 Z"
          fill="var(--hill-front, #7bbf78)"/>
  </svg>
</div>
<div id="envTrees" class="env-layer" aria-hidden="true">
  <svg viewBox="0 0 1000 230" preserveAspectRatio="xMidYMax meet" width="100%" height="230">
    <g transform="translate(130 230)">
      <rect x="-9" y="-58" width="18" height="58" rx="3" fill="var(--tree-trunk, #7a4a2a)"/>
      <circle cx="-2" cy="-92" r="50" fill="var(--tree-leaf-light, #75c574)"/>
      <circle cx="24" cy="-108" r="34" fill="var(--tree-leaf-dark, #4ea54c)"/>
      <circle cx="-28" cy="-102" r="32" fill="var(--tree-leaf-dark, #4ea54c)"/>
    </g>
    <g transform="translate(400 230)">
      <ellipse cx="0" cy="-22" rx="48" ry="22" fill="var(--tree-leaf-light, #75c574)"/>
      <ellipse cx="-14" cy="-30" rx="20" ry="12" fill="var(--tree-leaf-dark, #4ea54c)"/>
    </g>
    <g transform="translate(860 230)">
      <rect x="-6" y="-44" width="12" height="44" rx="2" fill="var(--tree-trunk, #7a4a2a)"/>
      <circle cx="0" cy="-72" r="38" fill="var(--tree-leaf-light, #75c574)"/>
      <circle cx="-18" cy="-84" r="26" fill="var(--tree-leaf-dark, #4ea54c)"/>
    </g>
  </svg>
</div>
<div id="envGrass" class="env-layer" aria-hidden="true">
  <svg viewBox="0 0 1000 100" preserveAspectRatio="xMidYMax meet" width="100%" height="100">
    <rect x="0" y="68" width="1000" height="32" fill="var(--ground, #4ea54c)"/>
    <g fill="var(--grass, #5fb95e)">
      <path d="M60 68 q-2 -16 -7 -22 q5 -1 7 -9 q2 8 7 9 q-5 6 -7 22z"/>
      <path d="M180 68 q-2 -14 -6 -20 q4 -1 6 -8 q2 7 6 8 q-4 6 -6 20z"/>
      <path d="M320 68 q-2 -18 -8 -25 q6 -1 8 -10 q2 9 8 10 q-6 7 -8 25z"/>
      <path d="M470 68 q-2 -15 -7 -21 q5 -1 7 -9 q2 8 7 9 q-5 6 -7 21z"/>
      <path d="M620 68 q-2 -17 -7 -23 q5 -1 7 -10 q2 9 7 10 q-5 6 -7 23z"/>
      <path d="M770 68 q-2 -14 -6 -20 q4 -1 6 -8 q2 7 6 8 q-4 6 -6 20z"/>
      <path d="M880 68 q-2 -19 -8 -26 q6 -1 8 -11 q2 10 8 11 q-6 7 -8 26z"/>
    </g>
    <g>
      <g transform="translate(110 58)"><circle r="3.5" fill="#ffb3c8"/><circle r="1.2" fill="#fff"/></g>
      <g transform="translate(260 64)"><circle r="3" fill="#ffd23f"/><circle r="1" fill="#fff"/></g>
      <g transform="translate(560 60)"><circle r="3.5" fill="#ffb3c8"/><circle r="1.2" fill="#fff"/></g>
      <g transform="translate(720 63)"><circle r="3" fill="#fff"/><circle r="1" fill="#ffd23f"/></g>
      <g transform="translate(940 58)"><circle r="3.5" fill="#ffb3c8"/><circle r="1.2" fill="#fff"/></g>
    </g>
  </svg>
</div>
