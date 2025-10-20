/**
 * WebGLRenderer.js - GPU-accelerated terminal renderer
 *
 * Uses WebGL2 with instanced rendering for maximum performance.
 * Single draw call renders entire terminal (80x24 = 1920 cells).
 *
 * Architecture:
 * - Vertex shader: Positions cells and calculates glyph texture coords
 * - Fragment shader: Samples glyph atlas and applies colors
 * - Instance attributes: Per-cell data (position, colors, glyph, flags)
 * - Dirty region optimization: Only update changed cells
 *
 * Performance targets:
 * - Full screen render: < 2ms
 * - Dirty region render: < 0.5ms
 * - 60 FPS capable with headroom
 */

const fs = require('fs');
const path = require('path');

class WebGLRenderer {
    /**
     * Create WebGL renderer
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {TerminalBuffer} buffer - Terminal buffer to render
     * @param {GlyphAtlas} atlas - Glyph texture atlas
     */
    constructor(gl, buffer, atlas) {
        this.gl = gl;
        this.buffer = buffer;
        this.atlas = atlas;

        // Detect WebGL version and setup instancing
        // WebGL 2.0 has instancing built-in, WebGL 1.0 needs extension
        this.instancingExt = null;
        if (!gl.drawArraysInstanced) {
            // WebGL 1.0 - try to get instancing extension
            this.instancingExt = gl.getExtension('ANGLE_instanced_arrays');
            if (!this.instancingExt) {
                throw new Error('Instanced rendering not supported (need ANGLE_instanced_arrays extension)');
            }
        }

        // Initialize WebGL resources
        this._initShaders();
        this._initBuffers();
        this._initTextures();
        this._initUniforms();

        // Configure WebGL state
        gl.clearColor(0.117, 0.117, 0.117, 1.0); // #1E1E1E default bg
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    /**
     * Wrapper for vertexAttribDivisor (WebGL 1.0 extension or WebGL 2.0 built-in)
     * @private
     */
    _vertexAttribDivisor(index, divisor) {
        const gl = this.gl;
        if (this.instancingExt) {
            // WebGL 1.0 with extension
            this.instancingExt.vertexAttribDivisorANGLE(index, divisor);
        } else {
            // WebGL 2.0 built-in
            gl.vertexAttribDivisor(index, divisor);
        }
    }

    /**
     * Wrapper for drawArraysInstanced (WebGL 1.0 extension or WebGL 2.0 built-in)
     * @private
     */
    _drawArraysInstanced(mode, first, count, instanceCount) {
        const gl = this.gl;
        if (this.instancingExt) {
            // WebGL 1.0 with extension
            this.instancingExt.drawArraysInstancedANGLE(mode, first, count, instanceCount);
        } else {
            // WebGL 2.0 built-in
            gl.drawArraysInstanced(mode, first, count, instanceCount);
        }
    }

    /**
     * Load and compile shaders
     * @private
     */
    _initShaders() {
        const gl = this.gl;

        // Load shader source
        const vertexSource = fs.readFileSync(
            path.join(__dirname, 'shaders/terminal.vert.glsl'),
            'utf8'
        );
        const fragmentSource = fs.readFileSync(
            path.join(__dirname, 'shaders/terminal.frag.glsl'),
            'utf8'
        );

        // Compile shaders
        this.vertexShader = this._compileShader(gl.VERTEX_SHADER, vertexSource);
        this.fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fragmentSource);

        // Link program
        this.program = gl.createProgram();
        gl.attachShader(this.program, this.vertexShader);
        gl.attachShader(this.program, this.fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(this.program);
            throw new Error(`Shader program link failed: ${info}`);
        }

        gl.useProgram(this.program);

        // Get attribute locations
        this.attribs = {
            position: gl.getAttribLocation(this.program, 'a_position'),
            texCoord: gl.getAttribLocation(this.program, 'a_texCoord'),
            cellPosition: gl.getAttribLocation(this.program, 'a_cellPosition'),
            glyphCoords: gl.getAttribLocation(this.program, 'a_glyphCoords'),
            fgColor: gl.getAttribLocation(this.program, 'a_fgColor'),
            bgColor: gl.getAttribLocation(this.program, 'a_bgColor'),
            flags: gl.getAttribLocation(this.program, 'a_flags')
        };

        // Get uniform locations
        this.uniforms = {
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            cellSize: gl.getUniformLocation(this.program, 'u_cellSize'),
            glyphAtlas: gl.getUniformLocation(this.program, 'u_glyphAtlas')
        };
    }

