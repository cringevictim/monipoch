import { useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '../../stores/map';
import type { CollisionOffset } from '../../hooks/useCollisionEngine';
import type { FleetGroupResponse } from './fleetTypes';

export type GateCampData = FleetGroupResponse;

interface Props {
  x: number;
  y: number;
  labelBaseX: number;
  labelBaseY: number;
  camp: GateCampData;
  collisionOffset?: CollisionOffset;
}

const COLOR = '#ef4444';
const COLOR_END = '#ff6b6b';
const DRIFT_RADIUS = 14;
const DRIFT_SPEED = 0.000025;
const CHAR_WIDTH = 3.8;
const LABEL_PAD = 12;
const LABEL_H = 15;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

export default function CampIndicator({ x, y, labelBaseX, labelBaseY, camp, collisionOffset }: Props) {
  const selectTactical = useMapStore((s) => s.selectTactical);
  const selectedId = useMapStore((s) => s.selectedTacticalId);
  const tacticalId = `camp-${camp.id}`;
  const isActive = selectedId === tacticalId;

  const baseRadius = 16;

  const gRef = useRef<SVGGElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef(Math.random() * Math.PI * 2);

  const cxOff = collisionOffset?.dx ?? 0;
  const cyOff = collisionOffset?.dy ?? 0;

  useEffect(() => {
    function tick() {
      const t = Date.now() * DRIFT_SPEED;
      const phase = phaseRef.current;
      const dx = Math.sin(t + phase) * DRIFT_RADIUS;
      const dy = Math.cos(t * 0.7 + phase) * DRIFT_RADIUS * 0.6;
      const lx = labelBaseX + dx + cxOff;
      const ly = labelBaseY + dy + cyOff;

      if (gRef.current) gRef.current.setAttribute('transform', `translate(${lx},${ly})`);
      if (lineRef.current) {
        lineRef.current.setAttribute('x2', String(lx));
        lineRef.current.setAttribute('y2', String(ly));
      }
      if (gradRef.current) {
        gradRef.current.setAttribute('x2', String(lx));
        gradRef.current.setAttribute('y2', String(ly));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [labelBaseX, labelBaseY, cxOff, cyOff]);

  const shortGate = camp.anchorGateName
    ? camp.anchorGateName.replace(/^Stargate\s*\((.+)\)$/, '$1')
    : null;
  const gatePart = shortGate ? ` · ${shortGate}` : '';
  const label = `CAMP${gatePart} · ${timeAgo(camp.lastKillAt)}`;
  const rectW = label.length * CHAR_WIDTH + LABEL_PAD;

  const textGradId = `camp-text-grad-${camp.id}`;
  const lineGradId = `camp-line-${camp.id}`;

  const handleClick = useCallback(() => {
    selectTactical(isActive ? null : tacticalId);
  }, [selectTactical, isActive, tacticalId]);

  return (
    <g>
      <defs>
        <linearGradient ref={gradRef} id={lineGradId} x1={x} y1={y} x2={labelBaseX} y2={labelBaseY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={COLOR} stopOpacity={0.3} />
          <stop offset="100%" stopColor={COLOR} stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id={textGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLOR_END} />
          <stop offset="50%" stopColor={COLOR} />
          <stop offset="100%" stopColor={COLOR_END} />
        </linearGradient>
      </defs>

      <circle
        cx={x}
        cy={y}
        r={baseRadius}
        fill="transparent"
        stroke={COLOR}
        strokeWidth={1}
        strokeDasharray="3 4"
        strokeOpacity={0.55}
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${x} ${y}`}
          to={`360 ${x} ${y}`}
          dur="8s"
          repeatCount="indefinite"
        />
      </circle>

      <line ref={lineRef} x1={x} y1={y} x2={labelBaseX} y2={labelBaseY} stroke={`url(#${lineGradId})`} strokeWidth={1} />

      <g ref={gRef}>
        <rect
          x={-rectW / 2}
          y={-LABEL_H / 2}
          width={rectW}
          height={LABEL_H}
          rx={4}
          fill={isActive ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.45)'}
          stroke={COLOR}
          strokeWidth={isActive ? 1 : 0.5}
          strokeOpacity={isActive ? 0.6 : 0.3}
          className="cursor-pointer"
          onClick={handleClick}
        />
        <text
          x={0}
          y={3}
          textAnchor="middle"
          className="text-[7.5px] font-bold pointer-events-none select-none"
          fill={`url(#${textGradId})`}
          fillOpacity={0.9}
        >
          {label}
        </text>
      </g>
    </g>
  );
}
