// Simple flat illustrations used as photos for the seeded demo reports.
// Real reports use uploaded photos; these just keep the demo self-contained.

const W = 800;
const H = 600;

function frame(inner, { sky = '#2E4A50', ground = '#3A4F4F', tint = '#B5F0D2' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#1E3338"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g opacity="0.35" fill="#1A2C30">
    <rect x="40" y="150" width="90" height="230"/><rect x="140" y="200" width="70" height="180"/>
    <rect x="560" y="120" width="110" height="260"/><rect x="680" y="190" width="80" height="190"/>
    <rect x="330" y="230" width="60" height="150"/>
  </g>
  <g fill="${tint}" opacity="0.18">
    <rect x="60" y="175" width="12" height="16"/><rect x="90" y="175" width="12" height="16"/>
    <rect x="60" y="215" width="12" height="16"/><rect x="580" y="150" width="14" height="18"/>
    <rect x="620" y="150" width="14" height="18"/><rect x="580" y="195" width="14" height="18"/>
  </g>
  <rect y="380" width="${W}" height="220" fill="${ground}"/>
  ${inner}
</svg>`;
}

const road = `
  <polygon points="250,380 550,380 800,600 0,600" fill="#2B3B3E"/>
  <g fill="#C9D3D1" opacity="0.7">
    <polygon points="396,390 404,390 408,430 392,430"/><polygon points="388,460 412,460 418,520 382,520"/>
  </g>`;

const scenes = {
  pothole: (c) =>
    frame(`${road}
    <ellipse cx="470" cy="500" rx="120" ry="38" fill="#141F21"/>
    <ellipse cx="470" cy="494" rx="96" ry="26" fill="#0E1617"/>
    <path d="M350 500 l-30 10 M590 498 l40 12 M440 462 l-14 -18 M520 468 l20 -16" stroke="#141F21" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="480" cy="498" rx="50" ry="10" fill="${c}" opacity="0.25"/>`),

  streetlight: (c) =>
    frame(`${road}
    <rect x="600" y="140" width="12" height="300" fill="#5C6F6F"/>
    <path d="M606 145 q0 -30 -60 -30 h-30" stroke="#5C6F6F" stroke-width="10" fill="none"/>
    <rect x="490" y="108" width="54" height="20" rx="6" fill="#4A5A5A"/>
    <path d="M500 128 l-6 18 M520 128 l2 22 M538 128 l8 16" stroke="${c}" stroke-width="4" opacity="0.6"/>
    <circle cx="517" cy="160" r="40" fill="${c}" opacity="0.08"/>
    <path d="M598 300 l16 -10 l-16 -8" stroke="#1A2C30" stroke-width="3" fill="none"/>`),

  dumping: (c) =>
    frame(`
    <rect x="0" y="380" width="${W}" height="40" fill="#4A5D5C"/>
    <ellipse cx="300" cy="470" rx="80" ry="60" fill="#1D2A2C"/><ellipse cx="400" cy="455" rx="95" ry="75" fill="#263638"/>
    <ellipse cx="510" cy="480" rx="70" ry="50" fill="#1D2A2C"/>
    <rect x="560" y="410" width="120" height="90" fill="${c}" opacity="0.55" transform="rotate(8 620 455)"/>
    <rect x="200" y="500" width="70" height="30" fill="#7A8C8A" transform="rotate(-12 235 515)"/>
    <circle cx="450" cy="420" r="8" fill="${c}"/><circle cx="350" cy="430" r="5" fill="#C9D3D1"/>
    <path d="M390 380 q10 -14 20 0" stroke="#1D2A2C" stroke-width="6" fill="none"/>`),

  drainage: (c) =>
    frame(`
    <rect x="0" y="380" width="${W}" height="220" fill="#34494A"/>
    <rect x="0" y="430" width="${W}" height="70" fill="#1B2729"/>
    <path d="M0 440 q100 -12 200 0 t200 0 t200 0 t200 0 v60 h-800z" fill="${c}" opacity="0.45"/>
    <g stroke="#5C6F6F" stroke-width="6"><line x1="300" y1="440" x2="300" y2="500"/><line x1="330" y1="440" x2="330" y2="500"/><line x1="360" y1="440" x2="360" y2="500"/><line x1="390" y1="440" x2="390" y2="500"/></g>
    <ellipse cx="520" cy="470" rx="60" ry="14" fill="#263638"/><ellipse cx="560" cy="462" rx="24" ry="8" fill="#7A8C8A"/>
    <rect x="0" y="500" width="${W}" height="100" fill="#3E5253"/>`),

  sidewalk: (c) =>
    frame(`
    <g stroke="#2B3B3E" stroke-width="4">
      <rect x="0" y="380" width="${W}" height="220" fill="#6B7D7B"/>
      <line x1="0" y1="450" x2="800" y2="450"/><line x1="0" y1="525" x2="800" y2="525"/>
      <line x1="160" y1="380" x2="140" y2="600"/><line x1="320" y1="380" x2="310" y2="600"/>
      <line x1="480" y1="380" x2="490" y2="600"/><line x1="640" y1="380" x2="660" y2="600"/>
    </g>
    <polygon points="330,460 470,450 480,520 340,530" fill="#2B3B3E"/>
    <polygon points="350,470 455,462 440,505 360,512" fill="#1D2A2C"/>
    <path d="M330 460 l-40 -30 M470 450 l50 -40 M480 520 l40 30" stroke="#2B3B3E" stroke-width="5"/>
    <rect x="410" y="480" width="40" height="24" fill="${c}" opacity="0.5" transform="rotate(-20 430 492)"/>`),

  signage: (c) =>
    frame(`${road}
    <g transform="rotate(-18 560 440)">
      <rect x="554" y="230" width="12" height="210" fill="#7A8C8A"/>
      <polygon points="560,170 620,230 560,290 500,230" fill="${c}" opacity="0.8"/>
      <polygon points="560,190 600,230 560,270 520,230" fill="none" stroke="#1A2C30" stroke-width="6"/>
    </g>
    <path d="M520 450 l70 -6" stroke="#1A2C30" stroke-width="6" stroke-linecap="round"/>`),

  tree: (c) =>
    frame(`${road}
    <rect x="80" y="250" width="26" height="140" fill="#4A3B30"/>
    <circle cx="93" cy="230" r="60" fill="#2F4A35"/>
    <g transform="rotate(-8 400 470)">
      <rect x="150" y="455" width="460" height="34" rx="16" fill="#5A4636"/>
      <circle cx="640" cy="440" r="70" fill="#38583F"/><circle cx="590" cy="410" r="50" fill="${c}" opacity="0.55"/>
      <circle cx="690" cy="470" r="45" fill="#2F4A35"/>
    </g>`),

  facility: (c) =>
    frame(`
    <rect x="0" y="380" width="${W}" height="220" fill="#3A4F4F"/>
    <rect x="200" y="200" width="400" height="20" fill="#7A8C8A"/>
    <rect x="215" y="220" width="12" height="200" fill="#7A8C8A"/><rect x="573" y="220" width="12" height="200" fill="#7A8C8A"/>
    <polygon points="240,240 420,240 360,330 240,330" fill="${c}" opacity="0.25"/>
    <path d="M420 240 l-30 40 l20 10 l-40 40" stroke="#C9D3D1" stroke-width="3" fill="none"/>
    <rect x="300" y="380" width="200" height="16" fill="#5A4636" transform="rotate(10 400 388)"/>
    <rect x="320" y="396" width="10" height="40" fill="#5C6F6F"/><rect x="470" y="410" width="10" height="26" fill="#5C6F6F"/>`),

  other: (c) =>
    frame(`${road}
    <polygon points="400,330 440,470 360,470" fill="${c}" opacity="0.8"/>
    <rect x="345" y="466" width="110" height="14" fill="${c}" opacity="0.8"/>
    <rect x="378" y="380" width="44" height="14" fill="#E6EDEC"/><rect x="368" y="420" width="64" height="14" fill="#E6EDEC"/>`),
};

export function illustration(category, color) {
  return (scenes[category] || scenes.other)(color);
}
