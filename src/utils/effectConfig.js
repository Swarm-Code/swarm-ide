/**
 * Effect Configuration Utility
 * 
 * Provides standard configuration types and defaults for all animation effects.
 * Enables flexible, composable effect configurations with sensible defaults.
 */

/**
 * Base effect configuration with common timing properties
 */
export const baseEffectConfig = {
  // Animation timing
  duration: 3000, // ms
  frameRate: 60, // frames per second
  easing: 'easeInOutQuad', // easing function
  
  // Character animation
  charAnimationDuration: 100, // ms per character
  randomness: 0.1, // 0-1 multiplier for random variations
  
  // Lifecycle
  autoStart: true,
  loop: false,
};

/**
 * Symbol sets for various effect types
 */
export const symbolSets = {
  // ASCII art symbols
  blocks: ['█', '▓', '▒', '░', ' '],
  braille: ['⠿', '⠾', '⠽', '⠼', '⠻', '⠺', '⠹', '⠸', '⠷', ' '],
  geometric: ['●', '◆', '■', '▲', '▼', '◄', '►', '◯', ' '],
  
  // Technical symbols
  technical: ['▛', '▜', '▟', '▙', '║', '═', '╬', '╪', ' '],
  
  // Special characters
  ripple: ['◯', '○', '∘', '·', ' '],
  wave: ['∿', '≈', '~', '˜', ' '],
  spark: ['✦', '✧', '★', '✩', '✨', ' '],
  
  // Default
  default: ['⣿', '⠿', '⠾', '⠽', ' '],
};

/**
 * Gradient presets for color animations
 */
export const gradientPresets = {
  rainbow: [
    '#ff0000', '#ff7f00', '#ffff00', '#00ff00',
    '#0000ff', '#4b0082', '#9400d3'
  ],
  
  cyberpunk: [
    '#ff006e', '#fb5607', '#ffbe0b', '#8338ec',
    '#3a86ff', '#06ffa5'
  ],
  
  sunset: [
    '#ff006e', '#fb5607', '#ffbe0b', '#ffd60a',
    '#ffc300', '#ff9500'
  ],
  
  ocean: [
    '#0077be', '#0096ff', '#00b4ff', '#00d4ff',
    '#5ddfff', '#00ffff'
  ],
  
  forest: [
    '#1b4332', '#2d6a4f', '#40916c', '#52b788',
    '#74c69d', '#95d5b2'
  ],
  
  monochrome: [
    '#1a1a1a', '#333333', '#666666', '#999999',
    '#cccccc', '#ffffff'
  ],
  
  neon: [
    '#ff006e', '#8338ec', '#3a86ff', '#06ffa5',
    '#ffbe0b', '#fb5607'
  ],
};

/**
 * Easing functions for smooth animations
 */
export const easingFunctions = {
  linear: (t) => t,
  
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1,
  
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
  
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  
  easeInCirc: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  
  easeInElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)),
  easeOutElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  easeInOutElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1,
  
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  
  easeInBounce: (t) => 1 - easingFunctions.easeOutBounce(1 - t),
  easeInOutBounce: (t) => t < 0.5 ? (1 - easingFunctions.easeOutBounce(1 - 2 * t)) / 2 : (1 + easingFunctions.easeOutBounce(2 * t - 1)) / 2,
};

/**
 * Animation phase definitions
 */
export const animationPhases = {
  INITIALIZATION: 'initialization',
  ANIMATION: 'animation',
  COMPLETION: 'completion',
  IDLE: 'idle',
};

/**
 * Character state template
 */
export const characterStateTemplate = {
  symbol: ' ',
  color: '#ffffff',
  position: { x: 0, y: 0 },
  phase: 0,
  opacity: 1,
  scale: 1,
  rotation: 0,
  velocity: { x: 0, y: 0 },
  metadata: {}, // effect-specific data
};

/**
 * Timing information template
 */
export const timingTemplate = {
  frameCount: 0,
  currentPhase: animationPhases.INITIALIZATION,
  elapsedTime: 0,
  progress: 0, // 0-1
  delta: 0, // milliseconds since last frame
  timestamp: 0,
};

/**
 * Effect configuration factory with preset defaults
 * @param {string} effectType - Type of effect (e.g., 'typewriter', 'matrix', 'glitch')
 * @param {object} customConfig - Custom configuration overrides
 * @returns {object} Complete effect configuration
 */
