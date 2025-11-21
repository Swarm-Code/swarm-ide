# Terminal Text Effects - JavaScript/Svelte Implementation Guide

## Quick Start: Effect Structure

Every TTE effect follows this structure:

### 1. Configuration Class
Defines all parameters with CLI metadata:

```javascript
class DecryptConfig {
  constructor({
    typingSpeed = 2,
    ciphertextColors = ['#008000', '#00cb00', '#00ff00'],
    finalGradientStops = ['#eda000'],
    finalGradientSteps = 12,
    finalGradientDirection = 'vertical'
  } = {}) {
    this.typingSpeed = typingSpeed;
    this.ciphertextColors = ciphertextColors;
    this.finalGradientStops = finalGradientStops;
    this.finalGradientSteps = finalGradientSteps;
    this.finalGradientDirection = finalGradientDirection;
  }
}
```

### 2. Effect Class
Entry point, holds configuration:

```javascript
class Decrypt extends BaseEffect {
  constructor(inputData, effectConfig = null, terminalConfig = null) {
    super(inputData, effectConfig || new DecryptConfig(), terminalConfig);
  }

  *[Symbol.iterator]() {
    return new DecryptIterator(this);
  }
}
```

### 3. Iterator Class
Does the actual animation work:

```javascript
class DecryptIterator extends BaseEffectIterator {
  constructor(effect) {
    super(effect);
    this.phase = 'typing';
    this.encryptedSymbols = this.makeEncryptedSymbols();
    this.scenes = {};
    this.characterFinalColorMap = new Map();
    this.build();
  }

  makeEncryptedSymbols() {
    // Create random cipher alphabet
    const symbols = [];
    for (let i = 33; i < 127; i++) symbols.push(String.fromCharCode(i));
    return symbols;
  }

  build() {
    // Initialize scenes, paths, and character animations
    // Called once during construction
  }

  next() {
    // Called each frame - update effect state
    // Activate/deactivate characters
    // Call this.update() to tick characters
    // Return this.frame for output
    
    if (this.phase === 'typing') {
      // Handle typing phase
    } else if (this.phase === 'decrypting') {
      // Handle decryption phase
    }
    
    this.update();
    return this.frame;
  }

  get frame() {
    // Get current frame (inherited from BaseEffectIterator)
    return this.terminal.getFormattedOutputString();
  }
}
```

---

## Character Animation System

### EffectCharacter Structure

```javascript
class EffectCharacter {
  constructor(characterId, symbol, inputColumn, inputRow) {
    this.characterId = characterId;
    this.inputSymbol = symbol;
    this.inputCoord = new Coord(inputColumn, inputRow);
    this.isVisible = false;
    this.layer = 0;
    
    // Animation system
    this.animation = new Animation(this);
    
    // Motion system
    this.motion = new Motion(this);
    
    // Event handling
    this.eventHandler = new EventHandler(this);
  }

  tick() {
    // Called every frame to update character
    this.motion.move();      // Update position
    this.animation.step();   // Update appearance
  }

  get isActive() {
    // Still animating or moving?
    return !this.animation.isComplete() || !this.motion.isComplete();
  }
}
```

### Animation System (CharacterVisual → Frame → Scene)

#### 1. CharacterVisual: The Display State

