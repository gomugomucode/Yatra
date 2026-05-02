import fs from 'fs';
import path from 'path';

// Define directories to scan
const dirsToScan = ['app', 'components'];

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

let allFiles = [];
dirsToScan.forEach(dir => {
  allFiles = getAllFiles(path.join(process.cwd(), dir), allFiles);
});

const palette = {
  base: 'var(--background)',        // #F5F7FA
  section: 'var(--section)',        // #EEF4FA
  surface: 'var(--surface)',        // #FFFFFF
  surfaceSoft: 'var(--surface-soft)',// #F8FAFC
  border: 'var(--border)',          // #D7DFE8
  text: 'var(--foreground)',        // #1E293B
  textMuted: 'var(--muted-foreground)',// #64748B
  primary: 'var(--primary)',        // #0F766E
  primaryHover: 'var(--primary-hover)',// #115E59
  primarySoft: 'var(--primary-soft)',// #CCFBF1
  secondary: 'var(--secondary)',    // #4F46E5
  secondarySoft: 'var(--secondary-soft)',// #E0E7FF
  accent: 'var(--accent)',          // #F59E0B
  accentSoft: 'var(--accent-soft)',  // #FEF3C7
};

// Replacements tailored for semantic Tailwind mapping
const replacements = [
  // Text colors
  [/text-slate-900/g, 'text-foreground'],
  [/text-slate-800/g, 'text-foreground'],
  [/text-slate-700/g, 'text-foreground/90'],
  [/text-slate-600/g, 'text-muted-foreground'],
  [/text-slate-500/g, 'text-muted-foreground'],
  
  // Primary (Orange -> Teal)
  [/bg-orange-500/g, 'bg-primary'],
  [/hover:bg-orange-600/g, 'hover:bg-primary-hover'],
  [/text-orange-500/g, 'text-primary'],
  [/text-orange-600/g, 'text-primary-hover'],
  [/text-orange-700/g, 'text-primary-hover'],
  [/hover:text-orange-500/g, 'hover:text-primary'],
  [/border-orange-500/g, 'border-primary'],
  [/border-orange-300\/50/g, 'border-primary/50'],
  [/shadow-orange-200/g, 'shadow-primary/20'],
  [/shadow-orange-100\/50/g, 'shadow-primary/10'],
  
  // Primary Soft
  [/bg-orange-50\/50/g, 'bg-primary-soft/50'],
  [/bg-orange-50/g, 'bg-primary-soft'],
  [/bg-orange-100\/10/g, 'bg-primary-soft/10'],
  [/text-orange-100/g, 'text-primary-soft'],
  [/text-orange-200/g, 'text-primary-soft/80'],
  
  // Accent
  [/bg-orange-100/g, 'bg-accent-soft'],
  
  // Background layers
  [/bg-slate-50\/50/g, 'bg-section/40'],
  [/bg-slate-50/g, 'bg-surface-soft'],
  
  // Borders
  [/border-slate-100/g, 'border-border'],
  [/border-slate-200/g, 'border-border'],
  
  // Gradients (Hero)
  [/from-orange-500 via-orange-400 to-orange-600/g, 'from-primary via-sky-500 to-secondary'],
  
  // Selection
  [/selection:bg-orange-100/g, 'selection:bg-primary-soft'],
  [/selection:text-orange-900/g, 'selection:text-primary'],
];

let changedFilesCount = 0;

allFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // General Replacements
  for (const [regex, replacement] of replacements) {
    content = content.replace(regex, replacement);
  }

  // Refine specific white backgrounds
  if (file.includes('page.tsx') || file.includes('layout.tsx')) {
      content = content.replace(/min-h-screen bg-white/g, 'min-h-screen bg-background');
      content = content.replace(/bg-white\/80/g, 'bg-background/80');
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFilesCount++;
    console.log(`Updated: ${file.replace(process.cwd(), '')}`);
  }
});

console.log(`\nSuccessfully applied semantic premium theme to ${changedFilesCount} files.`);
