// Icons are served from public folder directly, not bundled
// This avoids copying 25GB of SVG files during build
const getIconBasePath = () => {
  // In Electron: use file:// protocol to public folder
  // In dev: Vite serves public/ at root
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    // Electron app - load from public folder relative to app root
    return '../public/icon-themes';
  }
  // Dev server - served by Vite
  return '/icon-themes';
};

export const ICON_THEMES = {
  material: {
    name: 'Material Icons',
    id: 'material',
    description: 'Google Material Design Icons',
    path: `${getIconBasePath()}/material/icons`,
    prefix: '',
    suffix: '.svg',
    defaultFolder: 'folder-admin',
    defaultFile: 'document',
  },
  vscode: {
    name: 'VSCode Icons',
    id: 'vscode',
    description: 'VSCode Icon Theme',
    path: `${getIconBasePath()}/vscode/icons`,
    prefix: 'file_type_',
    suffix: '.svg',
    defaultFolder: 'default_folder',
    defaultFile: 'default_file',
  },
};

const FILE_ICON_MAPPING = {
  // Languages
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  
  // Web
  html: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  
  // Node/Npm
  package: 'npm',
  npm: 'npm',
  yarn: 'yarn',
  
  // Build
  gradle: 'gradle',
  maven: 'maven',
  webpack: 'webpack',
  gulp: 'gulp',
  
  // Markup
  md: 'markdown',
  markdown: 'markdown',
  tex: 'latex',
  
  // Data
  sql: 'database',
  db: 'database',
  csv: 'csv',
  
  // Archives
  zip: 'zip',
  tar: 'tar',
  gz: 'tar',
  rar: 'rar',
  
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  
  // Audio/Video
  mp3: 'audio',
  wav: 'audio',
  mp4: 'video',
  mov: 'video',
  
  // Documents
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  
  // Config
  env: 'gear',
  config: 'gear',
  cfg: 'gear',
  conf: 'conf',
  ini: 'gear',
  toml: 'gear',
  
  // Docker/Compose
  dockerfile: 'docker',
  docker: 'docker',
  
  // Git
  gitignore: 'git',
  gitkeep: 'git',
};

export function loadIconTheme(themeId) {
  // Icons are loaded on-demand when rendering, not preloaded
}

export function unloadIconTheme(themeId) {
  // Icons are loaded on-demand, nothing to unload
}

export function getIconPath(themeId, fileName) {
  const theme = ICON_THEMES[themeId];
  if (!theme) {
    console.error('[iconTheme] Unknown theme:', themeId);
    return null;
  }

  let iconName;

  if (fileName === '..' || fileName === '.') {
    // Parent/current directory
    iconName = theme.defaultFolder;
  } else if (fileName.startsWith('.')) {
    // Hidden files - use generic file icon
    iconName = theme.defaultFile;
  } else {
    // Get extension
    const parts = fileName.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;

    // Map to icon name, fallback to default file
    iconName = ext && FILE_ICON_MAPPING[ext] ? FILE_ICON_MAPPING[ext] : theme.defaultFile;
  }

  const path = `${theme.path}/${theme.prefix}${iconName}${theme.suffix}`;
  console.log('[iconTheme] getIconPath:', {
    themeId,
    fileName,
    iconName,
    path
  });
  return path;
}

export function getFolderIconPath(themeId, folderName) {
  const theme = ICON_THEMES[themeId];
  if (!theme) return null;

  const iconName = theme.defaultFolder;
  const path = `${theme.path}/${theme.prefix}${iconName}${theme.suffix}`;
  return path;
}

export function getDefaultIconPath(themeId, isFolder) {
  const theme = ICON_THEMES[themeId];
  if (!theme) return null;

  const iconName = isFolder ? theme.defaultFolder : theme.defaultFile;
  const path = `${theme.path}/${theme.prefix}${iconName}${theme.suffix}`;
  return path;
}
