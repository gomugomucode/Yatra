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

        // 1. Remove `dark:` prefixes
        content = content.replace(/\bdark:([a-zA-Z0-9\-\_\[\]\#]+)/g, '');

        // 2. Replace hardcoded colors
        content = content.replace(/indigo-600/g, 'orange-600');
        content = content.replace(/#4F46E5/g, '#EA580C');
        
        // 3. Rename `y-purple` to `y-primary` globally
        content = content.replace(/y-purple/g, 'y-primary');

        if (content !== originalContent) {
            await fs.writeFile(file, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
}

updateFiles().catch(console.error);