export function createEffectConfig(effectType = 'default', customConfig = {}) {
  const typeDefaults = {
    typewriter: {
      ...baseEffectConfig,
      duration: 2000,
      charAnimationDuration: 50,
      symbolSet: 'default',
    },
    matrix: {
      ...baseEffectConfig,
      duration: 4000,
      charAnimationDuration: 80,
      symbolSet: 'blocks',
      randomness: 0.3,
    },
    glitch: {
      ...baseEffectConfig,
      duration: 1500,
      charAnimationDuration: 30,
      symbolSet: 'geometric',
      randomness: 0.5,
    },
    ripple: {
      ...baseEffectConfig,
      duration: 2500,
      charAnimationDuration: 100,
      symbolSet: 'ripple',
      randomness: 0.2,
    },
    wave: {
      ...baseEffectConfig,
      duration: 3000,
      charAnimationDuration: 120,
      symbolSet: 'wave',
      randomness: 0.15,
    },
    sparkle: {
      ...baseEffectConfig,
      duration: 2000,
      charAnimationDuration: 60,
      symbolSet: 'spark',
      randomness: 0.4,
    },
  };

  const config = {
    ...baseEffectConfig,
    ...(typeDefaults[effectType] || {}),
    ...customConfig,
  };

  return config;
}

/**
 * Get easing function by name
 * @param {string} easingName - Name of easing function
 * @returns {function} Easing function
 */
export function getEasingFunction(easingName = 'easeInOutQuad') {
  return easingFunctions[easingName] || easingFunctions.linear;
}

/**
 * Get symbol set by name
 * @param {string} symbolSetName - Name of symbol set
 * @returns {array} Array of symbols
 */
export function getSymbolSet(symbolSetName = 'default') {
  return symbolSets[symbolSetName] || symbolSets.default;
}

/**
 * Get gradient colors by preset name
 * @param {string} gradientName - Name of gradient preset
 * @returns {array} Array of color strings
 */
export function getGradient(gradientName = 'rainbow') {
  return gradientPresets[gradientName] || gradientPresets.rainbow;
}

/**
 * Interpolate between two values with easing
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} progress - Progress 0-1
 * @param {function} easingFn - Easing function
 * @returns {number} Interpolated value
 */
export function interpolateValue(start, end, progress, easingFn = easingFunctions.linear) {
  const easedProgress = easingFn(Math.min(1, Math.max(0, progress)));
  return start + (end - start) * easedProgress;
}

/**
 * Interpolate between two colors
 * @param {string} startColor - Hex color string
 * @param {string} endColor - Hex color string
 * @param {number} progress - Progress 0-1
 * @returns {string} Interpolated hex color
 */
export function interpolateColor(startColor, endColor, progress) {
  const easedProgress = Math.min(1, Math.max(0, progress));
  
  // Parse hex colors
  const start = parseInt(startColor.slice(1), 16);
  const end = parseInt(endColor.slice(1), 16);
  
  // Extract RGB components
  const sr = (start >> 16) & 255;
  const sg = (start >> 8) & 255;
  const sb = start & 255;
  
  const er = (end >> 16) & 255;
  const eg = (end >> 8) & 255;
  const eb = end & 255;
  
  // Interpolate
  const r = Math.round(sr + (er - sr) * easedProgress);
  const g = Math.round(sg + (eg - sg) * easedProgress);
  const b = Math.round(sb + (eb - sb) * easedProgress);
  
  // Convert back to hex
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Select color from gradient based on progress
 * @param {array} gradient - Array of color strings
 * @param {number} progress - Progress 0-1
 * @returns {string} Selected color
 */
export function selectFromGradient(gradient, progress) {
  if (!Array.isArray(gradient) || gradient.length === 0) {
    return '#ffffff';
  }
  
  const clamped = Math.min(1, Math.max(0, progress));
  const index = clamped * (gradient.length - 1);
  const floorIndex = Math.floor(index);
  const ceilIndex = Math.ceil(index);
  const localProgress = index - floorIndex;
  
  if (floorIndex === ceilIndex) {
    return gradient[floorIndex];
  }
  
  return interpolateColor(gradient[floorIndex], gradient[ceilIndex], localProgress);
}

/**
 * Generate random value with optional bounds
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random value between min and max
 */
export function randomValue(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

/**
 * Generate random color
 * @returns {string} Random hex color
 */
export function randomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

/**
 * Create character state with defaults
 * @param {object} overrides - Properties to override
 * @returns {object} Complete character state
 */
export function createCharacterState(overrides = {}) {
  return {
    ...characterStateTemplate,
    ...overrides,
  };
}

/**
 * Create timing state with defaults
 * @param {object} overrides - Properties to override
 * @returns {object} Complete timing state
 */
export function createTimingState(overrides = {}) {
  return {
    ...timingTemplate,
    ...overrides,
  };
}
