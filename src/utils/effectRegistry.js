/**
 * Effect Registry
 * Centralized management of all animation effects
 * Provides effect lookup, random selection, and configuration presets
 */

import LogoAnimator from '../components/LogoAnimator.svelte';
import TypewriterEffect from '../components/effects/TypewriterEffect.svelte';
import MatrixEffect from '../components/effects/MatrixEffect.svelte';
import GlitchEffect from '../components/effects/GlitchEffect.svelte';
import RippleEffect from '../components/effects/RippleEffect.svelte';
import WavesEffect from '../components/effects/WavesEffect.svelte';
import RainEffect from '../components/effects/RainEffect.svelte';
import WipeEffect from '../components/effects/WipeEffect.svelte';
import SlideEffect from '../components/effects/SlideEffect.svelte';

/**
 * Registry of all available effects
 * Maps effect names to their Svelte components
 */
export const effectRegistry = {
  decrypt: LogoAnimator,
  typewriter: TypewriterEffect,
  matrix: MatrixEffect,
  glitch: GlitchEffect,
  ripple: RippleEffect,
  waves: WavesEffect,
  rain: RainEffect,
  wipe: WipeEffect,
  slide: SlideEffect
};

/**
 * Effect metadata and configuration presets
 * Provides default settings and information about each effect
 */
export const effectMetadata = {
  decrypt: {
    name: 'Decrypt',
    description: 'Decryption animation with character reveal',
    difficulty: 'medium',
    durationMs: 3500,
    weight: 1.2,
    defaultConfig: {
      slowFactor: 1,
      targetText: 'SWARM',
      targetSuffix: 'IDE'
    }
  },
  typewriter: {
    name: 'Typewriter',
    description: 'Characters appear sequentially from left to right',
    difficulty: 'easy',
    durationMs: 2500,
    weight: 1.0,
    defaultConfig: {
      duration: 2500,
      symbolSet: 'default'
    }
  },
  matrix: {
    name: 'Matrix',
    description: 'Characters cascade downward with digital distortion',
    difficulty: 'medium',
    durationMs: 4000,
    weight: 1.1,
    defaultConfig: {
      duration: 4000,
      symbolSet: 'blocks',
      randomness: 0.3
    }
  },
  glitch: {
    name: 'Glitch',
    description: 'Characters flicker with position and color corruption',
    difficulty: 'hard',
    durationMs: 2000,
    weight: 0.9,
    defaultConfig: {
      duration: 2000,
      symbolSet: 'geometric',
      randomness: 0.5,
      glitchIntensity: 0.7
    }
  },
  ripple: {
    name: 'Ripple',
    description: 'Characters animate in expanding concentric rings',
    difficulty: 'medium',
    durationMs: 2500,
    weight: 1.0,
    defaultConfig: {
      duration: 2500,
      symbolSet: 'ripple',
      randomness: 0.2,
      centerX: 0.5,
      centerY: 0.5
    }
  },
  waves: {
    name: 'Waves',
    description: 'Characters animate in wave-like patterns',
    difficulty: 'medium',
    durationMs: 3000,
    weight: 1.0,
    defaultConfig: {
      duration: 3000,
      symbolSet: 'wave'
    }
  },
  rain: {
    name: 'Rain',
    description: 'Characters fall like raindrops',
    difficulty: 'easy',
    durationMs: 3500,
    weight: 1.0,
    defaultConfig: {
      duration: 3500
    }
  },
  wipe: {
    name: 'Wipe',
    description: 'Characters appear with a horizontal reveal',
    difficulty: 'easy',
    durationMs: 2000,
    weight: 0.8,
    defaultConfig: {
      duration: 2000
    }
  },
  slide: {
    name: 'Slide',
    description: 'Characters slide in from edges',
    difficulty: 'medium',
    durationMs: 2500,
    weight: 1.0,
    defaultConfig: {
      duration: 2500
    }
  }
};