    /**
     * Compile shader
     * @private
     */
    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation failed: ${info}`);
        }

        return shader;
    }

    /**
     * Initialize vertex buffers
     * @private
     */
    _initBuffers() {
        const gl = this.gl;

        // Quad geometry (2 triangles = 6 vertices)
        // Each vertex: position (x,y) + texCoord (u,v)
        const quadData = new Float32Array([
            // Triangle 1
            0, 0,  0, 0,  // bottom-left
            1, 0,  1, 0,  // bottom-right
            0, 1,  0, 1,  // top-left
            // Triangle 2
            0, 1,  0, 1,  // top-left
            1, 0,  1, 0,  // bottom-right
            1, 1,  1, 1   // top-right
        ]);

        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

        // Enable vertex attributes (non-instanced)
        gl.enableVertexAttribArray(this.attribs.position);
        gl.vertexAttribPointer(this.attribs.position, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(this.attribs.texCoord);
        gl.vertexAttribPointer(this.attribs.texCoord, 2, gl.FLOAT, false, 16, 8);

        // Instance data buffer (per-cell attributes)
        // Each cell: cellPos(2) + glyphCoords(4) + fgColor(3) + bgColor(3) + flags(1) = 13 floats
        const maxCells = this.buffer.cols * this.buffer.rows;
        this.instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, maxCells * 13 * 4, gl.DYNAMIC_DRAW);

        // Instance attributes
        gl.enableVertexAttribArray(this.attribs.cellPosition);
        gl.vertexAttribPointer(this.attribs.cellPosition, 2, gl.FLOAT, false, 52, 0);
        this._vertexAttribDivisor(this.attribs.cellPosition, 1);

        gl.enableVertexAttribArray(this.attribs.glyphCoords);
        gl.vertexAttribPointer(this.attribs.glyphCoords, 4, gl.FLOAT, false, 52, 8);
        this._vertexAttribDivisor(this.attribs.glyphCoords, 1);

        gl.enableVertexAttribArray(this.attribs.fgColor);
        gl.vertexAttribPointer(this.attribs.fgColor, 3, gl.FLOAT, false, 52, 24);
        this._vertexAttribDivisor(this.attribs.fgColor, 1);

        gl.enableVertexAttribArray(this.attribs.bgColor);
        gl.vertexAttribPointer(this.attribs.bgColor, 3, gl.FLOAT, false, 52, 36);
        this._vertexAttribDivisor(this.attribs.bgColor, 1);

        gl.enableVertexAttribArray(this.attribs.flags);
        gl.vertexAttribPointer(this.attribs.flags, 1, gl.FLOAT, false, 52, 48);
        this._vertexAttribDivisor(this.attribs.flags, 1);
    }

    /**
     * Initialize textures
     * @private
     */
    _initTextures() {
        const gl = this.gl;

        // Create texture for glyph atlas
        this.atlasTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

        // Upload atlas canvas
        const atlasCanvas = this.atlas.getTexture();
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            atlasCanvas
        );

        // Set texture parameters for crisp rendering
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    /**
     * Initialize uniforms
     * @private
     */
    _initUniforms() {
        const gl = this.gl;
        const metrics = this.atlas.getFontMetrics();

        // Set resolution
        gl.uniform2f(this.uniforms.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

        // Set cell size
        gl.uniform2f(this.uniforms.cellSize, metrics.cellWidth, metrics.cellHeight);

        // Bind glyph atlas to texture unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
        gl.uniform1i(this.uniforms.glyphAtlas, 0);
    }

    /**
     * Render terminal
     * @param {boolean} fullRender - Force full render (ignore dirty regions)
     */
    render(fullRender = false) {
        const gl = this.gl;

        // Clear screen
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Update instance data
        this._updateInstanceData();

        // Draw all cells with instanced rendering
        const cellCount = this.buffer.cols * this.buffer.rows;
        this._drawArraysInstanced(gl.TRIANGLES, 0, 6, cellCount);

        // Clear dirty tracking
        this.buffer.clearDirty();
        this.atlas.clearDirty();
    }

    /**
     * Update instance buffer with cell data
     * @private
     */
    _updateInstanceData() {
        const gl = this.gl;
        const buffer = this.buffer;
        const atlas = this.atlas;

        // Build instance data array
        const data = new Float32Array(buffer.cols * buffer.rows * 13);
        let offset = 0;

        for (let y = 0; y < buffer.rows; y++) {
            for (let x = 0; x < buffer.cols; x++) {
                const cell = buffer.getCell(x, y);

                // Cell position
                data[offset++] = x;
                data[offset++] = y;

                // Glyph texture coordinates
                const coords = atlas.getGlyph(
                    cell.char,
                    cell.isBold(),
                    cell.isItalic(),
                    cell.isUnderline(),
                    cell.fg
                );
                data[offset++] = coords.u1;
                data[offset++] = coords.v1;
                data[offset++] = coords.u2;
                data[offset++] = coords.v2;

                // Foreground color (RGB 0-1)
                data[offset++] = ((cell.fg >> 16) & 0xFF) / 255;
                data[offset++] = ((cell.fg >> 8) & 0xFF) / 255;
                data[offset++] = (cell.fg & 0xFF) / 255;

                // Background color (RGB 0-1)
                data[offset++] = ((cell.bg >> 16) & 0xFF) / 255;
                data[offset++] = ((cell.bg >> 8) & 0xFF) / 255;
                data[offset++] = (cell.bg & 0xFF) / 255;

                // Flags
                data[offset++] = cell.flags;
            }
        }

        // Upload to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }

    /**
     * Resize renderer
     * @param {number} width - New width in pixels
     * @param {number} height - New height in pixels
     */
    resize(width, height) {
        const gl = this.gl;

        // Update viewport
        gl.viewport(0, 0, width, height);

        // Update resolution uniform
        gl.uniform2f(this.uniforms.resolution, width, height);
    }

    /**
     * Cleanup resources
     */
    destroy() {
        const gl = this.gl;

        gl.deleteProgram(this.program);
        gl.deleteShader(this.vertexShader);
        gl.deleteShader(this.fragmentShader);
        gl.deleteBuffer(this.quadBuffer);
        gl.deleteBuffer(this.instanceBuffer);
        gl.deleteTexture(this.atlasTexture);
    }
}

module.exports = WebGLRenderer;