```javascript
class CharacterVisual {
  constructor(symbol, {
    bold = false,
    dim = false,
    italic = false,
    underline = false,
    blink = false,
    reverse = false,
    hidden = false,
    strike = false,
    colors = null
  } = {}) {
    this.symbol = symbol;
    this.bold = bold;
    this.dim = dim;
    this.italic = italic;
    this.underline = underline;
    this.blink = blink;
    this.reverse = reverse;
    this.hidden = hidden;
    this.strike = strike;
    this.colors = colors;
    
    // Pre-format the symbol with ANSI sequences
    this.formattedSymbol = this.formatSymbol();
  }

  formatSymbol() {
    let ansiCodes = '';
    
    if (this.bold) ansiCodes += '\x1b[1m';
    if (this.italic) ansiCodes += '\x1b[3m';
    if (this.underline) ansiCodes += '\x1b[4m';
    if (this.blink) ansiCodes += '\x1b[5m';
    if (this.reverse) ansiCodes += '\x1b[7m';
    if (this.hidden) ansiCodes += '\x1b[8m';
    if (this.strike) ansiCodes += '\x1b[9m';
    
    // Add color codes if present
    if (this.colors?.fgColor) {
      ansiCodes += `\x1b[38;2;${this.colors.fgColor.r};${this.colors.fgColor.g};${this.colors.fgColor.b}m`;
    }
    if (this.colors?.bgColor) {
      ansiCodes += `\x1b[48;2;${this.colors.bgColor.r};${this.colors.bgColor.g};${this.colors.bgColor.b}m`;
    }
    
    // Return symbol with codes + reset
    return ansiCodes ? `${ansiCodes}${this.symbol}\x1b[0m` : this.symbol;
  }
}
```

#### 2. Frame: Visual + Duration

```javascript
class Frame {
  constructor(characterVisual, duration) {
    this.characterVisual = characterVisual;
    this.duration = duration; // frames to display
    this.ticksElapsed = 0;    // current frame counter
  }

  tick() {
    this.ticksElapsed++;
    return this.ticksElapsed >= this.duration;
  }
}
```

#### 3. Scene: Sequence of Frames

```javascript
class Scene {
  constructor(sceneId, {
    isLooping = false,
    sync = null,        // 'distance' or 'step'
    ease = null,        // easing function
    noColor = false,
    useXtermColors = false
  } = {}) {
    this.sceneId = sceneId;
    this.isLooping = isLooping;
    this.sync = sync;
    this.ease = ease;
    this.noColor = noColor;
    this.useXtermColors = useXtermColors;
    
    this.frames = [];
    this.playedFrames = [];
    this.frameIndex = 0;
  }

  addFrame(symbol, duration, {
    colors = null,
    bold = false,
    dim = false,
    italic = false,
    underline = false,
    blink = false,
    reverse = false,
    hidden = false,
    strike = false
  } = {}) {
    const visual = new CharacterVisual(symbol, {
      colors, bold, dim, italic, underline, blink, reverse, hidden, strike
    });
    const frame = new Frame(visual, duration);
    this.frames.push(frame);
  }

  activate() {
    // Return first frame's visual
    if (this.frames.length === 0) throw new Error('Scene has no frames');
    return this.frames[0].characterVisual;
  }

  getNextVisual() {
    // Advance frame if duration expired
    const currentFrame = this.frames[0];
    const visual = currentFrame.characterVisual;
    
    if (currentFrame.tick()) {
      this.playedFrames.push(this.frames.shift());
      
      if (this.isLooping && this.frames.length === 0) {
        this.frames.push(...this.playedFrames);
        this.playedFrames = [];
      }
    }
    
    return visual;
  }

  reset() {
    for (const frame of this.frames) {
      frame.ticksElapsed = 0;
      this.playedFrames.push(frame);
    }
    this.frames = this.playedFrames;
    this.playedFrames = [];
  }
}
```

#### 4. Animation: Scene Manager

```javascript
class Animation {
  constructor(character) {
    this.character = character;
    this.scenes = new Map();        // sceneId → Scene
    this.activeScene = null;
    this.currentCharacterVisual = null;
  }

  newScene(sceneId, options = {}) {
    const scene = new Scene(sceneId, options);
    this.scenes.set(sceneId, scene);
    return scene;
  }

  activateScene(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene not found: ${sceneId}`);
    
    this.activeScene = scene;
    this.currentCharacterVisual = scene.activate();
    this.character.isVisible = true;
  }

  deactivateScene() {
    this.activeScene = null;
    this.character.isVisible = false;
  }

  stepAnimation() {
    if (!this.activeScene) return;
    this.currentCharacterVisual = this.activeScene.getNextVisual();
  }

  isComplete() {
    return this.activeScene === null || this.activeScene.frames.length === 0;
  }

  setAppearance(symbol, colors = null) {
    // Immediately set appearance without scene
    this.currentCharacterVisual = new CharacterVisual(symbol, { colors });
    this.character.isVisible = true;
  }
}
```

---

## Character Motion System

### Motion Components

#### 1. Waypoint: Point in Space

```javascript
class Waypoint {
  constructor(waypointId, coord, bezierControl = null) {
    this.waypointId = waypointId;
    this.coord = coord;           // Coord object
    this.bezierControl = bezierControl; // For bezier curves
  }
}
```

#### 2. Segment: Path Between Waypoints

```javascript
class Segment {
  constructor(start, end) {
    this.start = start;
    this.end = end;
    this.distance = this.calculateDistance();
    this.enterEventTriggered = false;
    this.exitEventTriggered = false;
  }

