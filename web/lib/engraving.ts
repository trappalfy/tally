/**
 * Engraving generators (brief section 10.3). Pure functions, output SVG markup strings.
 * Served as static, prerendered files from app/engraving/* so the heavy path data
 * is downloaded once and cached, instead of being inlined in every page.
 */

const INK = "#ECE8E0";

function r1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/**
 * Guilloche band: 18 phase-shifted sinusoids.
 *   y = c + 26·sin(2πx/210 + φ) + 11·sin(2πx/67 − 2φ) + 6·sin(2πx/530 + φ/2),  φ = k·2π/18
 *
 * To tile seamlessly (and drift forever without a jump) the band repeats every
 * TILE = 1680 px = 8 × 210. The two minor periods are snapped to the nearest divisors
 * of the tile: 67 → 67.2 (1680/25) and 530 → 560 (1680/3). Visually identical.
 */
export const GUILLOCHE_TILE = 1680;
export const GUILLOCHE_HEIGHT = 100;
const G_PERIODS = [210, GUILLOCHE_TILE / 25, GUILLOCHE_TILE / 3] as const;

export function guillochePath(k: number, step = 4): string {
  const c = GUILLOCHE_HEIGHT / 2;
  const phi = (k * 2 * Math.PI) / 18;
  const tau = 2 * Math.PI;
  let d = "";
  for (let x = 0; x <= GUILLOCHE_TILE; x += step) {
    const y =
      c +
      26 * Math.sin((tau * x) / G_PERIODS[0] + phi) +
      11 * Math.sin((tau * x) / G_PERIODS[1] - 2 * phi) +
      6 * Math.sin((tau * x) / G_PERIODS[2] + phi / 2);
    d += `${x === 0 ? "M" : "L"}${x} ${r1(y)}`;
  }
  return d;
}

export function guillocheSvg(opts: { stroke?: string; opacity?: number; width?: number } = {}): string {
  const stroke = opts.stroke ?? INK;
  const opacity = opts.opacity ?? 0.35;
  const width = opts.width ?? 0.7;
  const paths = Array.from({ length: 18 }, (_, k) => `<path d="${guillochePath(k)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GUILLOCHE_TILE}" height="${GUILLOCHE_HEIGHT}" viewBox="0 0 ${GUILLOCHE_TILE} ${GUILLOCHE_HEIGHT}" preserveAspectRatio="none"><g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linejoin="round">${paths}</g></svg>`;
}

/**
 * Denomination rosette: 10 closed curves.
 *   r = R − 14 + 10·sin(9t + 0.63k) + 4·sin(27t − k),  k = 0..9
 */
export const ROSETTE_SIZE = 240;

export function rosettePath(k: number, R: number, samples = 720): string {
  let d = "";
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * 2 * Math.PI;
    const r = R - 14 + 10 * Math.sin(9 * t + 0.63 * k) + 4 * Math.sin(27 * t - k);
    const x = r * Math.cos(t);
    const y = r * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`;
  }
  return `${d}Z`;
}

export function rosetteSvg(opts: { stroke?: string; opacity?: number } = {}): string {
  const stroke = opts.stroke ?? INK;
  const opacity = opts.opacity ?? 0.6;
  const R = 112;
  const half = ROSETTE_SIZE / 2;
  const curves = Array.from({ length: 10 }, (_, k) => `<path d="${rosettePath(k, R)}"/>`).join("");
  // inner plate where the numeral sits, plus two hairline rims
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ROSETTE_SIZE}" height="${ROSETTE_SIZE}" viewBox="${-half} ${-half} ${ROSETTE_SIZE} ${ROSETTE_SIZE}"><g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="0.6">${curves}</g><circle r="${R + 4}" fill="none" stroke="${stroke}" stroke-opacity="0.35" stroke-width="0.6"/><circle r="${R - 31}" fill="#050505" stroke="${stroke}" stroke-opacity="0.8" stroke-width="1"/><circle r="${R - 35}" fill="none" stroke="${stroke}" stroke-opacity="0.35" stroke-width="0.5"/></svg>`;
}

export function svgResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
