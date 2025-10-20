// terminal.frag.glsl - Terminal cell fragment shader
// Samples glyph texture and applies foreground/background colors
//
// Architecture:
// - Glyph atlas texture contains pre-rendered glyphs (white on transparent)
// - Alpha channel used as mask for foreground color
// - Background color applied where glyph is transparent
//
// Performance:
// - Single texture sample per pixel
// - Simple alpha blending
// - No conditionals in hot path

// WebGL 1.0 compatible (GLSL ES 1.00)
precision highp float;

// Inputs from vertex shader
varying vec2 v_texCoord;      // Texture coordinate in atlas
varying vec3 v_fgColor;       // Foreground color (RGB 0-1)
varying vec3 v_bgColor;       // Background color (RGB 0-1)
varying float v_flags;        // Cell flags (bold, dim, etc.)

// Uniforms
uniform sampler2D u_glyphAtlas;  // Glyph texture atlas

// Flag constants (must match Cell.js)
const float FLAG_BOLD = 1.0;
const float FLAG_DIM = 2.0;
const float FLAG_ITALIC = 4.0;
const float FLAG_UNDERLINE = 8.0;
const float FLAG_BLINK = 16.0;
const float FLAG_INVERSE = 32.0;

// Check if flag is set
bool hasFlag(float flags, float flag) {
    return mod(floor(flags / flag), 2.0) == 1.0;
}

void main() {
    // Sample glyph from atlas
    // Atlas contains white glyphs on transparent background
    vec4 glyphSample = texture2D(u_glyphAtlas, v_texCoord);

    // Glyph alpha is the mask
    float glyphAlpha = glyphSample.a;

    // Apply bold effect (slightly brighter)
    vec3 fgColor = v_fgColor;
    if (hasFlag(v_flags, FLAG_BOLD)) {
        fgColor = min(fgColor * 1.2, vec3(1.0));
    }

    // Apply dim effect (darker)
    if (hasFlag(v_flags, FLAG_DIM)) {
        fgColor = fgColor * 0.5;
    }

    // Apply inverse video (swap fg/bg)
    vec3 finalFg = fgColor;
    vec3 finalBg = v_bgColor;
    if (hasFlag(v_flags, FLAG_INVERSE)) {
        finalFg = v_bgColor;
        finalBg = fgColor;
    }

    // Blend foreground and background based on glyph alpha
    vec3 color = mix(finalBg, finalFg, glyphAlpha);

    // Apply underline (bottom 10% of cell)
    float cellY = fract(v_texCoord.y * 20.0); // Approximate cell height in atlas
    if (hasFlag(v_flags, FLAG_UNDERLINE) && cellY > 0.9) {
        color = finalFg;
    }

    // Apply blink effect (would need time uniform in real implementation)
    float alpha = 1.0;
    if (hasFlag(v_flags, FLAG_BLINK)) {
        // For now, just pass through - blinking would need u_time uniform
        // alpha = mod(u_time, 1.0) > 0.5 ? 1.0 : 0.5;
    }

    gl_FragColor = vec4(color, alpha);
}
