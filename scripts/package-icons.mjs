import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

// For Electron packaging: copy non-icon public assets to dist
// Icons are handled via electron-builder extraResources
async function main() {
  console.log('Packaging public assets for production...');
  const startTime = Date.now();

  try {
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    const publicFiles = fs.readdirSync(publicDir);
    
    for (const file of publicFiles) {
      // Skip icon-themes - handled by symlink in dev, electron-builder in prod
      if (file === 'icon-themes') continue;
      
      const src = path.join(publicDir, file);
      const dest = path.join(distDir, file);
      const stat = fs.statSync(src);
      
      if (stat.isDirectory()) {
        copyDir(src, dest);
      } else {
        fs.copyFileSync(src, dest);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✓ Assets packaged in ${(elapsed / 1000).toFixed(2)}s`);
  } catch (err) {
    console.error('Error packaging assets:', err);
    process.exit(1);
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const files = fs.readdirSync(src);
  for (const file of files) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main();
