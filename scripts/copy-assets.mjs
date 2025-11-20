import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

async function copyDir(src, dest) {
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

async function main() {
  console.log('Copying public assets...');
  const startTime = Date.now();

  try {
    // Copy only essential public assets, skip icon-themes
    const publicFiles = fs.readdirSync(publicDir);
    
    for (const file of publicFiles) {
      if (file === 'icon-themes') continue; // Skip heavy icons for now
      
      const src = path.join(publicDir, file);
      const dest = path.join(distDir, file);
      
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        copyDir(src, dest);
      } else {
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
      }
    }

    // Handle icon-themes separately - only copy if they don't exist
    const iconSrc = path.join(publicDir, 'icon-themes');
    const iconDest = path.join(distDir, 'icon-themes');
    
    if (fs.existsSync(iconSrc)) {
      // Only do incremental copy (faster for large folders)
      if (!fs.existsSync(iconDest)) {
        console.log('First time: copying icon-themes (this may take a moment)...');
        copyDir(iconSrc, iconDest);
      } else {
        console.log('Icon-themes already exist, skipping copy');
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✓ Assets copied in ${(elapsed / 1000).toFixed(2)}s`);
  } catch (err) {
    console.error('Error copying assets:', err);
    process.exit(1);
  }
}

main();
