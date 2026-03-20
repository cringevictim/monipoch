import { useEffect, useRef } from 'react';

const NODE_COUNT = 80;
const CONNECT_DIST_RATIO = 0.12;
const SPEED = 0.000004;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  colorT: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function initNodes(): Node[] {
  const rng = seededRandom(1337);
  const nodes: Node[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = rng() * Math.PI * 2;
    const speed = SPEED * (0.3 + rng() * 0.7);
    nodes.push({
      x: rng(),
      y: rng(),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 0.6 + rng() * 0.9,
      colorT: rng(),
    });
  }
  return nodes;
}

function colorFromT(t: number): [number, number, number] {
  return [255, Math.round(200 * (1 - t)), Math.round(200 * (1 - t))];
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef(initNodes());
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    function step(now: number) {
      if (!canvas || !ctx) return;
      if (!lastRef.current) lastRef.current = now;
      const dt = Math.min(now - lastRef.current, 50);
      lastRef.current = now;

      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      const connectDist = Math.max(w, h) * CONNECT_DIST_RATIO;

      const nodes = nodesRef.current;
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -0.02) { n.x = -0.02; n.vx = Math.abs(n.vx); }
        if (n.x > 1.02) { n.x = 1.02; n.vx = -Math.abs(n.vx); }
        if (n.y < -0.02) { n.y = -0.02; n.vy = Math.abs(n.vy); }
        if (n.y > 1.02) { n.y = 1.02; n.vy = -Math.abs(n.vy); }
      }

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const ax = nodes[i].x * w;
        const ay = nodes[i].y * h;
        for (let j = i + 1; j < nodes.length; j++) {
          const bx = nodes[j].x * w;
          const by = nodes[j].y * h;
          const dx = ax - bx;
          const dy = ay - by;
          const dSq = dx * dx + dy * dy;
          if (dSq < connectDist * connectDist) {
            const dist = Math.sqrt(dSq);
            const t = 1 - dist / connectDist;
            const midT = (nodes[i].colorT + nodes[j].colorT) / 2;
            const [r, g, b] = colorFromT(midT);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = `rgba(${r},${g},${b},${(t * 0.22).toFixed(3)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const px = n.x * w;
        const py = n.y * h;
        const [r, g, b] = colorFromT(n.colorT);
        ctx.beginPath();
        ctx.arc(px, py, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-screen h-screen z-0"
      style={{ pointerEvents: 'none' }}
    />
  );
}
