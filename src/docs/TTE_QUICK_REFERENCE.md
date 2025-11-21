# Terminal Text Effects - Quick Reference

## File Organization

```
src/
├── components/          # Svelte components
├── stores/             # Svelte stores for state
├── services/           # Business logic
├── effects/            # Effect implementations
│   ├── base/          # Base classes
│   ├── decrypt/
│   ├── matrix/
│   ├── rain/
│   ├── wipe/
│   ├── slide/
│   ├── waves/
│   ├── beams/
│   └── print/
├── utils/             # Utilities
│   ├── animation/     # CharacterVisual, Frame, Scene, Animation
│   ├── motion/        # Waypoint, Segment, Path, Motion
│   ├── graphics/      # Color, ColorPair, Gradient
│   ├── easing.js      # Easing functions
│   └── geometry.js    # Coord class
└── docs/              # Documentation
```

## Core Classes Reference

### EffectCharacter
```javascript
character.characterId      // unique ID
character.inputSymbol      // original character
character.inputCoord       // original position
character.animation        // Animation instance
character.motion           // Motion instance
character.eventHandler     // EventHandler instance
character.isVisible        // boolean
character.layer            // z-order
character.tick()           // update per frame
character.isActive         // still animating?
```

### Animation
```javascript
animation.newScene(id, options)
animation.activateScene(id)
animation.deactivateScene()
animation.stepAnimation()        // called every tick
animation.setAppearance(symbol, colors)
animation.currentCharacterVisual
animation.isComplete()
```

### Scene
```javascript
scene.addFrame(symbol, duration, {colors, bold, italic, ...})
scene.activate()                 // called on activation
scene.getNextVisual()           // called every tick
scene.reset()                   // for looping
scene.isLooping
scene.sync                      // 'distance' or 'step'
scene.ease                      // easing function
```

### Motion
```javascript
motion.newPath(id, {speed, ease, loop, holdTime, layer})
motion.activatePath(id)
motion.deactivatePath(id)
motion.move()                   // called every tick
motion.currentCoord
motion.movementIsComplete()
```

### Path
```javascript
path.newWaypoint(coord, id, bezierControl)
path.step()                     // returns next coord
path.isComplete()
path.speed
path.ease
path.loop
path.holdTime
```

### Color & Gradient
```javascript
new Color('#ffffff')
new Color(255)                  // xterm color
color.rgbColor                  // '#ffffff'
color.xtermColor               // 0-255 or null
color.rgbInts                  // [r, g, b]

new Gradient([color1, color2], 10)  // 10-step gradient
gradient.spectrum              // array of colors
gradient.getColorAtFraction(0.5)
gradient.buildCoordinateColorMapping(minRow, maxRow, minCol, maxCol, direction)
```

## Effect Implementation Template

```javascript
// 1. Config
class MyEffectConfig {
  constructor({param1 = 'default', param2 = 5} = {}) {
    this.param1 = param1;
    this.param2 = param2;
  }
}

// 2. Effect
class MyEffect extends BaseEffect {
  constructor(inputData, config = null, terminalConfig = null) {
    super(inputData, config || new MyEffectConfig(), terminalConfig);
  }

  *[Symbol.iterator]() {
    return new MyEffectIterator(this);
  }
}

// 3. Iterator
class MyEffectIterator extends BaseEffectIterator {
  constructor(effect) {
    super(effect);
    this.frameCounter = 0;
    this.build();
  }

  build() {
    // Create scenes and paths
    for (const character of this.terminal.getCharacters()) {
      const scene = character.animation.newScene('main', {isLooping: false});
      scene.addFrame('A', 1);
      scene.addFrame('B', 1);
      
      const path = character.motion.newPath('entry', {speed: 1});
      path.newWaypoint(character.inputCoord);
    }
  }

  next() {
    this.frameCounter++;
    
    // Logic to activate/deactivate characters
    if (this.frameCounter === 1) {
      for (const char of this.terminal.getCharacters()) {
        char.animation.activateScene('main');
        char.motion.activatePath('entry');
      }
    }
    
    // Tick all active characters
    this.update();
    
    // Return rendered frame
    return this.frame;
  }
}
```

## Common Operations

### Activate Character Animation
```javascript
character.animation.newScene('sceneId', {isLooping: true});
character.animation.scenes.get('sceneId').addFrame('symbol', 5);
character.animation.activateScene('sceneId');
```