  calculateDistance() {
    // Euclidean or Manhattan distance
    // Use double_row_diff for terminal (rows take 2x space)
    const dx = this.end.coord.x - this.start.coord.x;
    const dy = (this.end.coord.y - this.start.coord.y) * 2;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
```

#### 3. Path: Sequence of Waypoints

```javascript
class Path {
  constructor(pathId, {
    speed = 1.0,
    ease = null,
    layer = null,
    holdTime = 0,
    loop = false
  } = {}) {
    this.pathId = pathId;
    this.speed = speed;           // distance per frame
    this.ease = ease;             // easing function
    this.layer = layer;           // optional layer change
    this.holdTime = holdTime;     // frames to hold at end
    this.loop = loop;
    
    this.waypoints = [];
    this.segments = [];
    this.totalDistance = 0;
    this.currentStep = 0;
    this.maxSteps = 0;
    this.holdTimeRemaining = holdTime;
  }

  newWaypoint(coord, waypointId = '', bezierControl = null) {
    // Auto-generate ID if not provided
    if (!waypointId) {
      waypointId = String(this.waypoints.length);
    }
    
    const waypoint = new Waypoint(waypointId, coord, bezierControl);
    this.waypoints.push(waypoint);
    
    // Add segment if we have 2+ waypoints
    if (this.waypoints.length >= 2) {
      const segment = new Segment(
        this.waypoints[this.waypoints.length - 2],
        waypoint
      );
      this.segments.push(segment);
      this.totalDistance += segment.distance;
      this.maxSteps = Math.round(this.totalDistance / this.speed);
    }
    
    return waypoint;
  }

  step() {
    // Returns next coordinate along path
    // Called each frame to advance movement
    if (this.currentStep >= this.maxSteps) {
      if (this.holdTimeRemaining > 0) {
        this.holdTimeRemaining--;
        return this.waypoints[this.waypoints.length - 1].coord;
      }
      if (this.loop) {
        this.currentStep = 0;
        this.holdTimeRemaining = this.holdTime;
      }
      return null; // path complete
    }
    
    this.currentStep++;
    
    // Calculate distance traveled
    const distanceTraveled = this.currentStep * this.speed;
    
    // Find segment and position within it
    let currentDistance = 0;
    for (const segment of this.segments) {
      if (currentDistance + segment.distance >= distanceTraveled) {
        const progressInSegment = 
          (distanceTraveled - currentDistance) / segment.distance;
        
        // Interpolate between waypoints
        return this.interpolateCoord(
          segment.start.coord,
          segment.end.coord,
          progressInSegment,
          segment.end.bezierControl
        );
      }
      currentDistance += segment.distance;
    }
    
    return this.waypoints[this.waypoints.length - 1].coord;
  }

  interpolateCoord(start, end, progress, bezierControl = null) {
    if (bezierControl) {
      // Bezier interpolation
      return this.bezierPoint(start, end, bezierControl, progress);
    } else {
      // Linear interpolation
      return new Coord(
        Math.round(start.x + (end.x - start.x) * progress),
        Math.round(start.y + (end.y - start.y) * progress)
      );
    }
  }

  bezierPoint(start, end, control, progress) {
    // De Casteljau's algorithm for Bezier curves
    // Simplified for quadratic/cubic beziers
    const t = progress;
    if (control.length === 1) {
      // Quadratic
      const cp = control[0];
      const x = Math.pow(1-t, 2)*start.x + 2*(1-t)*t*cp.x + Math.pow(t, 2)*end.x;
      const y = Math.pow(1-t, 2)*start.y + 2*(1-t)*t*cp.y + Math.pow(t, 2)*end.y;
      return new Coord(Math.round(x), Math.round(y));
    }
    // ... handle other bezier types
  }

  isComplete() {
    return this.currentStep >= this.maxSteps && this.holdTimeRemaining <= 0 && !this.loop;
  }
}
```

#### 4. Motion: Path Manager

```javascript
class Motion {
  constructor(character) {
    this.character = character;
    this.paths = new Map();           // pathId → Path
    this.activePaths = [];
    this.currentCoord = character.inputCoord;
  }

  newPath(pathId, options = {}) {
    const path = new Path(pathId, options);
    this.paths.set(pathId, path);
    return path;
  }

  activatePath(pathId) {
    const path = this.paths.get(pathId);
    if (!path) throw new Error(`Path not found: ${pathId}`);
    this.activePaths.push(path);
    
    // Update layer if specified
    if (path.layer !== null) {
      this.character.layer = path.layer;
    }
  }

  deactivatePath(pathId) {
    this.activePaths = this.activePaths.filter(p => p.pathId !== pathId);
  }

  move() {
    // Step all active paths
    const completedPaths = [];
    
    for (const path of this.activePaths) {
      const nextCoord = path.step();
      if (nextCoord) {
        this.currentCoord = nextCoord;
      } else {
        completedPaths.push(path);
      }
    }
    
    // Remove completed paths
    this.activePaths = this.activePaths.filter(
      p => !completedPaths.includes(p)
    );
  }

  movementIsComplete() {
    return this.activePaths.length === 0;
  }
}
```

---

## Color & Gradient System

### Color Class

```javascript
class Color {
  constructor(rgbHex) {
    // Input: "ffffff" or "#ffffff" or xterm code (0-255)
    if (typeof rgbHex === 'number') {
      // XTerm color
      this.xtermColor = rgbHex;
      this.rgbColor = xtermToRgb(rgbHex);
    } else {
      // RGB hex string
      rgbHex = rgbHex.replace('#', '');
      this.rgbColor = rgbHex;
      this.xtermColor = null;
    }
  }

  get rgbInts() {
    // Returns [r, g, b] as integers 0-255
    const r = parseInt(this.rgbColor.substring(0, 2), 16);
    const g = parseInt(this.rgbColor.substring(2, 4), 16);
    const b = parseInt(this.rgbColor.substring(4, 6), 16);
    return [r, g, b];
  }

  static random() {
    // Generate random color
    const hex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    return new Color(hex);
  }
}
```

### ColorPair

```javascript
class ColorPair {
  constructor(fgColor = null, bgColor = null) {
    this.fgColor = fgColor instanceof Color ? fgColor : 
                   fgColor ? new Color(fgColor) : null;
    this.bgColor = bgColor instanceof Color ? bgColor : 
                   bgColor ? new Color(bgColor) : null;
  }
}
```

### Gradient: Color Spectrum Generator

```javascript
class Gradient {
  static DIRECTION = {
    VERTICAL: 'vertical',
    HORIZONTAL: 'horizontal',
    RADIAL: 'radial',
    DIAGONAL: 'diagonal'
  };

  constructor(stops, steps = 1, loop = false) {
    this.stops = stops;            // Array of Color objects
    this.steps = Array.isArray(steps) ? steps : [steps];
    this.loop = loop;
    this.spectrum = this.generate();
    this.index = 0;
  }

  generate() {
    // Linear interpolation between color stops
    const spectrum = [];
    const stops = this.loop ? [...this.stops, this.stops[0]] : this.stops;
    
    const pairs = [];
    for (let i = 0; i < stops.length - 1; i++) {
      pairs.push([stops[i], stops[i + 1]]);
    }
    
    // Match steps to pairs
    let steps = this.steps;
    if (steps.length < pairs.length) {
      steps = [...steps, ...Array(pairs.length - steps.length).fill(steps[steps.length - 1])];
    }
    
    for (let i = 0; i < pairs.length; i++) {
      const [start, end] = pairs[i];
      const stepCount = steps[i];
      const [sr, sg, sb] = start.rgbInts;
      const [er, eg, eb] = end.rgbInts;
      
      for (let j = 0; j < stepCount; j++) {
        const ratio = j / stepCount;
        const r = Math.round(sr + (er - sr) * ratio);
        const g = Math.round(sg + (eg - sg) * ratio);
        const b = Math.round(sb + (eb - sb) * ratio);
        
        const hex = [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        spectrum.push(new Color(hex));
      }
    }
    
    // Add final color
    spectrum.push(end);
    
    return spectrum;
  }

  getColorAtFraction(fraction) {
    // Get color at position 0-1 in gradient
    if (fraction < 0 || fraction > 1) {
      throw new Error('Fraction must be 0-1');
    }
    const index = Math.min(
      Math.floor(fraction * this.spectrum.length),
      this.spectrum.length - 1
    );
    return this.spectrum[index];
  }

  buildCoordinateColorMapping(minRow, maxRow, minCol, maxCol, direction) {
    // Returns Map<Coord, Color> for gradient in direction
    const mapping = new Map();
    
    if (direction === Gradient.DIRECTION.VERTICAL) {
      const rowRange = maxRow - minRow;
      for (let row = minRow; row <= maxRow; row++) {
        const fraction = (row - minRow) / rowRange;
        const color = this.getColorAtFraction(fraction);
        for (let col = minCol; col <= maxCol; col++) {
          mapping.set(new Coord(col, row), color);
        }
      }
    } else if (direction === Gradient.DIRECTION.HORIZONTAL) {
      const colRange = maxCol - minCol;
      for (let col = minCol; col <= maxCol; col++) {
        const fraction = (col - minCol) / colRange;
        const color = this.getColorAtFraction(fraction);
        for (let row = minRow; row <= maxRow; row++) {
          mapping.set(new Coord(col, row), color);
        }
      }
    } else if (direction === Gradient.DIRECTION.DIAGONAL) {
      // Diagonal: from top-left to bottom-right
      const rowRange = maxRow - minRow;
      const colRange = maxCol - minCol;
      const maxDist = Math.sqrt(rowRange * rowRange + colRange * colRange);
      
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const dist = Math.sqrt(
            Math.pow(row - minRow, 2) + Math.pow(col - minCol, 2)
          );
          const fraction = dist / maxDist;
          const color = this.getColorAtFraction(fraction);
          mapping.set(new Coord(col, row), color);
        }
      }
    }
    // ... handle RADIAL
    
    return mapping;
  }
}
```

---

## Easing Functions

```javascript
class Easing {
  static linear(t) { return t; }
  
