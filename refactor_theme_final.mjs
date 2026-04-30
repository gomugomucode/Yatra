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

        if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            // 1. Remove `dark:` prefixes but keep the class name safely without breaking lines.
            // This regex matches `dark:` followed by any valid tailwind class characters.
            content = content.replace(/\bdark:([a-zA-Z0-9\-\_\[\]\#\/\:]+)/g, '');
            
            // Clean up double spaces that might have been left behind inside classNames.
            content = content.replace(/className="([^"]+)"/g, (match, p1) => {
                return `className="${p1.replace(/\s+/g, ' ').trim()}"`;
            });
            content = content.replace(/className=\{`([^`]+)`\}/g, (match, p1) => {
                return `className={\`${p1.replace(/\s+/g, ' ').trim()}\`}`;
            });

            // 2. Replace hardcoded dark colors
            content = content.replace(/bg-slate-900/g, 'bg-slate-50');
            content = content.replace(/text-slate-400/g, 'text-slate-500');
        }

        if (file.endsWith('globals.css')) {
            // Replace root variables
            content = content.replace(/--background: #09111f;/g, '--background: #FFFFFF;');
            content = content.replace(/--foreground: #fff8f1;/g, '--foreground: #111827;');
            
            content = content.replace(/--card: #101a2d;/g, '--card: #F9FAFB;');
            content = content.replace(/--card-foreground: #fff8f1;/g, '--card-foreground: #111827;');
            
            content = content.replace(/--popover: #101a2d;/g, '--popover: #F9FAFB;');
            content = content.replace(/--popover-foreground: #fff8f1;/g, '--popover-foreground: #111827;');
            
            content = content.replace(/--primary-foreground: #fff8f1;/g, '--primary-foreground: #FFFFFF;');
            
            content = content.replace(/--secondary: #0ea5e9;/g, '--secondary: #F3F4F6;');
            content = content.replace(/--secondary-foreground: #09111f;/g, '--secondary-foreground: #1F2937;');
            
            content = content.replace(/--muted: #162235;/g, '--muted: #F3F4F6;');
            content = content.replace(/--muted-foreground: #c3cfdf;/g, '--muted-foreground: #6B7280;');
            
            content = content.replace(/--accent: #fb923c;/g, '--accent: #FFF7ED;');
            content = content.replace(/--accent-foreground: #09111f;/g, '--accent-foreground: #C2410C;');
            
            content = content.replace(/--destructive: #f97373;/g, '--destructive: #EF4444;');
            
            content = content.replace(/--border: #24344d;/g, '--border: #E5E7EB;');
            content = content.replace(/--input: #24344d;/g, '--input: #E5E7EB;');
            
            content = content.replace(/--sidebar: #09111f;/g, '--sidebar: #FFFFFF;');
            content = content.replace(/--sidebar-foreground: #eef4ff;/g, '--sidebar-foreground: #111827;');
            content = content.replace(/--sidebar-accent: #162235;/g, '--sidebar-accent: #F3F4F6;');
            content = content.replace(/--sidebar-accent-foreground: #eef4ff;/g, '--sidebar-accent-foreground: #1F2937;');
            content = content.replace(/--sidebar-border: #24344d;/g, '--sidebar-border: #E5E7EB;');

            // Base styles
            content = content.replace(/background-color: #09111f;/g, 'background-color: #FFFFFF;');
            content = content.replace(/background:\s*radial-gradient\([^;]+;/g, 'background: #FFFFFF;');

            // Scrollbar
            content = content.replace(/background-color: #09111f;[\s\n]*\}/g, 'background-color: #F3F4F6;\n}');
            content = content.replace(/background-color: #31425d;/g, 'background-color: #D1D5DB;');
            content = content.replace(/background-color: #4d6489;/g, 'background-color: #9CA3AF;');

            // Web3
            content = content.replace(/background: #09111f;/g, 'background: #FFFFFF;');

            // Hero
            content = content.replace(/background: #030b1a;/g, 'background: #FFFFFF;');
            content = content.replace(/linear-gradient\(170deg, #030b1a 0%, #060d1f 40%, #050c1b 100%\)/g, 'linear-gradient(170deg, #FFFFFF 0%, #F9FAFB 40%, #F3F4F6 100%)');
            
            // Cockpit
            content = content.replace(/background: linear-gradient\(135deg,[\s\n]*rgba\(0, 20, 50, 0\.7\) 0%,[\s\n]*rgba\(5, 15, 35, 0\.8\) 100%\);/g, 'background: #FFFFFF;');
            content = content.replace(/border: 1px solid rgba\(0, 245, 255, 0\.15\);/g, 'border: 1px solid #E5E7EB;');

            // Subtitles
            content = content.replace(/background: linear-gradient\(90deg, #e2e8f0, #94a3b8\);/g, 'background: linear-gradient(90deg, #4B5563, #6B7280);');
            content = content.replace(/color: rgba\(148, 163, 184, 0\.9\);/g, 'color: #4B5563;');

            // Primary Button
            content = content.replace(/background: linear-gradient\(135deg, rgba\(0, 180, 255, 0\.2\), rgba\(0, 100, 200, 0\.3\)\);/g, 'background: var(--primary);');
            content = content.replace(/border: 1px solid rgba\(0, 245, 255, 0\.45\);/g, 'border: 1px solid var(--primary);');
            
            // Driver Button
            content = content.replace(/background: linear-gradient\(135deg, rgba\(15, 20, 30, 0\.8\), rgba\(10, 15, 25, 0\.9\)\);/g, 'background: #FFFFFF;');
            content = content.replace(/color: #94a3b8;/g, 'color: var(--primary);');
            content = content.replace(/border: 1px solid rgba\(100, 116, 139, 0\.4\);/g, 'border: 2px solid var(--primary);');
            
            // Bento cards
            content = content.replace(/background: linear-gradient\(135deg, rgba\(5, 15, 35, 0\.9\) 0%, rgba\(10, 20, 50, 0\.8\) 100%\);/g, 'background: #FFFFFF;');
            content = content.replace(/border: 1px solid rgba\(0, 245, 255, 0\.12\);/g, 'border: 1px solid #E5E7EB;');
        }

        if (content !== originalContent) {
            await fs.writeFile(file, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
}

updateFiles().catch(console.error);
