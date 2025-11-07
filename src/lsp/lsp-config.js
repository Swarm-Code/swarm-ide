/**
 * LSP Server Configurations
 * Defines how to start LSP servers for different languages
 */

export const lspConfigs = {
  javascript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageIds: ['javascript', 'javascriptreact']
  },
  
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageIds: ['typescript', 'typescriptreact']
  },

  python: {
    command: 'pylsp',
    args: [],
    languageIds: ['python']
  },

  // Add more language servers as needed
  // rust: {
  //   command: 'rust-analyzer',
  //   args: [],
  //   languageIds: ['rust']
  // },
  
  // go: {
  //   command: 'gopls',
  //   args: [],
  //   languageIds: ['go']
  // }
};

/**
 * Get LSP config for a language ID
 */
export function getLspConfig(languageId) {
  // Check if there's a direct match
  if (lspConfigs[languageId]) {
    return lspConfigs[languageId];
  }

  // Check if any config supports this language ID
  for (const config of Object.values(lspConfigs)) {
    if (config.languageIds.includes(languageId)) {
      return config;
    }
  }

  return null;
}

/**
 * Check if LSP is available for a language
 */
export function hasLspSupport(languageId) {
  return getLspConfig(languageId) !== null;
}
