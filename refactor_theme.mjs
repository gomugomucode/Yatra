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
            if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

async function updateFiles() {
    const appFiles = await walkDir(path.join(projectRoot, 'app'));
    const compFiles = await walkDir(path.join(projectRoot, 'components'));
    const allFiles = [...appFiles, ...compFiles];

    for (const file of allFiles) {
        let content = await fs.readFile(file, 'utf8');
        let originalContent = content;

        // 1. Remove `dark:` prefixes (e.g. `dark:bg-gray-800`, `dark:hover:text-white`)
        content = content.replace(/\bdark:([a-zA-Z0-9\-\_\[\]\#]+)/g, '');

        // Clean up possible multiple spaces left behind by removal
        content = content.replace(/\s{2,}/g, ' ');

        // 2. Replace hardcoded colors
        content = content.replace(/indigo-600/g, 'orange-600');
        // If there's an exact match for #4F46E5 (which is indigo-600) -> orange-600 #EA580C
        content = content.replace(/#4F46E5/g, '#EA580C');
        
        // 3. Rename `y-purple` to `y-primary` globally
        // This covers `y-purple`, `bg-y-purple`, `text-y-purple`, `--color-y-purple`, etc.
        content = content.replace(/y-purple/g, 'y-primary');

        // Note: For globals.css, we also need to update the actual color values.
        if (file.endsWith('globals.css')) {
            // Backgrounds and Surfaces
            content = content.replace(/--y-bg:\s*#[a-fA-F0-9]+;?/g, '--y-bg: #FFFFFF;');
            content = content.replace(/--y-surface:\s*#[a-fA-F0-9]+;?/g, '--y-surface: #F9FAFB;');
            content = content.replace(/--y-surface-2:\s*#[a-fA-F0-9]+;?/g, '--y-surface-2: #F3F4F6;');

            // Text
            content = content.replace(/--y-text-1:\s*#[a-fA-F0-9]+;?/g, '--y-text-1: #111827;');
            content = content.replace(/--y-text-2:\s*#[a-fA-F0-9]+;?/g, '--y-text-2: #4B5563;');
            content = content.replace(/--y-text-hint:\s*#[a-fA-F0-9]+;?/g, '--y-text-hint: #6B7280;');

            // Borders
            content = content.replace(/--y-border:\s*#[a-fA-F0-9]+;?/g, '--y-border: #E5E7EB;');
            content = content.replace(/--y-border-strong:\s*#[a-fA-F0-9]+;?/g, '--y-border-strong: #D1D5DB;');

            // Primary (was purple, now orange)
            content = content.replace(/--y-primary:\s*#[a-fA-F0-9]+;?/g, '--y-primary: #F97316;');
            content = content.replace(/--y-primary-bg:\s*#[a-fA-F0-9]+;?/g, '--y-primary-bg: #FFF7ED;');
            content = content.replace(/--y-primary-text:\s*#[a-fA-F0-9]+;?/g, '--y-primary-text: #C2410C;');

            // Remove empty [data-theme="dark"] properties if they are redundant, but we already handled changing values.
        }

        if (content !== originalContent) {
            await fs.writeFile(file, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
}

updateFiles().catch(console.error);
