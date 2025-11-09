#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the path to the electron executable
const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
const mainPath = path.join(__dirname, 'main.mjs');

// Launch Electron with the main.mjs file
const electron = spawn(electronPath, [mainPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(), // Use current working directory
});

electron.on('close', (code) => {
  process.exit(code);
});