  static inSine(t) { return 1 - Math.cos((t * Math.PI) / 2); }
  static outSine(t) { return Math.sin((t * Math.PI) / 2); }
  static inOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  
  static inQuad(t) { return t * t; }
  static outQuad(t) { return 1 - (1 - t) * (1 - t); }
  static inOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  
  static inCubic(t) { return t * t * t; }
  static outCubic(t) { return 1 - Math.pow(1 - t, 3); }
  static inOutCubic(t) { 
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; 
  }
  
  // ... more easing functions
}
```

---

## Terminal Rendering

### Terminal Class

```javascript
class Terminal {
  constructor(inputData, config = null) {
    this.inputData = inputData;
    this.config = config || new TerminalConfig();
    
    // Parse input into grid
    this.characters = this.parseInput(inputData);
    this.grid = this.buildGrid();
  }

  parseInput(text) {
    const characters = [];
    let characterId = 0;
    
    const lines = text.split('\n');
    for (let row = 0; row < lines.length; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        const symbol = lines[row][col];
        characters.push(
          new EffectCharacter(characterId++, symbol, col, row)
        );
      }
    }
    
    return characters;
  }

  buildGrid() {
    // 2D array indexed by [row][col]
    const grid = {};
    for (const char of this.characters) {
      const row = char.inputCoord.y;
      const col = char.inputCoord.x;
      if (!grid[row]) grid[row] = {};
      grid[row][col] = char;
    }
    return grid;
  }