### Activate Character Motion
```javascript
const path = character.motion.newPath('pathId', {speed: 0.5});
path.newWaypoint(new Coord(0, 0));
path.newWaypoint(new Coord(10, 5));
character.motion.activatePath('pathId');
```

### Apply Gradient to Final Color
```javascript
const gradient = new Gradient(
  [new Color('#ff0000'), new Color('#0000ff')],
  12  // steps
);

const colorMap = gradient.buildCoordinateColorMapping(
  minRow, maxRow, minCol, maxCol,
  'vertical'  // direction
);

for (const character of this.terminal.getCharacters()) {
  const color = colorMap.get(character.inputCoord);
  character.animation.setAppearance(
    character.inputSymbol,
    new ColorPair(color)
  );
}
```

### Group Characters by Row
```javascript
const groups = new Map();
for (const char of this.terminal.getCharacters()) {
  const row = char.inputCoord.y;
  if (!groups.has(row)) groups.set(row, []);
  groups.get(row).push(char);
}

let delayCounter = 0;
for (const [row, group] of groups) {
  for (const char of group) {
    if (delayCounter % 2 === 0) {
      char.animation.activateScene('main');
    }
  }
  delayCounter++;
}
```

### Stagger Activation
```javascript
let activationIndex = 0;
const activationDelay = 3; // frames

for (const char of this.terminal.getCharacters()) {
  if (this.frameCounter === activationIndex * activationDelay) {
    char.animation.activateScene('main');
  }
  activationIndex++;
}
```

### Random Selection
```javascript
const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
const randomColor = colors[Math.floor(Math.random() * colors.length)];
const randomSpeed = minSpeed + Math.random() * (maxSpeed - minSpeed);
```

### Easing in Paths
```javascript
const path = character.motion.newPath('id', {
  speed: 1,
  ease: Easing.outQuad  // Use easing function
});
```

### Check Character Activity
```javascript
// Is character still animating or moving?
if (character.isActive) {
  // Still in progress
}

// Remove inactive characters
this.activeCharacters.delete(character);
```

## Effect Phases Pattern

Many effects have multiple phases:

```javascript
class PhaseIterator extends BaseEffectIterator {
  constructor(effect) {
    super(effect);
    this.phase = 'phase1';  // Track current phase
    this.phaseFrameCounter = 0;
  }

  next() {
    this.phaseFrameCounter++;
    
    if (this.phase === 'phase1') {
      if (this.phaseFrameCounter >= this.config.phase1Duration) {
        this.phase = 'phase2';
        this.phaseFrameCounter = 0;
      }
      // Handle phase1
    } else if (this.phase === 'phase2') {
      // Handle phase2
    }
    
    this.update();
    return this.frame;
  }
}
```

## Performance Tips

1. **Reuse gradients**: Create once, use for multiple characters
2. **Cache coordinate mappings**: Build gradient map once per frame
3. **Batch operations**: Activate groups of characters at once
4. **Avoid allocations in loop**: Pre-create objects before frame loop
5. **Minimize scene/path creation**: Create during build(), not next()

## Color Constants

```javascript
// Web safe colors for effects
const COLORS = {
  RED: new Color('#ff0000'),
  GREEN: new Color('#00ff00'),
  BLUE: new Color('#0000ff'),
  WHITE: new Color('#ffffff'),
  BLACK: new Color('#000000'),
  CYAN: new Color('#00ffff'),
  MAGENTA: new Color('#ff00ff'),
  YELLOW: new Color('#ffff00'),
};
```

## Easing Function Quick Reference

```
Linear:           linear progression
Sine:             smooth S-curve
Quad:             moderate acceleration
Cubic:            stronger acceleration
Quart:            very strong acceleration
Elastic:          spring/bounce effect
Bounce:           bouncing effect
Back:             overshoot then return
```

Each has in/out/inOut variants for different acceleration profiles.

## Testing Effect Frame Generation

```javascript
const effect = new MyEffect('Hello World', new MyEffectConfig());
const iterator = effect[Symbol.iterator]();

let frame = 1;
for (const output of iterator) {
  console.log(`Frame ${frame}:`, output);
  frame++;
  if (frame > 100) break;  // Safety limit
}
```

