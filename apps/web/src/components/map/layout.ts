import type { PochvenSystem } from '@monipoch/shared';
import { TRIANGLE_LAYOUT, TABBETZUR } from '@monipoch/shared';

export const V = {
  top: { x: 500, y: 120 },
  bottomLeft: { x: 134, y: 660 },
  bottomRight: { x: 866, y: 660 },
};

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function placeEdgeSystems(
  from: { x: number; y: number },
  to: { x: number; y: number },
  upperHalf: string[],
  lowerHalf: string[],
  positions: Map<string, { x: number; y: number }>,
) {
  const totalSlots = upperHalf.length + lowerHalf.length;
  const all = [...upperHalf, ...lowerHalf];
  for (let i = 0; i < all.length; i++) {
    const t = (i + 1) / (totalSlots + 1);
    positions.set(all[i], lerp(from, to, t));
  }
}

export function computeLayout(_systems: PochvenSystem[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const { vertices, leftEdge, rightEdge, bottomEdge } = TRIANGLE_LAYOUT;

  positions.set(vertices.top, V.top);
  positions.set(vertices.bottomLeft, V.bottomLeft);
  positions.set(vertices.bottomRight, V.bottomRight);

  placeEdgeSystems(V.top, V.bottomLeft, leftEdge.upperHalf, leftEdge.lowerHalf, positions);
  placeEdgeSystems(V.top, V.bottomRight, rightEdge.upperHalf, rightEdge.lowerHalf, positions);
  placeEdgeSystems(V.bottomLeft, V.bottomRight, bottomEdge.upperHalf, bottomEdge.lowerHalf, positions);

  const cx = (V.top.x + V.bottomLeft.x + V.bottomRight.x) / 3;
  const cy = (V.top.y + V.bottomLeft.y + V.bottomRight.y) / 3;
  positions.set(TABBETZUR.name, { x: cx, y: cy });

  return positions;
}
