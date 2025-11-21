# Terminal Text Effects (TTE) Architecture Analysis

## Overview

Terminal Text Effects is a sophisticated Python library for creating animated text effects in the terminal. The architecture is built on a modular, composable system with clear separation of concerns across effects, animation, motion, and rendering layers.

## Core Architecture Layers

### 1. Base Classes & Interfaces

#### BaseEffect & BaseEffectIterator Pattern
- **BaseEffect**: Abstract base class for all effects
  - Provides the effect configuration interface
  - Acts as a factory for creating iterators
  - Manages terminal context with context manager (`terminal_output`)
  - Properties: `input_data`, `effect_config`, `terminal_config`

- **BaseEffectIterator**: Abstract base iterator class
  - Handles the actual animation/effect logic
  - Manages active characters and rendering
  - Implements `__iter__` and `__next__` for frame generation
  - Properties: `frame` (gets current formatted output), `active_characters`
  - Method `update()`: ticks all active characters and removes inactive ones

**Key Pattern**: Every effect implements two classes:
```
Effect (inherits BaseEffect)
  └── EffectIterator (inherits BaseEffectIterator)
```

#### BaseConfig
- Dataclass-based configuration system
- Automatic argument parsing via `ArgSpec` fields
- Supports building from parsed argparse Namespace or defaults
- Each effect has its own Config subclass with:
  - `parser_spec`: Command-line metadata
  - ArgSpec fields: Typed configuration parameters

### 2. Character Animation System (engine/animation.py)

#### CharacterVisual
- Dataclass storing the **visual state** of a single character
- Properties:
  - `symbol`: The character to display
  - `bold`, `dim`, `italic`, `underline`, `blink`, `reverse`, `hidden`, `strike`: Text formatting modes
  - `colors`: ColorPair object (foreground + background)
  - `_fg_color_code`, `_bg_color_code`: Processed color codes
  - `formatted_symbol`: Cached formatted output with ANSI sequences

- **Key Method**: `format_symbol()`
  - Applies ANSI formatting sequences in order
  - Combines symbol with color codes
  - Returns fully formatted string ready for output

#### Frame
- Simple dataclass: `CharacterVisual + duration`
- Tracks `ticks_elapsed` for frame timing
- Duration: number of ticks to display the frame

#### Scene
- **A sequence of Frames** that play in order
- Acts like a sprite sheet or animation clip
- Key properties:
  - `frames`: List of Frame objects
  - `played_frames`: Frames that have been displayed (for looping)
  - `is_looping`: Whether to repeat
  - `sync`: Optional sync metric (DISTANCE or STEP) for motion synchronization
  - `ease`: Optional easing function
  - `preexisting_colors`: Colors from input data

- **Key Methods**:
  - `add_frame()`: Adds a frame with symbol, duration, colors, and modes
  - `activate()`: Returns first frame's visual
  - `get_next_visual()`: Returns current visual and advances frame
  - `apply_gradient_to_symbols()`: Creates animated gradient effect
  - `reset_scene()`: Resets for looping

#### Animation
- **Manages all scenes** for a single character
- Acts as animation state machine
- Properties:
  - `scenes`: Dict[scene_id → Scene]
  - `active_scene`: Currently playing scene
  - `current_character_visual`: Current visual being displayed

- **Key Methods**:
  - `new_scene()`: Creates and registers new scene
  - `activate_scene()`: Switches to a scene
  - `step_animation()`: Advances to next frame in active scene
  - `set_appearance()`: Sets symbol and color directly
  - `query_scene()`: Looks up scene by ID

**Animation Lifecycle**:
1. Create Scene with frames
2. Register with character's Animation
3. Activate scene
4. Call `step_animation()` each tick
5. Deactivate when complete

### 3. Character Motion System (engine/motion.py)

#### Waypoint
- Frozen dataclass representing a point in space
- Properties:
  - `waypoint_id`: Unique identifier
  - `coord`: Coordinate in canvas
  - `bezier_control`: Optional Bezier control points for curved paths

#### Segment
- A path segment between two waypoints
- Contains: start Waypoint, end Waypoint, calculated distance
- Tracks event triggers (enter/exit events)

#### Path
- **A sequence of waypoints** forming a trajectory
- Handles movement calculation and easing
- Properties:
  - `path_id`: Unique identifier
  - `speed`: Movement speed (distance per frame)
  - `ease`: Optional easing function
  - `loop`: Whether to loop back to start
  - `hold_time`: Frames to hold at end
  - `layer`: Optional layer to move character to

