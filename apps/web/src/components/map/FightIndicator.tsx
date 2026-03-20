import { useEffect, useRef } from 'react';
import { FightClassification, type DetectedFight } from '@monipoch/shared';

interface Props {
  x: number;
  y: number;
  nodeRadius: number;
  labelBaseX?: number;
  labelBaseY?: number;
  fight: DetectedFight;
  showLabel?: boolean;
}

const CLASSIFICATION_COLORS: Record<FightClassification, string> = {
  [FightClassification.SOLO]: '#ffaa00',
  [FightClassification.SMALL_GANG]: '#ff8800',
  [FightClassification.MEDIUM_GANG]: '#ff4400',
  [FightClassification.LARGE_FLEET]: '#ff0044',
  [FightClassification.CAPITAL_ESCALATION]: '#cc00ff',
};

const DRIFT_RADIUS = 8;
const DRIFT_SPEED = 0.00004;
const FADE_DURATION_MS = 5 * 60 * 1000;
const START_RADIUS_OFFSET = 20;
const END_RADIUS_OFFSET = 2;

export default function FightIndicator({ x, y, nodeRadius, labelBaseX: lbx, labelBaseY: lby, fight, showLabel = true }: Props) {
  const color = CLASSIFICATION_COLORS[fight.classification];
  const labelBaseX = lbx ?? x;
  const labelBaseY = lby ?? (y - nodeRadius - START_RADIUS_OFFSET - 12);

  const rafRef = useRef(0);
  const outerRingRef = useRef<SVGCircleElement>(null);
  const bandRef = useRef<SVGCircleElement>(null);
  const innerRingRef = useRef<SVGCircleElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);

  const receivedAt = fight.lastReceivedAt ?? fight.lastKillAt;

  useEffect(() => {
    const phase = Math.random() * Math.PI * 2;
    const GAP = 3;

    function tick() {
      const now = Date.now();
      const elapsed = now - new Date(receivedAt).getTime();
      const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
      const life = 1 - progress;

      const outerR = nodeRadius + END_RADIUS_OFFSET + (START_RADIUS_OFFSET - END_RADIUS_OFFSET) * life;
      const breathe = Math.sin(now * 0.002) * 2 * life;
      const outerRAnimated = outerR + breathe;
      const innerR = nodeRadius + GAP * life + 1;
      const innerRAnimated = innerR + breathe * 0.5;
      const opacity = 0.15 + 0.6 * life;

      const fullBandW = Math.max(0, outerRAnimated - innerRAnimated);
      const visualBandW = fullBandW * 0.5;
      const bandR = outerRAnimated - visualBandW / 2;
      const innerRingR = outerRAnimated - visualBandW;

      if (outerRingRef.current) {
        outerRingRef.current.setAttribute('r', String(outerRAnimated));
        outerRingRef.current.setAttribute('stroke-opacity', String(opacity));
      }
      if (bandRef.current) {
        bandRef.current.setAttribute('r', String(bandR));
        bandRef.current.setAttribute('stroke-width', String(visualBandW));
        bandRef.current.setAttribute('stroke-opacity', String((0.03 + 0.07 * life)));
      }
      if (innerRingRef.current) {
        innerRingRef.current.setAttribute('r', String(innerRingR));
        innerRingRef.current.setAttribute('stroke-opacity', String(opacity * 0.7));
      }

      if (showLabel) {
        const t = now * DRIFT_SPEED;
        const lx = labelBaseX + Math.sin(t + phase) * DRIFT_RADIUS;
        const ly = labelBaseY + Math.cos(t * 0.7 + phase) * DRIFT_RADIUS * 0.6;

        if (lineRef.current) {
          lineRef.current.setAttribute('x2', String(lx));
          lineRef.current.setAttribute('y2', String(ly));
        }
        if (textRef.current) {
          textRef.current.setAttribute('x', String(lx));
          textRef.current.setAttribute('y', String(ly));
        }
        if (gradRef.current) {
          gradRef.current.setAttribute('x2', String(lx));
          gradRef.current.setAttribute('y2', String(ly));
        }
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [receivedAt, labelBaseX, labelBaseY, showLabel, nodeRadius]);

  const gradientId = `fight-line-${fight.id}`;

  return (
    <g>
      {/* Filled band between outer ring and inner ring */}
      <circle ref={bandRef} cx={x} cy={y} r={nodeRadius + START_RADIUS_OFFSET * 0.6} fill="none" stroke={color} strokeWidth={START_RADIUS_OFFSET * 0.4} strokeOpacity={0.1} />

      {/* Outer ring */}
      <circle ref={outerRingRef} cx={x} cy={y} r={nodeRadius + START_RADIUS_OFFSET} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.75} />

      {/* Inner ring */}
      <circle ref={innerRingRef} cx={x} cy={y} r={nodeRadius + 4} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.5} />

      {showLabel && (
        <>
          <defs>
            <linearGradient ref={gradRef} id={gradientId} x1={x} y1={y} x2={labelBaseX} y2={labelBaseY} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <line ref={lineRef} x1={x} y1={y} x2={labelBaseX} y2={labelBaseY} stroke={`url(#${gradientId})`} strokeWidth={1} />

          <text
            ref={textRef}
            x={labelBaseX}
            y={labelBaseY}
            textAnchor="middle"
            className="text-[8px] font-bold pointer-events-none select-none"
            fill={color}
            fillOpacity={0.85}
          >
            {fight.totalKills} {fight.totalKills > 1 ? 'KILLS' : 'KILL'} · {Math.round(fight.totalIskDestroyed / 1_000_000)}M ISK
          </text>
        </>
      )}
    </g>
  );
}
