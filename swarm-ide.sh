#!/bin/bash
# Swarm IDE launcher with cache clearing

echo "Clearing Electron cache..."
rm -rf ~/.config/swarm-ide/Cache
rm -rf ~/.config/swarm-ide/Code\ Cache
rm -rf ~/.config/swarm-ide/GPUCache

echo "Starting Swarm IDE..."
npm run dev
