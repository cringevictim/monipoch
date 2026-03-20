import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Clock, ExternalLink } from 'lucide-react';
import { useWsStore, killArrivalTimes } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../stores/auth';
import { apiJson } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { WsKillEvent } from '@monipoch/shared';

interface EnrichedKillmailRow {
  killmail_id: number;
  solar_system_id: number;
  killmail_time: string;
  victim_character_id: number | null;
  victim_corporation_id: number | null;
  victim_alliance_id: number | null;
  victim_ship_type_id: number;
  victim_ship_name: string | null;
  total_value: number;
  attacker_count: number;
  is_npc: boolean;
  is_solo: boolean;
  victim_name: string | null;
  victim_corp_name: string | null;
  victim_corp_ticker: string | null;
  victim_alliance_name: string | null;
  victim_alliance_ticker: string | null;
  fb_character_id: number | null;
  fb_corporation_id: number | null;
  fb_alliance_id: number | null;
  fb_ship_type_id: number | null;
  fb_character_name: string | null;
  fb_corp_name: string | null;
  fb_corp_ticker: string | null;
  fb_alliance_name: string | null;
  fb_alliance_ticker: string | null;
  fb_ship_name: string | null;
  victim_is_alliance?: boolean | number;
  attacker_is_alliance?: boolean | number;
}

const TIMER_DURATION_MS = 90_000;

