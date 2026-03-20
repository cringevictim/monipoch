import { useRef, useCallback } from 'react';

export interface LabelDescriptor {
  id: string;
  baseX: number;
  baseY: number;
  width: number;
  height: number;
}

export interface StaticObstacle {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export interface CollisionOffset {
  dx: number;
  dy: number;
}

const MAX_OFFSET = 60;
const LABEL_REPULSION = 0.4;
const OBSTACLE_REPULSION = 0.6;
const VIEWBOX_W = 1000;
const VIEWBOX_H = 750;
const PADDING = 10;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function useCollisionEngine() {
  const offsetsRef = useRef(new Map<string, CollisionOffset>());
  const obstaclesRef = useRef<StaticObstacle[]>([]);

  const setObstacles = useCallback((obstacles: StaticObstacle[]) => {
    obstaclesRef.current = obstacles;
  }, []);

  const resolve = useCallback((labels: LabelDescriptor[], driftOffsets: Map<string, { dx: number; dy: number }>): Map<string, CollisionOffset> => {
    const offsets = offsetsRef.current;
    const obstacles = obstaclesRef.current;

    for (const l of labels) {
      if (!offsets.has(l.id)) offsets.set(l.id, { dx: 0, dy: 0 });
    }

    const ids = new Set(labels.map((l) => l.id));
    for (const key of offsets.keys()) {
      if (!ids.has(key)) offsets.delete(key);
    }

    const positions = labels.map((l) => {
      const drift = driftOffsets.get(l.id) ?? { dx: 0, dy: 0 };
      const col = offsets.get(l.id) ?? { dx: 0, dy: 0 };
      return {
        id: l.id,
        cx: l.baseX + drift.dx + col.dx,
        cy: l.baseY + drift.dy + col.dy,
        hw: l.width / 2,
        hh: l.height / 2,
        baseX: l.baseX,
        baseY: l.baseY,
      };
    });

    // Label vs label
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const overlapX = (a.hw + b.hw) - Math.abs(a.cx - b.cx);
        const overlapY = (a.hh + b.hh) - Math.abs(a.cy - b.cy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const pushAxis = overlapX < overlapY ? 'x' : 'y';
        const pushAmt = (pushAxis === 'x' ? overlapX : overlapY) * LABEL_REPULSION;

        const oA = offsets.get(a.id)!;
        const oB = offsets.get(b.id)!;

        if (pushAxis === 'x') {
          const sign = a.cx < b.cx ? -1 : 1;
          oA.dx += sign * pushAmt;
          oB.dx -= sign * pushAmt;
        } else {
          const sign = a.cy < b.cy ? -1 : 1;
          oA.dy += sign * pushAmt;
          oB.dy -= sign * pushAmt;
        }
      }
    }

    // Label vs static obstacles
    for (const pos of positions) {
      for (const obs of obstacles) {
        const overlapX = (pos.hw + obs.hw) - Math.abs(pos.cx - obs.cx);
        const overlapY = (pos.hh + obs.hh) - Math.abs(pos.cy - obs.cy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const pushAxis = overlapX < overlapY ? 'x' : 'y';
        const pushAmt = (pushAxis === 'x' ? overlapX : overlapY) * OBSTACLE_REPULSION;

        const o = offsets.get(pos.id)!;
        if (pushAxis === 'x') {
          o.dx += (pos.cx < obs.cx ? -1 : 1) * pushAmt;
        } else {
          o.dy += (pos.cy < obs.cy ? -1 : 1) * pushAmt;
        }
      }
    }

    for (const l of labels) {
      const o = offsets.get(l.id)!;
      o.dx = clamp(o.dx, -MAX_OFFSET, MAX_OFFSET);
      o.dy = clamp(o.dy, -MAX_OFFSET, MAX_OFFSET);

      const finalX = l.baseX + o.dx;
      const finalY = l.baseY + o.dy;
      if (finalX - l.width / 2 < PADDING) o.dx = PADDING + l.width / 2 - l.baseX;
      if (finalX + l.width / 2 > VIEWBOX_W - PADDING) o.dx = VIEWBOX_W - PADDING - l.width / 2 - l.baseX;
      if (finalY - l.height / 2 < PADDING) o.dy = PADDING + l.height / 2 - l.baseY;
      if (finalY + l.height / 2 > VIEWBOX_H - PADDING) o.dy = VIEWBOX_H - PADDING - l.height / 2 - l.baseY;

      o.dx *= 0.95;
      o.dy *= 0.95;
    }

    return offsets;
  }, []);

  return { resolve, setObstacles };
}
