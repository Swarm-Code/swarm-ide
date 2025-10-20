// terminal.vert.glsl - Terminal cell vertex shader
// Uses instanced rendering to draw all cells in one draw call
//
// Architecture:
// - Each instance = one terminal cell
// - Vertex attributes define the quad corners (2 triangles)
// - Instance attributes provide per-cell data (position, color, glyph coords)
//
// Performance:
// - Single draw call for entire terminal (80x24 = 1920 cells)
// - GPU-side transformation and texture coordinate calculation
// - Minimal CPU overhead

// WebGL 1.0 compatible (GLSL ES 1.00)
precision highp float;

// Vertex attributes (per-vertex, defines quad corners)
attribute vec2 a_position;      // Corner position: (0,0), (1,0), (0,1), (1,1)
attribute vec2 a_texCoord;      // Corner texture coord: (0,0), (1,0), (0,1), (1,1)

// Instance attributes (per-cell)
attribute vec2 a_cellPosition;  // Grid position (col, row)
attribute vec4 a_glyphCoords;   // Atlas texture coords (u1, v1, u2, v2)
attribute vec3 a_fgColor;       // Foreground RGB color (0-1)
attribute vec3 a_bgColor;       // Background RGB color (0-1)
attribute float a_flags;        // Cell flags (bold, italic, underline, etc.)

// Uniforms (constant for all vertices)
uniform vec2 u_resolution;    // Viewport size (width, height) in pixels
uniform vec2 u_cellSize;      // Cell dimensions (width, height) in pixels

// Outputs to fragment shader
varying vec2 v_texCoord;      // Interpolated texture coordinate
varying vec3 v_fgColor;       // Foreground color (passed through)
varying vec3 v_bgColor;       // Background color (passed through)
varying float v_flags;        // Flags (passed through)

void main() {
    // Calculate pixel position of this cell
    vec2 pixelPos = a_cellPosition * u_cellSize;

    // Add vertex offset (quad corner) scaled by cell size
    pixelPos += a_position * u_cellSize;

    // Convert pixel coordinates to clip space (-1 to 1)
    vec2 clipSpace = (pixelPos / u_resolution) * 2.0 - 1.0;

    // Flip Y axis (screen space is top-left origin, clip space is bottom-left)
    clipSpace.y = -clipSpace.y;

    gl_Position = vec4(clipSpace, 0.0, 1.0);

    // Calculate texture coordinates for this glyph
    // a_texCoord is (0,0) to (1,1) for quad corners
    // a_glyphCoords is (u1,v1,u2,v2) from atlas
    vec2 glyphSize = a_glyphCoords.zw - a_glyphCoords.xy;
    v_texCoord = a_glyphCoords.xy + a_texCoord * glyphSize;

    // Pass through colors and flags
    v_fgColor = a_fgColor;
    v_bgColor = a_bgColor;
    v_flags = a_flags;
}