/**
 * Gets a random effect from the registry based on weighted probabilities
 * @returns {Object} Object containing {component, name, config, metadata}
 */
export function getRandomEffect() {
  const effectNames = Object.keys(effectRegistry);
  
  if (effectNames.length === 0) {
    throw new Error('No effects registered');
  }

  // Calculate weights for each effect
  const weights = effectNames.map(name => {
    const metadata = effectMetadata[name];
    return metadata?.weight ?? 1.0;
  });

  // Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;
  
  let selectedIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      selectedIndex = i;
      break;
    }
  }

  const effectName = effectNames[selectedIndex];
  const component = effectRegistry[effectName];
  const metadata = effectMetadata[effectName];

  return {
    name: effectName,
    component,
    config: { ...metadata.defaultConfig },
    metadata
  };
}

/**
 * Gets configuration for a named effect
 * @param {string} effectName - The name of the effect
 * @returns {Object} Configuration object with defaults
 */
export function getEffectConfig(effectName) {
  const metadata = effectMetadata[effectName];
  
  if (!metadata) {
    console.warn(`Effect "${effectName}" not found in registry`);
    return effectMetadata.decrypt.defaultConfig;
  }

  return { ...metadata.defaultConfig };
}

/**
 * Gets metadata for a named effect
 * @param {string} effectName - The name of the effect
 * @returns {Object} Metadata object containing name, description, difficulty, duration
 */
export function getEffectMetadata(effectName) {
  return effectMetadata[effectName] || null;
}

/**
 * Lists all available effects
 * @returns {Array} Array of effect names
 */
export function listAvailableEffects() {
  return Object.keys(effectRegistry);
}

/**
 * Registers a new effect in the registry
 * @param {string} name - The effect name
 * @param {Component} component - The Svelte component
 * @param {Object} metadata - Effect metadata
 */
export function registerEffect(name, component, metadata) {
  if (!name || !component) {
    throw new Error('Effect name and component are required');
  }

  effectRegistry[name] = component;
  
  const defaultMetadata = {
    name,
    description: 'No description',
    difficulty: 'unknown',
    durationMs: 0,
    weight: 1.0,
    defaultConfig: {}
  };

  effectMetadata[name] = { ...defaultMetadata, ...metadata };
}

/**
 * Gets estimated animation duration for an effect
 * @param {string} effectName - The name of the effect
 * @returns {number} Duration in milliseconds
 */
export function getEffectDuration(effectName) {
  const metadata = effectMetadata[effectName];
  return metadata?.durationMs ?? 0;
}

/**
 * Checks if an effect is registered
 * @param {string} effectName - The name of the effect
 * @returns {boolean} True if effect exists
 */
export function hasEffect(effectName) {
  return effectName in effectRegistry;
}

/**
 * Gets all effects grouped by difficulty
 * @returns {Object} Effects grouped by difficulty level
 */
export function getEffectsByDifficulty() {
  const grouped = {};
  
  Object.entries(effectMetadata).forEach(([name, meta]) => {
    const difficulty = meta.difficulty || 'unknown';
    if (!grouped[difficulty]) {
      grouped[difficulty] = [];
    }
    grouped[difficulty].push(name);
  });
  
  return grouped;
}

/**
 * Gets effects weighted by frequency
 * @returns {Object} Map of effect names to their weights
 */
export function getEffectWeights() {
  const weights = {};
  
  Object.entries(effectMetadata).forEach(([name, meta]) => {
    weights[name] = meta.weight || 1.0;
  });
  
  return weights;
}

/**
 * Gets a summary of all registered effects
 * @returns {Array} Array of effect summaries
 */
export function getEffectSummary() {
  return Object.entries(effectMetadata).map(([name, meta]) => ({
    name,
    displayName: meta.name,
    description: meta.description,
    difficulty: meta.difficulty,
    duration: meta.durationMs,
    weight: meta.weight
  }));
}
