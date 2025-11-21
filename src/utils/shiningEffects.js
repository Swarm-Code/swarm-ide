/**
 * Shining Effects System
 * Provides text weight animation and brightness modulation for visual shining effects
 */

export const SolidColors = {
  GOLD: '#eda000',
  CYAN: '#00d4ff',
  GREEN: '#00ff00',
  PURPLE: '#d946ef',
  BLUE: '#3b82f6',
  WHITE: '#ffffff',
  MAGENTA: '#ff00ff'
};

/**
 * Calculate font weight based on shining wave progress
 * Creates bold → normal → light effect
 * @param {number} progress - 0 to 1 wave progress
 * @param {number} index - character index
 * @param {number} totalChars - total characters
 * @returns {number} font weight (100-900)
 */
export function calculateFontWeight(progress, index, totalChars) {
  // Create wave that travels across characters
  const delay = index / totalChars;
  const adjustedProgress = (progress - delay + 1) % 1;
  
  // Wave from bold (700) → normal (400) → light (300)
  const wavePhase = Math.sin(adjustedProgress * Math.PI);
  const weight = 400 + wavePhase * 250; // 150-650
  
  return Math.round(weight);
}

/**
 * Calculate text shadow blur for shining effect
 * Creates glow that follows the shining wave
 * @param {number} progress - 0 to 1 wave progress
 * @param {number} index - character index
 * @param {number} totalChars - total characters
 * @returns {string} CSS text-shadow value
 */
export function calculateShiningShadow(progress, index, totalChars, color) {
  const delay = index / totalChars;
  const adjustedProgress = (progress - delay + 1) % 1;
  
  // Shadow strength follows the shining wave
  const strength = Math.sin(adjustedProgress * Math.PI);
  const blurRadius = 10 + strength * 15;
  const shadowColor = color.replace(/[0-9a-f]{2}$/i, (hex) => {
    const val = Math.round(parseInt(hex, 16) * (0.3 + strength * 0.7));
    return val.toString(16).padStart(2, '0');
  });
  
  return `0 0 ${blurRadius}px ${shadowColor}`;
}

/**
 * Calculate brightness modulation for shining effect
 * Makes text appear to glow/dim in waves
 * @param {number} progress - 0 to 1 wave progress
 * @param {number} index - character index
 * @param {number} totalChars - total characters
 * @returns {number} brightness multiplier (0.6-1.3)
 */
export function calculateBrightness(progress, index, totalChars) {
  const delay = index / totalChars;
  const adjustedProgress = (progress - delay + 1) % 1;
  
  const brightness = 0.7 + Math.sin(adjustedProgress * Math.PI) * 0.6;
  return brightness;
}

/**
 * Calculate filter effect for color shifting shining
 * @param {number} progress - 0 to 1 wave progress
 * @param {number} index - character index
 * @param {number} totalChars - total characters
 * @returns {string} CSS filter value
 */
export function calculateShiningFilter(progress, index, totalChars) {
  const brightness = calculateBrightness(progress, index, totalChars);
  const saturation = 0.8 + Math.sin((progress - index / totalChars + 1) % 1 * Math.PI) * 0.5;
  
  return `brightness(${brightness}) saturate(${saturation})`;
}

/**
 * Create character shining state for rendering
 * @param {string} char - single character
 * @param {number} progress - animation progress 0-1
 * @param {number} index - character index
 * @param {number} totalChars - total characters
 * @param {string} color - solid color
 * @returns {object} character rendering state
 */
export function createShiningCharacter(char, progress, index, totalChars, color) {
  return {
    char,
    color,
    fontWeight: calculateFontWeight(progress, index, totalChars),
    textShadow: calculateShiningShadow(progress, index, totalChars, color),
    brightness: calculateBrightness(progress, index, totalChars),
    filter: calculateShiningFilter(progress, index, totalChars),
    opacity: 0.8 + Math.sin((progress - index / totalChars + 1) % 1 * Math.PI) * 0.2
  };
}

/**
 * Interpolate between two colors
 * @param {string} color1 - hex color
 * @param {string} color2 - hex color
 * @param {number} factor - 0-1
 * @returns {string} interpolated hex color
 */
export function interpolateColor(color1, color2, factor) {
  const c1 = parseInt(color1.replace('#', ''), 16);
  const c2 = parseInt(color2.replace('#', ''), 16);

  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;

  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;

  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Create wave-based color animation
 * Shifts hue along wave front
 * @param {string} baseColor - base solid color
 * @param {number} progress - 0-1 animation progress
 * @param {number} index - character index
 * @param {number} totalChars - total characters
 * @param {string} waveColor - color at wave front
 * @returns {string} calculated color
 */
export function calculateWaveColor(baseColor, progress, index, totalChars, waveColor) {
  const delay = index / totalChars;
  const adjustedProgress = (progress - delay + 1) % 1;
  
  // Bright wave color where sin is high, base color elsewhere
  const waveStrength = Math.sin(adjustedProgress * Math.PI);
  return interpolateColor(baseColor, waveColor, waveStrength * 0.4);
}
