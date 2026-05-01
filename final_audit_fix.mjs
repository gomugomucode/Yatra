import fs from 'fs/promises';
import path from 'path';

const projectRoot = 'c:\\Users\\Anupam Baral\\Desktop\\Yatra';

async function walkDir(dir) {
    let results = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await walkDir(fullPath));
        } else {
            if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

const DARK_BGS = ['bg-slate-900', 'bg-black', 'bg-zinc-900', 'bg-gray-800', 'bg-slate-950', 'bg-zinc-950', 'bg-red-950', 'bg-emerald-950'];
const SECONDARY_BGS = ['bg-slate-800', 'bg-zinc-800', 'bg-gray-800'];
const PRIMARY_COLORS = ['bg-orange-500', 'bg-emerald-500', 'bg-blue-600', 'bg-red-600', 'bg-primary', 'bg-destructive', 'bg-cyan-600', 'bg-orange-600', 'bg-emerald-600', 'bg-blue-500', 'bg-emerald-400'];

async function updateFiles() {
    const allFiles = await walkDir(path.join(projectRoot, 'app'));
    allFiles.push(...await walkDir(path.join(projectRoot, 'components')));

    for (const file of allFiles) {
        if (file.includes('ui\\button.tsx') || file.includes('ui\\badge.tsx')) continue;

        let content = await fs.readFile(file, 'utf8');
        let originalContent = content;

        // 1. Remove `dark:` variants
        content = content.replace(/\bdark:([a-zA-Z0-9\-\_\[\]\#\/\:]+)/g, '');

        // 2. Replace dark backgrounds with white/slate-50
        for (const bg of DARK_BGS) {
            const regex = new RegExp(`\\b${bg}\\b`, 'g');
            content = content.replace(regex, 'bg-white border border-slate-200');
        }
        for (const bg of SECONDARY_BGS) {
            const regex = new RegExp(`\\b${bg}\\b`, 'g');
            content = content.replace(regex, 'bg-slate-50 border border-slate-200');
        }

        // 3. Fix text colors (bulk)
        content = content.replace(/\btext-(gray|slate|zinc)-(400|300|200)\b/g, 'text-slate-600');
        
        // 4. Handle className strings (improved)
        const processClasses = (classes) => {
            let newClasses = classes;
            if (newClasses.includes('text-white')) {
                const hasPrimaryBg = PRIMARY_COLORS.some(bg => newClasses.includes(bg));
                if (!hasPrimaryBg) {
                    newClasses = newClasses.replace(/\btext-white\b/g, 'text-slate-900');
                }
            }
            // Fix dark variants in template literals
            newClasses = newClasses.replace(/\btext-(gray|slate|zinc)-(400|300|200)\b/g, 'text-slate-600');
            newClasses = newClasses.replace(/\bbg-(slate|zinc|gray)-(900|950|800)\b/g, 'bg-white border border-slate-200');
            return newClasses.replace(/\s+/g, ' ').trim();
        };

        // Match className="..." or className={`...`} or className='...'
        content = content.replace(/className=(["'{])(.*?)([}"'])/g, (match, open, inner, close) => {
            if (open === '{') {
                // Template literal or object
                return `className={${inner.replace(/`([^`]*?)`/g, (m, p1) => `\`${processClasses(p1)}\``)}}`;
            }
            return `className=${open}${processClasses(inner)}${close}`;
        });

        // 5. Opacity backgrounds
        content = content.replace(/\bbg-black\/[0-9]+\b/g, 'bg-white/90');
        content = content.replace(/\bbg-slate-900\/[0-9]+\b/g, 'bg-white/90');
        
        // 6. Gradients (Common patterns)
        content = content.replace(/from-slate-900\/50 to-slate-800\/50/g, 'from-white to-slate-50');
        content = content.replace(/from-slate-900 to-slate-800/g, 'from-white to-slate-50');
        content = content.replace(/bg-red-950/g, 'bg-white border-2 border-red-200');

        if (content !== originalContent) {
            await fs.writeFile(file, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
}

updateFiles().catch(console.error);
