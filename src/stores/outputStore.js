import { writable } from 'svelte/store';

function createOutputStore() {
  const { subscribe, set, update } = writable({
    logs: [],
    filters: {
      level: 'all', // 'all', 'log', 'warn', 'error'
      source: 'all', // 'all', 'renderer', 'main', 'icon-debug', 'pdf-debug'
      search: ''
    }
  });

  return {
    subscribe,
    addLog: (message, level = 'log', source = 'renderer') => {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      
      const log = {
        id: Date.now() + Math.random(),
        timestamp,
        message,
        level,
        source
      };

      update(state => ({
        ...state,
        logs: [log, ...state.logs] // Add to beginning for newest first
      }));
    },
    setLevelFilter: (level) => {
      update(state => ({
        ...state,
        filters: { ...state.filters, level }
      }));
    },
    setSourceFilter: (source) => {
      update(state => ({
        ...state,
        filters: { ...state.filters, source }
      }));
    },
    setSearchFilter: (search) => {
      update(state => ({
        ...state,
        filters: { ...state.filters, search }
      }));
    },
    clearLogs: () => {
      update(state => ({
        ...state,
        logs: []
      }));
    }
  };
}

export const outputStore = createOutputStore();
