import { outputStore } from './stores/outputStore.js';

/**
 * Initialize console log capturing
 * Intercepts console.log, console.warn, console.error
 */
export function initializeLogCapture() {
  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Override console.log
  console.log = function(...args) {
    originalLog.apply(console, args);
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    outputStore.addLog(message, 'log', 'renderer');
  };

  // Override console.warn
  console.warn = function(...args) {
    originalWarn.apply(console, args);
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    outputStore.addLog(message, 'warn', 'renderer');
  };

  // Override console.error
  console.error = function(...args) {
    originalError.apply(console, args);
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    outputStore.addLog(message, 'error', 'renderer');
  };
}
