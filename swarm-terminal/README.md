# SwarmTerminal

High-performance GPU-accelerated terminal emulator built from scratch.

## Architecture

```
SwarmTerminal
├── Core Buffer System (Phase 1)
│   ├── Cell - Terminal cell data structure
│   ├── CircularBuffer - Scrollback buffer
│   └── TerminalBuffer - Main grid system
├── Parser (Phase 1)
│   └── ANSIParser - ANSI/VT escape sequence parser
├── Renderer (Phase 2)
│   ├── GlyphAtlas - Font texture generation
│   ├── WebGLRenderer - GPU rendering engine
│   └── RenderOptimizer - Dirty tracking & FPS control
├── I/O (Phase 3)
│   ├── PTYInterface - Direct PTY communication
│   ├── InputHandler - Keyboard/mouse input
│   └── RingBuffer - Lock-free data transfer
└── Features (Phase 4)
    ├── SelectionManager - Text selection
    ├── SearchManager - Find in terminal
    └── ModeManager - Terminal modes
```

## Performance Targets

- **Input Latency**: < 5ms
- **Render Time**: < 2ms (full screen), < 0.5ms (dirty regions)
- **Parser Throughput**: > 50 MB/s
- **FPS Capability**: 500+
- **Memory Usage**: < 100MB

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Benchmarks
npm run benchmark
```

## Testing Philosophy

Test-Driven Development (TDD):
1. Write tests first
2. Implement minimal code to pass
3. Refactor
4. Repeat

## Status

🚧 **Under Active Development** 🚧

- [x] Project structure
- [ ] Phase 1: Core buffer system
- [ ] Phase 2: WebGL renderer
- [ ] Phase 3: I/O system
- [ ] Phase 4: Advanced features