- **Key Methods**:
  - `new_waypoint()`: Adds waypoint and recalculates distances
  - `step()`: Calculates next position along path
  - `query_waypoint()`: Finds waypoint by ID

#### Motion
- **Manages all paths** for a single character
- Calculates current position each frame
- Properties:
  - `paths`: Dict[path_id → Path]
  - `current_coord`: Current position
  - `movement_is_complete()`: Returns whether active paths are done

- **Key Methods**:
  - `new_path()`: Creates and registers path
  - `activate_path()`: Starts movement along path
  - `move()`: Advances one step along active path
  - `query_path()`: Finds path by ID

**Motion Lifecycle**:
1. Create Path with waypoints
2. Register with character's Motion
3. Activate path
4. Call `move()` each tick
5. Character moves toward waypoints with easing

### 4. Character Model (engine/base_character.py)

#### EffectCharacter
- **Central character object** managing all state for one input character
- Properties:
  - `character_id`: Unique identifier
  - `input_symbol`: Original character from input
  - `input_coord`: Original position in input grid
  - `current_coord`: Current position (via motion)
  - `is_visible`: Whether to render
  - `layer`: Render order (higher = on top)
  - `animation`: Animation instance
  - `motion`: Motion instance
  - `event_handler`: Event handler instance

- **Key Method**: `tick()`
  - Calls `motion.move()`
  - Calls `animation.step_animation()`
  - Updates all character state

- **is_active Property**: Returns true if animation OR motion is incomplete

#### EventHandler
- **Event system** for characters
- Events: SEGMENT_ENTERED, SEGMENT_EXITED, PATH_ACTIVATED, PATH_COMPLETE, PATH_HOLDING, SCENE_ACTIVATED, SCENE_COMPLETE
- Actions: ACTIVATE_PATH, ACTIVATE_SCENE, DEACTIVATE_PATH, DEACTIVATE_SCENE, RESET_APPEARANCE, SET_LAYER, SET_COORDINATE, CALLBACK
- Pattern: Register event combinations, trigger actions when events occur

### 5. Terminal & Rendering (engine/terminal.py)

#### Terminal
- **Canvas and output manager**
- Maintains grid of characters
- Gets formatted output string with ANSI sequences
- Key features:
  - Character grouping and sorting
  - Canvas dimension management
  - Frame rate limiting
  - Color mode handling (24-bit, XTerm-256)

#### TerminalConfig
- Configuration for terminal behavior
- Options: canvas size, anchor points, color handling, frame rate, etc.

**Rendering Pipeline**:
1. Terminal maintains grid of EffectCharacters
2. Each character has current visual from Animation
3. Terminal formats all characters with ANSI sequences
4. Returns complete frame string
5. Output displayed and frame rate enforced

### 6. Color & Gradient System (utils/graphics.py)

#### Color
- Represents single color (RGB hex or XTerm-256)
- Can convert between formats
- Properties: `rgb_color`, `xterm_color`, `rgb_ints`

#### ColorPair
- Two colors: foreground and background
- Used in animations for character coloring

#### Gradient
- **Generates color spectrum** using linear interpolation
- Features:
  - Multiple stops with custom steps between pairs
  - Directions: VERTICAL, HORIZONTAL, RADIAL, DIAGONAL
  - Can loop back to start color
  - Method `build_coordinate_color_mapping()`: Maps coordinates to colors for directional gradients
  - Method `get_color_at_fraction()`: Gets color at position in gradient

**Gradient Example**:
```python
gradient = Gradient(
    Color("#ffffff"),  # start
    Color("#000000"),  # end
    steps=10           # 10-step interpolation
)
# spectrum contains 10 colors from white to black
```

### 7. Easing System (utils/easing.py)

- **EasingFunction**: Type alias for `Callable[[float], float]`
- Takes progress ratio (0-1) and returns eased value (0-1)
- Implementations: linear, in/out sine, quad, cubic, quart, quint, expo, circ, back, elastic, bounce
- Used for:
  - Motion: Easing character movement along paths
  - Animation: Easing frame selection (used with sync metrics)

---

## Effect Implementation Patterns

### Pattern 1: Configuration-Driven Setup

All effects follow this pattern:

```python
@dataclass
class EffectConfig(BaseConfig):
    parser_spec = ParserSpec(...)  # CLI metadata
    param1: Type = ArgSpec(...)    # CLI argument definition
    param2: Type = ArgSpec(...)

class Effect(BaseEffect):
    @property
    def _config_cls(self) -> type[EffectConfig]:
        return EffectConfig
    
    @property
    def _iterator_cls(self) -> type[BaseEffectIterator]:
        return EffectIterator

class EffectIterator(BaseEffectIterator[EffectConfig]):
    def __init__(self, effect: Effect):
        super().__init__(effect)
        # Initialize effect-specific state
    
    def __next__(self) -> str:
        # Update effect state
        # Call self.update() to tick characters
        return self.frame  # Get formatted output
```

### Pattern 2: Character Initialization

Effects typically:
1. Get all characters from `self.terminal.get_characters()`
2. Set initial appearance with `character.animation.set_appearance()`
3. Create scenes with frames for animation
4. Create paths with waypoints for motion
5. Register paths/scenes with characters
6. Activate initial scenes/paths

### Pattern 3: Per-Frame Updates

Each call to `__next__()`:
1. Update effect-specific state/counters
2. Determine which characters should be active
3. Activate/deactivate paths and scenes
4. Call `self.update()` to tick all active characters
5. Return `self.frame` to get rendered output

### Pattern 4: Animation + Motion Composition

Most effects combine:
- **Animation**: How character looks (symbol, color, modes)
- **Motion**: Where character appears (position, movement trajectory)
- **Easing**: How motion and animation progress over time

Example flow:
```
Character starts invisible
→ Motion activates, moves character to position
→ Animation activates, plays appearance frames
→ Both complete, character inactive
```

---

## Priority Effects for Implementation

### 1. **Decrypt** - Text Decryption Animation
**Complexity**: Medium
**Key Features**:
- Two-phase effect: typing → decrypting
- Random cipher symbols
- Color transition via gradient
- Sequential character activation

**Implementation Focus**:
- Random symbol selection from character sets
- Scene-based animation for decryption
- Gradient-based final color transition
- Staggered character activation

### 2. **Matrix** - Digital Rain
**Complexity**: Medium-High
**Key Features**:
- Rain columns falling from top
- Symbol and color swapping (probabilistic)
- Final character resolution phase
- Grid-based column animation

**Implementation Focus**:
- Path-based vertical movement
- Probabilistic frame updates
- Multiple animation phases
- Coordinate-based grouping

### 3. **Rain** - Character Rain
**Complexity**: Medium
**Key Features**:
- Random falling speed per character
- Symbol variation
- Easing on movement
- Gradient final color

**Implementation Focus**:
- Per-character speed randomization
- Motion easing application
- Random symbol selection
- Gradient direction application

### 4. **Wipe** - Reveal Effect
**Complexity**: Medium
**Key Features**:
- Multiple wipe directions (8 directions + center)
- Character grouping by wipe direction
- Staggered activation
- Gradient animation

**Implementation Focus**:
- Directional character sorting
- Group-based staggered activation
- Direction-based coordinate calculation
- Gradient coordinate mapping

### 5. **Slide** - Slide Into View
**Complexity**: Medium
**Key Features**:
- Grouping modes: row, column, diagonal
- Directional movement from outside canvas
- Gap/stagger between groups
- Easing support

**Implementation Focus**:
- Multi-mode grouping logic
- Off-canvas waypoint generation
- Gap-based staggered activation
- Movement easing

### 6. **Waves** - Wave Motion Effect
**Complexity**: Medium-High
**Key Features**:
- Sine/cosine wave motion
- Oscillation parameters (frequency, amplitude)
- Animation synchronization
- Optional final color gradient

**Implementation Focus**:
- Wave calculation math
- Parametric position calculation
- Timing synchronization
- Smooth oscillation implementation

### 7. **Beams** - Illuminating Beams
**Complexity**: High
**Key Features**:
- Beam symbols and colors
- Row and column beam motion
- Beam gradient
- Final illuminate gradient

**Implementation Focus**:
- Separate row/column beam logic
- Beam trajectory calculation
- Multiple gradient applications
- Beam animation symbols

### 8. **Print** - Typewriter Effect
**Complexity**: Medium
**Key Features**:
- Carriage return and line feed
- Line-by-line printing
- Print head animation
- Speed parameters