  getFormattedOutputString() {
    // Render all visible characters with formatting
    let output = '';
    
    // Sort characters by layer
    const sorted = [...this.characters].sort((a, b) => a.layer - b.layer);
    
    for (const char of sorted) {
      if (!char.isVisible) continue;
      
      const visual = char.animation.currentCharacterVisual;
      output += visual.formattedSymbol;
    }
    
    return output;
  }

  getCharacters() {
    return this.characters;
  }

  setCharacterVisibility(character, isVisible) {
    character.isVisible = isVisible;
  }
}
```

### TerminalConfig

```javascript
class TerminalConfig {
  constructor({
    tabWidth = 4,
    xtermColors = false,
    noColor = false,
    frameRate = 0,
    canvasWidth = 0,
    canvasHeight = 0,
    existingColorHandling = 'ignore'
  } = {}) {
    this.tabWidth = tabWidth;
    this.xtermColors = xtermColors;
    this.noColor = noColor;
    this.frameRate = frameRate;  // 0 = no limiting
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.existingColorHandling = existingColorHandling;
  }
}
```

---

## Common Effect Patterns

### Pattern 1: Staggered Character Activation

Activate characters with delays:

```javascript
let frameCounter = 0;
const delay = 2; // frames between activations

for (const character of charactersToActivate) {
  if (frameCounter % delay === 0) {
    character.animation.activateScene('appearScene');
    character.motion.activatePath('entryPath');
  }
  frameCounter++;
}
```

### Pattern 2: Grouped Character Operations

Group characters by row/column and operate on groups:

```javascript
const groupByRow = (characters) => {
  const groups = new Map();
  for (const char of characters) {
    const row = char.inputCoord.y;
    if (!groups.has(row)) groups.set(row, []);
    groups.get(row).push(char);
  }
  return groups;
};

