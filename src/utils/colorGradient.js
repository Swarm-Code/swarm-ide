export const rainbowGradient = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
  '#0000FF', '#4B0082', '#9400D3'
];

export const cyanMagentaGradient = [
  '#00FFFF', '#FF00FF', '#FF0080', '#00FF80',
  '#8000FF', '#FF8000', '#00FF00'
];

export const purpleBlueGradient = [
  '#9D00FF', '#7000FF', '#5000FF', '#0050FF',
  '#0080FF', '#00A0FF', '#00D0FF'
];

export function interpolateColor(color1, color2, factor) {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);

  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;

  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;

  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`;
}

export function getGradientColor(gradient, position) {
  if (!Array.isArray(gradient) || gradient.length === 0) return '#FFFFFF';
  
  const normalizedPos = Math.max(0, Math.min(1, position));
  const index = normalizedPos * (gradient.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) return gradient[lowerIndex];

  const factor = index - lowerIndex;
  return interpolateColor(gradient[lowerIndex], gradient[upperIndex], factor);
}

export function generateLineGradient(length, gradient) {
  const colors = [];
  for (let i = 0; i < length; i++) {
    const position = i / length;
    colors.push(getGradientColor(gradient, position));
  }
  return colors;
}
