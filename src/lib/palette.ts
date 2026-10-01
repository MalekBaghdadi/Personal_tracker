/**
 * Metric hues. Each metric owns one; it is identity, not decoration.
 * Validated (lightness band, chroma, CVD separation, contrast) against the
 * dark surface #151c2a and the light surface #f6f4ef, in this order.
 * The stored value is the dark step; the light theme maps it to its pair.
 */
export const PALETTE: { name: string; dark: string; light: string }[] = [
  { name: 'Blue', dark: '#6690E6', light: '#3D6FD9' },
  { name: 'Amber', dark: '#BD8638', light: '#B07A1E' },
  { name: 'Teal', dark: '#28A592', light: '#17907C' },
  { name: 'Violet', dark: '#A07EE3', light: '#7E58D6' },
  { name: 'Rose', dark: '#DE6380', light: '#C9446A' },
];

const lightOf = new Map(PALETTE.map((p) => [p.dark.toLowerCase(), p.light]));

export function hueFor(color: string, theme: 'dark' | 'light'): string {
  if (theme === 'dark') return color;
  return lightOf.get(color.toLowerCase()) ?? color;
}
