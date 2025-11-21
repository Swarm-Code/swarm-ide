export class AnimationFrame {
  constructor(duration = 0) {
    this.duration = duration;
  }

  async wait() {
    return new Promise(resolve => setTimeout(resolve, this.duration));
  }
}

export class AnimationSequence {
  constructor(frames = []) {
    this.frames = frames;
    this.currentFrameIndex = 0;
  }

  addFrame(duration) {
    this.frames.push(new AnimationFrame(duration));
    return this;
  }

  async play(callback) {
    for (let i = 0; i < this.frames.length; i++) {
      this.currentFrameIndex = i;
      if (callback) {
        callback(i, this.frames.length);
      }
      await this.frames[i].wait();
    }
  }

  reset() {
    this.currentFrameIndex = 0;
  }
}

export const AnimationTimings = {
  FAST_FLICKER: 20,
  MEDIUM_FLICKER: 40,
  SLOW_FLICKER: 60,
  CHARACTER_DELAY: 25,
  LINE_DELAY: 15,
  PHASE_PAUSE: 150,
  RESOLVE_DELAY: 40,
  TRANSITION_DELAY: 200
};

export function createDecryptSequence(
  lineCount,
  characterCount,
  options = {}
) {
  const {
    lineShowDelay = AnimationTimings.LINE_DELAY,
    typingSpeed = AnimationTimings.CHARACTER_DELAY,
    fastDecryptFrames = 25,
    fastDecryptSpeed = AnimationTimings.FAST_FLICKER,
    slowDecryptSpeed = AnimationTimings.RESOLVE_DELAY
  } = options;

  const sequence = new AnimationSequence();

  // Phase 1: Show character lines
  for (let i = 0; i < lineCount; i++) {
    sequence.addFrame(lineShowDelay);
  }
  sequence.addFrame(AnimationTimings.PHASE_PAUSE);

  // Phase 2: Type characters
  for (let i = 0; i < characterCount; i++) {
    sequence.addFrame(typingSpeed);
  }
  sequence.addFrame(AnimationTimings.PHASE_PAUSE);

  // Phase 3: Fast decrypt
  for (let i = 0; i < fastDecryptFrames; i++) {
    sequence.addFrame(fastDecryptSpeed);
  }
  sequence.addFrame(AnimationTimings.PHASE_PAUSE);

  // Phase 4: Slow resolve
  for (let i = 0; i < characterCount + 10; i++) {
    sequence.addFrame(slowDecryptSpeed);
  }
  sequence.addFrame(AnimationTimings.TRANSITION_DELAY);

  return sequence;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

export function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

export function createEase(type = 'linear') {
  const eases = {
    linear: (t) => t,
    easeInOutCubic,
    easeOutQuart,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t)
  };
  return eases[type] || eases.linear;
}
