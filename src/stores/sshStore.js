import { writable } from 'svelte/store';

function createSSHStore() {
  const { subscribe, set, update } = writable({
    connections: [], // Array of saved SSH connections
    activeConnections: new Map(), // Map of active SSH session data
  });

  return {
    subscribe,
    
    addConnection: (connection) => update((state) => {
      const exists = state.connections.find(c => c.id === connection.id);
      if (exists) {
        return {
          ...state,
          connections: state.connections.map(c => 
            c.id === connection.id ? connection : c
          )
        };
      }
      return {
        ...state,
        connections: [...state.connections, connection]
      };
    }),
    
    removeConnection: (id) => update((state) => ({
      ...state,
      connections: state.connections.filter(c => c.id !== id)
    })),
    
    setActiveConnection: (terminalId, connectionData) => update((state) => {
      const newActiveConnections = new Map(state.activeConnections);
      newActiveConnections.set(terminalId, connectionData);
      return {
        ...state,
        activeConnections: newActiveConnections
      };
    }),
    
    removeActiveConnection: (terminalId) => update((state) => {
      const newActiveConnections = new Map(state.activeConnections);
      newActiveConnections.delete(terminalId);
      return {
        ...state,
        activeConnections: newActiveConnections
      };
    }),
    
    setConnections: (connections) => update((state) => ({
      ...state,
      connections
    }))
  };
}

export const sshStore = createSSHStore();