function formatIsk(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function eveImg(path: string, id: number, size: number) {
  return `https://images.evetech.net/${path}/${id}/${path === 'types' ? 'render' : path === 'characters' ? 'portrait' : 'logo'}?size=${size}`;
}
const eveShipRender = (id: number, size = 64) => eveImg('types', id, size);
const evePortrait = (id: number, size = 32) => eveImg('characters', id, size);
const eveCorpLogo = (id: number, size = 32) => eveImg('corporations', id, size);
const eveAllianceLogo = (id: number, size = 32) => eveImg('alliances', id, size);

type AllianceRole = 'kill' | 'loss' | null;

function getAllianceRole(ev: WsKillEvent, allianceId?: number): AllianceRole {
  if (!allianceId) return null;
  const aid = Number(allianceId);
  if (Number(ev.killmail.victim.alliance_id) === aid) return 'loss';
  if (ev.killmail.attackers.some((a) => Number(a.alliance_id) === aid)) return 'kill';
  return null;
}

/**
 * Build a CCW rounded-rect path starting at top-center.
 * Stroke retracts from the tail (right side of top edge, going right-to-left)
 * like a reverse-clock snake.
 */
function buildCCWPath(w: number, h: number, r: number): { d: string; len: number } {
  const rr = Math.min(r, w / 2, h / 2);
  const mx = w / 2;

  const d = [
    `M ${mx},0`,
    `L ${rr},0`,
    `A ${rr},${rr} 0 0 0 0,${rr}`,
    `L 0,${h - rr}`,
    `A ${rr},${rr} 0 0 0 ${rr},${h}`,
    `L ${w - rr},${h}`,
    `A ${rr},${rr} 0 0 0 ${w},${h - rr}`,
    `L ${w},${rr}`,
    `A ${rr},${rr} 0 0 0 ${w - rr},0`,
    `Z`,
  ].join(' ');

  const len = 2 * (w - 2 * rr) + 2 * (h - 2 * rr) + 2 * Math.PI * rr;
  return { d, len };
}

// --- Snake timer border SVG overlay ---
function SnakeTimerBorder({ arrivedAt, paused }: { arrivedAt: number; paused: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const pauseOffsetRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pathDataRef = useRef<{ d: string; len: number } | null>(null);
  const sizeRef = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const el = svg?.parentElement;
    if (!el) return;
    function measure() {
      if (!el || !svg) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      sizeRef.current = { w, h };
      const data = buildCCWPath(w, h, 6);
      pathDataRef.current = data;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      if (pathRef.current) {
        pathRef.current.setAttribute('d', data.d);
        pathRef.current.setAttribute('stroke-dasharray', `${data.len} 0`);
      }
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (paused) {
      pausedAtRef.current = Date.now();
      return;
    }
    if (pausedAtRef.current !== null) {
      pauseOffsetRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    let raf: number;
    function tick() {
      const pd = pathDataRef.current;
      if (!pd || !pathRef.current) { raf = requestAnimationFrame(tick); return; }
      const elapsed = Date.now() - arrivedAt - pauseOffsetRef.current;
      const progress = Math.max(0, 1 - elapsed / TIMER_DURATION_MS);
      if (progress <= 0) {
        pathRef.current.setAttribute('stroke-dasharray', `0 ${pd.len}`);
        return;
      }
      const visible = pd.len * progress;
      pathRef.current.setAttribute('stroke-dasharray', `${visible} ${pd.len - visible}`);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [arrivedAt, paused]);

  return (
    <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
      <path
        ref={pathRef}
        fill="none"
        stroke="#ef4444"
        strokeOpacity={0.85}
        strokeWidth={2}
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.6))' }}
      />
    </svg>
  );
}

function Shimmer({ w = 'w-20', h = 'h-3' }: { w?: string; h?: string }) {
  return <span className={`${w} ${h} rounded bg-white/10 animate-pulse inline-block`} />;
}

// --- Enriched expanded kill card ---
function ExpandedKillCard({
  ev,
  role,
  allianceId: _allianceId,
  onClose,
  cardRef,
}: {
  ev: WsKillEvent;
  role: AllianceRole;
  allianceId?: number;
  onClose: () => void;
  cardRef: React.Ref<HTMLDivElement>;
}) {
  const km = ev.killmail;
  const systemId = km.solar_system_id;

  const { data: enrichedKills, isLoading: enrichedLoading } = useQuery({
    queryKey: ['system-kills', systemId],
    queryFn: () =>
      apiJson<EnrichedKillmailRow[]>(`/api/map/system/${systemId}/kills?hours=24`),
    staleTime: 30_000,
  });

  const enriched = useMemo(
    () => enrichedKills?.find((k) => k.killmail_id === km.killmail_id) ?? null,
    [enrichedKills, km.killmail_id],
  );
  const loading = enrichedLoading || (!enriched && !enrichedKills);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isAllianceLoss = enriched ? !!enriched.victim_is_alliance : role === 'loss';
  const isAllianceKill = enriched ? !isAllianceLoss && !!enriched.attacker_is_alliance : role === 'kill';
  const fb = km.attackers.find((a) => a.final_blow);
  const isSolo = enriched ? enriched.is_solo : ev.zkb.solo;
  const attackerCount = enriched ? enriched.attacker_count : km.attackers.length;

  return (
    <motion.div
      ref={cardRef}
      key={`expanded-${km.killmail_id}`}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'mb-2 rounded-lg border bg-pochven-surface/95 backdrop-blur-lg w-full max-w-lg pointer-events-auto relative overflow-hidden',
        isAllianceKill && 'border-green-500/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]',
        isAllianceLoss && 'border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.15)]',
        !isAllianceKill && !isAllianceLoss && 'border-pochven-border',
      )}
    >

      <div className="p-3.5">
        <div className="flex items-center gap-2.5">
          {/* Victim side */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0 w-14">
              <img src={eveShipRender(km.victim.ship_type_id, 64)} alt="" className="w-12 h-12 rounded bg-black/30" />
              {loading ? (
                <Shimmer w="w-12" />
              ) : enriched?.victim_ship_name ? (
                <span className="text-[11px] text-gray-600 truncate w-full text-center mt-0.5 leading-tight">
                  {enriched.victim_ship_name}
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {km.victim.character_id ? (
                  <>
                    <img src={evePortrait(km.victim.character_id, 64)} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                    <span className="text-sm text-gray-200 truncate font-medium">
                      {loading ? <Shimmer w="w-24" h="h-4" /> : (enriched?.victim_name ?? `Pilot ${km.victim.character_id}`)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-gray-500">Structure / NPC</span>
                )}
              </div>
              {(km.victim.corporation_id) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <img src={eveCorpLogo(enriched?.victim_corporation_id ?? km.victim.corporation_id, 32)} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                  {loading ? <Shimmer w="w-28" /> : (
                    <span className="text-xs text-gray-500 truncate">
                      {enriched?.victim_corp_name ?? enriched?.victim_corp_ticker ?? ''}
                    </span>
                  )}
                </div>
              )}
              {(km.victim.alliance_id) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <img src={eveAllianceLogo(Number(enriched?.victim_alliance_id ?? km.victim.alliance_id), 32)} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                  {loading ? <Shimmer w="w-32" /> : (
                    <span className="text-xs text-gray-500 truncate">
                      {enriched?.victim_alliance_name ?? enriched?.victim_alliance_ticker ?? ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Center: ISK + time + system + solo/fleet */}
          <div className="flex flex-col items-center flex-shrink-0 gap-0.5 px-2">
            <span
              className={cn(
                'text-sm font-bold',
                isAllianceKill ? 'text-green-400' : isAllianceLoss ? 'text-red-400' : 'text-gray-300',
              )}
            >
              {formatIsk(ev.zkb.totalValue)}
            </span>
            <span
              className={cn(
                'text-xs font-medium',
                isAllianceKill ? 'text-green-400' : isAllianceLoss ? 'text-red-400' : 'text-pochven-accent',
              )}
            >
              {ev.systemName}
            </span>
            <div className="flex items-center gap-0.5 text-[11px] text-gray-600">
              <Clock className="h-3 w-3" />
              {timeAgo(km.killmail_time)}
            </div>
            <div className={cn(
              'flex items-center gap-0.5 text-[11px] font-medium mt-0.5',
              isSolo ? 'text-yellow-400' : 'text-blue-400',
            )}>
              {isSolo ? 'Solo' : `Fleet (${attackerCount})`}
            </div>
          </div>

          {/* Attacker (final blow) side */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <div className="flex items-center gap-1.5 justify-end">
                {(enriched?.fb_character_id ?? fb?.character_id) ? (
                  <>
                    <span className="text-sm text-gray-200 truncate font-medium">
                      {loading ? <Shimmer w="w-24" h="h-4" /> : (enriched?.fb_character_name ?? `Pilot ${enriched?.fb_character_id ?? fb?.character_id}`)}
                    </span>
                    <img src={evePortrait(enriched?.fb_character_id ?? fb!.character_id!, 64)} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                  </>
                ) : (
                  <span className="text-sm text-gray-500">{km.attackers.length > 0 ? 'NPC' : '?'}</span>
                )}
              </div>
              {(fb?.corporation_id) && (
                <div className="flex items-center gap-1 mt-0.5 justify-end">
                  {loading ? <Shimmer w="w-28" /> : (
                    <span className="text-xs text-gray-500 truncate">
                      {enriched?.fb_corp_name ?? enriched?.fb_corp_ticker ?? ''}
                    </span>
                  )}
                  <img src={eveCorpLogo(Number(enriched?.fb_corporation_id ?? fb.corporation_id), 32)} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                </div>
              )}
              {(fb?.alliance_id) && (
                <div className="flex items-center gap-1 mt-0.5 justify-end">
                  {loading ? <Shimmer w="w-32" /> : (
                    <span className="text-xs text-gray-500 truncate">
                      {enriched?.fb_alliance_name ?? enriched?.fb_alliance_ticker ?? ''}
                    </span>
                  )}
                  <img src={eveAllianceLogo(Number(enriched?.fb_alliance_id ?? fb.alliance_id), 32)} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                </div>
              )}
            </div>
            {(enriched?.fb_ship_type_id ?? fb?.ship_type_id) && (
              <div className="flex flex-col items-center flex-shrink-0 w-14">
                <img src={eveShipRender(Number(enriched?.fb_ship_type_id ?? fb?.ship_type_id), 64)} alt="" className="w-12 h-12 rounded bg-black/30" />
                {loading ? (
                  <Shimmer w="w-12" />
                ) : enriched?.fb_ship_name ? (
                  <span className="text-[11px] text-gray-600 truncate w-full text-center mt-0.5 leading-tight">
                    {enriched.fb_ship_name}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {ev.zkb.npc && <span className="text-blue-400">NPC</span>}
          </div>
          <a
            href={`https://zkillboard.com/kill/${km.killmail_id}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            zKillboard
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// --- Main ticker ---
export default function KillTicker() {
  const recentKills = useWsStore((s) => s.recentKills);
  const allianceId = useAuthStore((s) => s.character?.allianceId);
  const [expandedKillId, setExpandedKillId] = useState<number | null>(null);
  const [cardAnimating, setCardAnimating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const tickerBarRef = useRef<HTMLDivElement>(null);
  const pauseBonusRef = useRef(new Map<number, number>());
  const lastExpandedRef = useRef<{ id: number; at: number } | null>(null);

  // Track pause durations so the expiry filter accounts for time spent paused
  useEffect(() => {
    if (expandedKillId) {
      lastExpandedRef.current = { id: expandedKillId, at: Date.now() };
    } else if (lastExpandedRef.current) {
      const { id, at } = lastExpandedRef.current;
      const prev = pauseBonusRef.current.get(id) ?? 0;
      pauseBonusRef.current.set(id, prev + (Date.now() - at));
      lastExpandedRef.current = null;
    }
  }, [expandedKillId]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const kills = (recentKills.filter((ev) => ev.type === 'kill.new').slice(0, 8) as WsKillEvent[])
    .filter((ev) => {
      const killId = ev.killmail.killmail_id;
      const arrivedAt = killArrivalTimes.get(killId);
      if (!arrivedAt) return true;
      const bonus = pauseBonusRef.current.get(killId) ?? 0;
      const activePause = (expandedKillId === killId && lastExpandedRef.current)
        ? Date.now() - lastExpandedRef.current.at : 0;
      return (now - arrivedAt - bonus - activePause) < TIMER_DURATION_MS;
    });

  useEffect(() => {
    if (expandedKillId && !kills.some((k) => k.killmail.killmail_id === expandedKillId)) {
      setExpandedKillId(null);
    }
    const activeIds = new Set(kills.map((k) => k.killmail.killmail_id));
    for (const key of pauseBonusRef.current.keys()) {
      if (!activeIds.has(key)) pauseBonusRef.current.delete(key);
    }
  }, [kills, expandedKillId]);

  // Click-outside: close if click is outside both the card AND the ticker bar
  useEffect(() => {
    if (!expandedKillId) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        cardRef.current && !cardRef.current.contains(target) &&
        tickerBarRef.current && !tickerBarRef.current.contains(target)
      ) {
        setExpandedKillId(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [expandedKillId]);

  const handleTickerClick = useCallback(
    (killId: number) => {
      setExpandedKillId((prev) => {
        const next = prev === killId ? null : killId;
        if (next) setCardAnimating(true);
        return next;
      });
    },
    [],
  );

  return (
    <div className={cn(
      'absolute bottom-0 left-0 right-0 flex flex-col items-start pb-2 px-4 overflow-hidden pointer-events-none transition-[background] duration-300',
      (expandedKillId || cardAnimating) ? 'bg-transparent' : 'bg-gradient-to-t from-pochven-bg via-pochven-bg/90 to-transparent',
    )}>
      <AnimatePresence mode="wait" onExitComplete={() => setCardAnimating(false)}>
        {expandedKillId && (() => {
          const ev = kills.find((k) => k.killmail.killmail_id === expandedKillId);
          if (!ev) return null;
          const role = getAllianceRole(ev, allianceId);
          return (
            <ExpandedKillCard
              key={`expanded-${expandedKillId}`}
              ev={ev}
              role={role}
              allianceId={allianceId}
              onClose={() => setExpandedKillId(null)}
              cardRef={cardRef}
            />
          );
        })()}
      </AnimatePresence>

      <div ref={tickerBarRef} className="flex gap-2.5 overflow-hidden h-10 items-end pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {kills.map((ev) => {
            const role = getAllianceRole(ev, allianceId);
            const isExpanded = expandedKillId === ev.killmail.killmail_id;
            const km = ev.killmail;
            const victimCorpId = km.victim.corporation_id;
            const victimAllianceId = km.victim.alliance_id;
            return (
              <motion.button
                key={km.killmail_id}
                layout="position"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                onClick={() => handleTickerClick(km.killmail_id)}
                className={cn(
                  'relative flex items-center gap-1.5 text-xs whitespace-nowrap rounded-md px-2 py-1.5',
                  isExpanded
                    ? role === 'kill'
                      ? 'bg-green-500/20 text-white shadow-lg'
                      : role === 'loss'
                        ? 'bg-red-500/20 text-white shadow-lg'
                        : 'bg-white/5 text-white shadow-lg'
                    : 'bg-pochven-surface/80',
                )}
              >
                <SnakeTimerBorder arrivedAt={killArrivalTimes.get(km.killmail_id) ?? Date.now()} paused={isExpanded} />

                {role && allianceId && (
                  <img
                    src={eveAllianceLogo(allianceId, 32)}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm relative z-[1]"
                  />
                )}
                <span
                  className={cn(
                    'font-medium relative z-[1]',
                    role === 'kill' ? 'text-green-400' : role === 'loss' ? 'text-red-400' : 'text-gray-400',
                  )}
                >
                  {ev.systemName}
                </span>
                <span className={cn(
                  'relative z-[1]',
                  role === 'kill' ? 'text-green-400/70' : role === 'loss' ? 'text-red-400/70' : 'text-gray-500',
                )}>
                  {formatIsk(ev.zkb.totalValue)}
                </span>
                {victimCorpId && (
                  <img src={eveCorpLogo(victimCorpId, 32)} alt="" className="w-3 h-3 rounded-sm relative z-[1] opacity-60" />
                )}
                {victimAllianceId && (
                  <img src={eveAllianceLogo(Number(victimAllianceId), 32)} alt="" className="w-3 h-3 rounded-sm relative z-[1] opacity-60" />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
