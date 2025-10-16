/**
 * Run this in the DevTools console to enable terminal logging
 */

// Clear logging settings to use config file defaults (blacklist mode)
localStorage.removeItem('ide-settings');

// OR manually enable terminal logs in the current session:
Logger.enable('terminal');
Logger.enable('terminalPanel');
Logger.enable('terminalService');
Logger.enable('terminalPTY');

console.log('✓ Terminal logging enabled! Reload the app or toggle terminal to see logs.');
