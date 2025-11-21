# SlideEffect - Quick Start Card

## 30-Second Start

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  
  const logo = [
    '███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗',
    '██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║',
    '███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║'
  ];
</script>

<SlideEffect asciiLines={logo} gradient={['#FF0000', '#00FF00']} />
```

## Props Cheat Sheet

| Prop | Type | Default | Values |
|------|------|---------|--------|
| `asciiLines` | array | [] | Array of strings |
| `gradient` | array | RGB | Hex color array |
| `slideFrom` | string | 'left' | left, right, top, bottom, corners |
| `slideDistance` | number | 200 | Pixels |
| `staggerDelay` | number | 30 | Milliseconds |
| `easing` | string/fn | 'easeOutQuart' | See Easing below |
| `trailSymbols` | bool | true | true/false |
| `onComplete` | fn | null | Callback function |

## Common Configurations

### Slide Left (Default)
```svelte
<SlideEffect asciiLines={art} gradient={colors} />
```

### Slide from Top
```svelte
<SlideEffect asciiLines={art} slideFrom="top" slideDistance={300} />
```

### Slide from Corners
```svelte
<SlideEffect asciiLines={art} slideFrom="corners" slideDistance={350} />
```

### Fast Animation
```svelte
<SlideEffect asciiLines={art} staggerDelay={10} slideDistance={150} />
```

### No Trail
```svelte
<SlideEffect asciiLines={art} trailSymbols={false} />
```

### With Callback
```svelte
<SlideEffect 
  asciiLines={art} 
  onComplete={() => console.log('Done!')} 
/>
```

## Easing Functions

```
'linear'           - Constant speed
'easeInQuad'       - Slow start
'easeOutQuad'      - Slow end
'easeInOutCubic'   - Smooth in and out
'easeOutQuart'     - Strong ease-out (default)
(t) => t           - Custom function
```

## Performance Tips

| Scenario | Setting |
|----------|---------|
| < 200 chars | Default (30ms stagger) |
| 200-500 chars | 25ms stagger |
| 500-1000 chars | 20ms stagger, no trail |
| > 1000 chars | 10ms stagger, no trail |

## Colors

### Predefined Gradients
```javascript
import { 
  rainbowGradient,
  cyanMagentaGradient, 
  purpleBlueGradient 
} from '../utils/colorGradient.js';
```

### Custom Gradient
```javascript
gradient={['#FF1493', '#FFD700', '#00FF7F']}
```

## Direction Guide

- **`'left'`**: Characters slide from left → right
- **`'right'`**: Characters slide from right → left
- **`'top'`**: Characters slide from top → bottom
- **`'bottom'`**: Characters slide from bottom → top
- **`'corners'`**: Random corners for dramatic effect

## Common Patterns

### Welcome Screen
```svelte
let showContent = false;

<SlideEffect 
  asciiLines={logo}
  onComplete={() => showContent = true}
/>

{#if showContent}
  <main>Welcome to App</main>
{/if}
```

### Multi-Animation Sequence
```svelte
let phase = 'title';

function nextPhase() {
  phase = phase === 'title' ? 'subtitle' : 'content';
}

{#key phase}
  <SlideEffect 
    asciiLines={phases[phase]}
    onComplete={nextPhase}
  />
{/key}
```

### Responsive Stagger
```svelte
let asciiSize = art.length;
$: stagger = asciiSize > 500 ? 15 : 30;

<SlideEffect asciiLines={art} staggerDelay={stagger} />
```

## Debugging

### Check if animating
```svelte
// Add logging in animation
onComplete={() => console.log('Animation finished!')}
```

### Verify ASCII
```svelte
{#each asciiLines as line}
  <pre>{line}</pre>
{/each}
```

### Test easing
```svelte
easing={(t) => {
  console.log('Progress:', t);
  return t;
}}
```

## Browser Support

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+

Requires: ES6+ and CSS Variables

## Files Reference

| File | Purpose |
|------|---------|
| `SlideEffect.svelte` | Main component |
| `SlideEffect.example.svelte` | 8 interactive demos |
| `README.md` | Full documentation |
| `INTEGRATION_GUIDE.md` | Integration patterns |
| `SLIDEEFFECT_SUMMARY.md` | Technical details |

## Common Issues

**Animation not playing?**
- Check `asciiLines` has content
- Check browser console
- Ensure component mounted

**Laggy animation?**
- Increase `staggerDelay`
- Disable `trailSymbols`
- Reduce ASCII size

**Callback not firing?**
- Verify function passed correctly
- Check browser console
- Wait for animation to finish

## Example Files

Visit `SlideEffect.example.svelte` for working demos of:
1. Slide from Left
2. Slide from Right
3. Slide from Top
4. Slide from Bottom
5. Slide from Corners
6. Fast Slide
7. Custom Gradient
8. No Trail

## Quick Stats

- **Component Size**: ~250 lines
- **Props**: 8
- **Easing Functions**: 5+
- **Directions**: 5
- **Performance**: 60fps target
- **Max Chars**: 5000+ (optimized)
- **Animation Time**: ~600ms per character

## Getting Started Now

1. **Copy this import**:
   ```javascript
   import SlideEffect from './effects/SlideEffect.svelte';
   ```

2. **Add to template**:
   ```svelte
   <SlideEffect asciiLines={myArt} gradient={myColors} />
   ```

3. **Customize props as needed**

4. **Check examples for more ideas**

## Advanced

### Custom Easing
```svelte
easing={(t) => 1 - Math.pow(1 - t, 3)} // easeOutCubic
```

### Dynamic ASCII
```svelte
$: asciiLines = generateArt(data);
```

### Chained Animations
```svelte
{#key phase}
  <SlideEffect onComplete={nextPhase} />
{/key}
```

---

**More Info**: See `README.md` for complete documentation
**Integration Help**: See `INTEGRATION_GUIDE.md` for patterns
**Examples**: Run `SlideEffect.example.svelte` in browser

---

**Status**: Production Ready ✅
**Version**: 1.0.0
**Last Updated**: November 2025