**Implementation Focus**:
- Line-based character grouping
- Coordinate-based path generation
- Easing on print head motion
- Line feed timing

---

## Key Design Patterns for JS/Svelte Port

### 1. **Class-Based Character Management**
- Create `EffectCharacter` class with animation and motion properties
- Manage character state mutation via `tick()` method
- Track is_active status for lifecycle management

### 2. **Composition Over Inheritance**
- Effect classes compose Animation and Motion
- Each character has independent Animation and Motion instances
- EventHandler manages inter-component communication

### 3. **Iterator Pattern for Frame Generation**
- Effect returns iterator/generator for frames
- Each frame is a string with ANSI sequences
- Frame generation is lazy and stateful

### 4. **Configuration Objects**
- Config classes hold all parameters
- Separate config from runtime state
- Enable easy serialization and parameter passing

### 5. **Scene Graph Rendering**
- Terminal maintains canvas grid
- Characters ordered by layer
- Format output by iterating grid and getting visuals

### 6. **Timing & Lifecycle Management**
- Characters have explicit active/inactive states
- Tick methods update internal state machines
- Frame rate limiting in terminal layer

### 7. **Gradient as Coordinate-Based Mapping**
- Gradients pre-compute color mappings for coordinates
- Effects look up colors by position
- Supports multiple gradient directions

### 8. **Easing as Progress Function**
- Easing functions take normalized progress (0-1)
- Return adjusted progress for animation
- Used for both motion and animation timing

---

## Critical Implementation Considerations

### 1. **Character Visibility & Layering**
- Characters have `is_visible` flag
- Characters have `layer` number
- Rendering respects both: sort by layer, skip invisible

### 2. **Color Handling Modes**
- `no_color`: Strip all colors
- `use_xterm_colors`: Convert RGB to XTerm-256
- `existing_color_handling`: respect input ANSI colors

### 3. **Canvas Anchoring**
- Canvas can be anchored to terminal edges or center
- Effect can be anchored within canvas
- Affects character positioning

### 4. **Frame Rate Management**
- Terminal can enforce target FPS
- Prevents output from outpacing display
- Configurable or disabled

### 5. **ANSI Sequence Generation**
- Formatting is done via library functions
- Sequences: bold, dim, italic, underline, blink, reverse, hidden, strike
- Colors: foreground and background (24-bit RGB or XTerm)

### 6. **Path Interpolation**
- Linear interpolation for straight paths
- Bezier curves for curved paths
- Distance calculation for waypoint distances

### 7. **Animation Synchronization**
- Scenes can sync to motion (DISTANCE or STEP based)
- Easing functions affect sync rate
- Allows animation to be tied to movement progress

---

## Terminal Rendering Pipeline

```
Input Text
    ↓
Parse into grid of EffectCharacters
    ↓
Each character has:
  - Animation (current visual)
  - Motion (current coordinate)
  - Layer (render order)
    ↓
For each frame:
  1. Update effect state
  2. Activate/deactivate scenes and paths
  3. Call character.tick() for active characters
  4. Get current visual from animation
  5. Get current coordinate from motion
  6. Format character with ANSI sequences
  7. Combine into output grid
  8. Return formatted string
    ↓
Output to Terminal
    ↓
Enforce Frame Rate
    ↓
Repeat until all characters inactive
```

---

## Timing Model

### Ticks vs Frames vs Seconds
- **Tick**: Basic unit of character state advancement
- **Frame**: A rendered output (may skip display ticks for frame rate)
- **Second**: Wallclock time (used for rain/matrix effects)

### Duration System
- Scenes have frame duration per Frame
- Paths have distance and speed → calculate max_steps
- Easing functions parameterize animation/motion progress

### Synchronization
- Animation can sync to motion progress
- Scene easing adjusts frame timing
- Path easing adjusts waypoint interpolation

---

## Conclusion

The TTE architecture is well-designed for terminal effects:
- **Modular**: Each component (animation, motion, character) is independent
- **Composable**: Effects combine components in different ways
- **Configurable**: Everything is parameterized
- **Extensible**: New effects just implement BaseEffect/BaseEffectIterator

For the JS/Svelte port, maintain this structure while adapting to:
- JavaScript classes instead of Python dataclasses
- Svelte reactive stores for state management
- Canvas/WebGL for rendering instead of terminal output
- Browser animation frame instead of manual tick loop
