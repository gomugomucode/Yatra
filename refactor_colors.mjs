import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'app', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// A calmer, premium daytime palette
const palette = {
  base: '#F5F7FA',        // main background
  section: '#EEF4FA',     // alternate section background
  surface: '#FFFFFF',     // cards / panels
  surfaceSoft: '#F8FAFC',  // soft card tint
  border: '#D7DFE8',      // borders/dividers
  text: '#1E293B',        // main text
  textMuted: '#64748B',   // secondary text
  primary: '#0F766E',     // teal
  primaryHover: '#115E59',
  primarySoft: '#CCFBF1',
  secondary: '#4F46E5',   // indigo
  secondarySoft: '#E0E7FF',
  accent: '#F59E0B',      // amber
  accentSoft: '#FEF3C7',
  heroFrom: '#0F766E',
  heroVia: '#0EA5E9',
  heroTo: '#4F46E5',
};

// Helper
const swap = (from, to) => {
  content = content.replace(from, to);
};

// Base container
swap(
  /bg-white text-slate-900 font-sans selection:bg-orange-100 selection:text-orange-900/g,
  `bg-[${palette.base}] text-[${palette.text}] font-sans selection:bg-[${palette.primarySoft}] selection:text-[${palette.primary}]`
);

// Navbar / header
swap(
  /bg-white\/80 backdrop-blur-xl border-b border-slate-100/g,
  `bg-[${palette.base}]/80 backdrop-blur-xl border-b border-[${palette.border}]`
);
swap(
  /md:hidden bg-white border-b/g,
  `md:hidden bg-[${palette.base}] border-b border-[${palette.border}]`
);

// Replace orange system with a richer mixed palette
const replacements = [
  [/text-slate-900/g, 'text-slate-800'],
  [/text-slate-800/g, 'text-slate-800'],
  [/text-slate-700/g, 'text-slate-700'],
  [/text-slate-600/g, 'text-slate-600'],

  // Background layers
  [/bg-slate-50\/50/g, `bg-[${palette.section}]/40`],
  [/bg-slate-50/g, `bg-[${palette.surfaceSoft}]`],
  [/bg-white\/50/g, `bg-[${palette.surface}]/50`],
  [/bg-white\/60/g, `bg-[${palette.surface}]/60`],

  // Keep pure white only for actual cards/surfaces
  [/bg-white/g, `bg-[${palette.surface}]`],

  // Primary action colors
  [/bg-orange-500/g, `bg-[${palette.primary}]`],
  [/hover:bg-orange-600/g, `hover:bg-[${palette.primaryHover}]`],
  [/text-orange-500/g, `text-[${palette.primary}]`],
  [/text-orange-600/g, `text-[${palette.primaryHover}]`],
  [/text-orange-700/g, 'text-teal-800'],
  [/hover:text-orange-500/g, `hover:text-[${palette.primary}]`],
  [/border-orange-500/g, `border-[${palette.primary}]`],
  [/border-orange-300\/50/g, `border-[${palette.primary}]/50`],
  [/shadow-orange-200/g, 'shadow-teal-200/50'],
  [/shadow-orange-100\/50/g, 'shadow-teal-100/50'],

  // Soft accent surfaces
  [/bg-orange-50\/50/g, `bg-[${palette.primarySoft}]/35`],
  [/bg-orange-50/g, `bg-[${palette.primarySoft}]`],
  [/bg-orange-100\/10/g, `bg-[${palette.primarySoft}]/10`],
  [/bg-orange-100/g, `bg-[${palette.accentSoft}]`],
  [/text-orange-100/g, `text-[${palette.primarySoft}]`],
  [/text-orange-200/g, 'text-teal-200'],

  // Gradient hero
  [/from-orange-500 via-orange-400 to-orange-600/g, `from-[${palette.heroFrom}] via-[${palette.heroVia}] to-[${palette.heroTo}]`],

  // Secondary accent for contrast
  [/bg-blue-50\/50/g, `bg-[${palette.secondarySoft}]/35`],
  [/text-blue-500/g, `text-[${palette.secondary}]`],
  [/text-blue-600/g, `text-[${palette.secondary}]`],
  [/border-blue-200/g, `border-[${palette.secondarySoft}]`],

  // Selection
  [/selection:bg-orange-100/g, `selection:bg-[${palette.primarySoft}]`],
  [/selection:text-orange-900/g, `selection:text-[${palette.primary}]`],
];

for (const [regex, replacement] of replacements) {
  content = content.replace(regex, replacement);
}

// Replace specific section backgrounds with layered off-whites
content = content.replace(
  /section className="relative pt-24 pb-32 overflow-hidden bg-white"/g,
  `section className="relative pt-24 pb-32 overflow-hidden bg-[${palette.base}]"`
);

content = content.replace(
  /section id="ride" className="py-32 bg-white overflow-hidden"/g,
  `section id="ride" className="py-32 bg-[${palette.section}] overflow-hidden"`
);

content = content.replace(
  /footer className="bg-white border-t/g,
  `footer className="bg-[${palette.base}] border-t border-[${palette.border}]`
);

// Optional: make cards feel elevated and polished
content = content.replace(
  /shadow-lg/g,
  'shadow-md'
);
content = content.replace(
  /shadow-xl/g,
  'shadow-lg'
);

// Add slightly softer border color where possible
content = content.replace(
  /border-slate-100/g,
  `border-[${palette.border}]`
);
content = content.replace(
  /border-slate-200/g,
  `border-[${palette.border}]`
);

// Add more readable muted text
content = content.replace(
  /text-slate-500/g,
  `text-[${palette.textMuted}]`
);

// Better hover feel on interactive elements
content = content.replace(
  /hover:shadow-orange-200/g,
  'hover:shadow-teal-200/40'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully applied premium layered theme to app/page.tsx');