const rowGroups = groupByRow(characters);
for (const [row, group] of rowGroups) {
  // Operate on all characters in row
}
```

### Pattern 3: Coordinate-Based Animation

Apply effects based on position:

```javascript
const minRow = Math.min(...characters.map(c => c.inputCoord.y));
const maxRow = Math.max(...characters.map(c => c.inputCoord.y));
const minCol = Math.min(...characters.map(c => c.inputCoord.x));
const maxCol = Math.max(...characters.map(c => c.inputCoord.x));

const colorMapping = gradient.buildCoordinateColorMapping(
  minRow, maxRow, minCol, maxCol, 'vertical'
);

for (const character of characters) {
  const color = colorMapping.get(character.inputCoord);
  character.animation.setAppearance(character.inputSymbol, new ColorPair(color));
}
```

### Pattern 4: Probabilistic Updates

Random chance events per frame:

```javascript
const next() {
  for (const character of this.activeCharacters) {
    if (Math.random() < this.config.symbolSwapChance) {
      // Swap to random symbol
      const randomSymbol = this.symbols[Math.floor(Math.random() * this.symbols.length)];
      character.animation.setAppearance(randomSymbol);
    }
  }
  
  this.update();
  return this.frame;
}
```

---

## Implementation Checklist for Effects

When porting an effect:

- [ ] Create EffectConfig with all parameters
- [ ] Create Effect class inheriting BaseEffect
- [ ] Create EffectIterator inheriting BaseEffectIterator
- [ ] Implement `build()` method:
  - [ ] Create scenes with animation frames
  - [ ] Create paths with waypoints
  - [ ] Register with characters
  - [ ] Set initial properties
- [ ] Implement `next()` method:
  - [ ] Update frame counters/state
  - [ ] Activate/deactivate characters based on logic
  - [ ] Call `this.update()` to tick characters
  - [ ] Return `this.frame`
- [ ] Handle multiple phases (if applicable)
- [ ] Apply gradients and colors
- [ ] Test with various configurations

