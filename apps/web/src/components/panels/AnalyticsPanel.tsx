import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { cn } from '@/lib/utils';
import { apiJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';
import { Skull, TrendingUp, Search } from 'lucide-react';
import {
  HostileDetailDialog,
  type HostileProfile,
} from './HostileDetailDialog';

interface KillStat {
  date: string;
  kills: number;
  iskDestroyed: number;
}

interface TopPilot {
  characterId: number;
  characterName: string;
  corporationId: number | null;
  corporationName: string | null;
  allianceId: number | null;
  allianceName: string | null;
  kills: number;
  finalBlows: number;
  iskDestroyed: number;
}

interface ShipMeta {
  shipTypeId: number;
  shipName: string;
  count: number;
  iskDestroyed: number;
}

interface ISKEfficiency {
  totalDestroyed: number;
  totalLost: number;
  efficiency: number;
}

interface TopLoss {
  characterId: number;
  characterName: string;
  deaths: number;
  totalLost: number;
}

function formatISK(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

function evePortrait(id: number, size = 64) {
  return `https://images.evetech.net/characters/${id}/portrait?size=${size}`;
}
function eveCorpLogo(id: number, size = 32) {
  return `https://images.evetech.net/corporations/${id}/logo?size=${size}`;
}
function eveAllianceLogo(id: number, size = 32) {
  return `https://images.evetech.net/alliances/${id}/logo?size=${size}`;
}
function eveShipRender(id: number, size = 64) {
  return `https://images.evetech.net/types/${id}/render?size=${size}`;
}

const TIME_PERIODS = [
  { label: '24H', days: 1 },
  { label: '3D', days: 3 },
  { label: '7D', days: 7 },
] as const;

const DEFAULT_LIMIT = 20;

function PilotList({
  pilots,
  isLoading,
}: {
  pilots: TopPilot[];
  isLoading: boolean;
}) {
  if (isLoading) return <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>;
  if (pilots.length === 0)
    return <div className="text-sm text-gray-500 py-6 text-center">No pilot data</div>;

  return (
    <div className="space-y-1">
      {pilots.map((p, idx) => (
        <div
          key={p.characterId}
          className="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/5 transition-colors"
        >
          <span className="text-xs text-gray-600 w-5 text-right font-mono flex-shrink-0">
            {idx + 1}
          </span>
          <img
            src={evePortrait(p.characterId)}
            alt=""
            className="w-8 h-8 rounded-full flex-shrink-0 bg-black/30"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <a
              href={`https://zkillboard.com/character/${p.characterId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-200 hover:text-white font-medium truncate block transition-colors"
            >
              {p.characterName}
            </a>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {p.corporationId && (
                <>
                  <img
                    src={eveCorpLogo(p.corporationId)}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                    loading="lazy"
                  />
                  <span className="text-[10px] text-gray-500 truncate max-w-[80px]">
                    {p.corporationName ?? `Corp #${p.corporationId}`}
                  </span>
                </>
              )}
              {p.allianceId && (
                <>
                  <span className="text-gray-700 flex-shrink-0">&middot;</span>
                  <img
                    src={eveAllianceLogo(p.allianceId)}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                    loading="lazy"
                  />
                  <span className="text-[10px] text-gray-500 truncate max-w-[80px]">
                    {p.allianceName ?? `Alliance #${p.allianceId}`}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
            <span className="text-xs font-semibold text-gray-300">{p.kills} kills</span>
            <span className="text-[10px] text-gray-500">
              {p.finalBlows} FB &middot; {formatISK(p.iskDestroyed)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShipList({
  ships,
  isLoading,
}: {
  ships: ShipMeta[];
  isLoading: boolean;
}) {
  if (isLoading) return <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>;
  if (ships.length === 0)
    return <div className="text-sm text-gray-500 py-6 text-center">No ship data</div>;

  const maxCount = Math.max(...ships.map((d) => d.count), 1);

  return (
    <div className="space-y-1">
      {ships.map((s, idx) => {
        const pct = (s.count / maxCount) * 100;
        return (
          <div
            key={s.shipTypeId}
            className="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/5 transition-colors"
          >
            <span className="text-xs text-gray-600 w-5 text-right font-mono flex-shrink-0">
              {idx + 1}
            </span>
            <img
              src={eveShipRender(s.shipTypeId)}
              alt=""
              className="w-8 h-8 rounded flex-shrink-0 bg-black/30"
              loading="lazy"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 font-medium truncate">{s.shipName}</div>
              <div className="flex-1 h-2 bg-pochven-bg/50 rounded overflow-hidden mt-1">
                <div
                  className="h-full bg-pochven-accent/40 rounded"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
              <span className="text-xs font-semibold text-gray-300">{s.count} uses</span>
              <span className="text-[10px] text-gray-500">{formatISK(s.iskDestroyed)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScopeTabs({
  scope,
  setScope,
  allianceName,
  allianceId,
}: {
  scope: 'all' | 'alliance';
  setScope: (v: 'all' | 'alliance') => void;
  allianceName: string;
  allianceId?: number;
}) {
  if (!allianceId) return null;

  return (
    <div className="flex gap-0.5 bg-pochven-bg/50 rounded-md p-0.5">
      <button
        onClick={() => setScope('alliance')}
        className={cn(
          'text-[10px] py-1 px-2 rounded transition-colors font-medium flex items-center gap-1',
          scope === 'alliance'
            ? 'bg-pochven-accent/20 text-pochven-accent'
            : 'text-gray-500 hover:text-gray-300',
        )}
      >
        <img
          src={eveAllianceLogo(allianceId, 32)}
          alt=""
          className="w-3 h-3 rounded-sm"
        />
        {allianceName}
      </button>
      <button
        onClick={() => setScope('all')}
        className={cn(
          'text-[10px] py-1 px-2 rounded transition-colors font-medium',
          scope === 'all'
            ? 'bg-pochven-accent/20 text-pochven-accent'
            : 'text-gray-500 hover:text-gray-300',
        )}
      >
        All
      </button>
    </div>
  );
}

function getThreatBadgeClass(score: number): string {
  if (score < 20) return 'bg-green-500/20 text-green-400 border-green-500/40';
  if (score < 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  if (score < 80) return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
  return 'bg-red-500/20 text-red-400 border-red-500/40';
}

function getEntityTypeBadgeClass(type: HostileProfile['entity_type']): string {
  switch (type) {
    case 'character':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
    case 'corporation':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
    case 'alliance':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
  }
}

function eveEntityIcon(entityType: string, entityId: number, size = 32) {
  if (entityType === 'character')
    return `https://images.evetech.net/characters/${entityId}/portrait?size=${size}`;
  if (entityType === 'corporation')
    return `https://images.evetech.net/corporations/${entityId}/logo?size=${size}`;
  return `https://images.evetech.net/alliances/${entityId}/logo?size=${size}`;
}

function getTopShipIds(profile: HostileProfile, limit = 3): number[] {
  const entries = Object.entries(profile.preferred_ship_types ?? {});
  return entries
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => Number(id));
}

type SortField = 'entity_name' | 'threat_score' | 'total_kills' | 'last_seen';
type SortDir = 'asc' | 'desc';

function HostilesTab({ days }: { days: number }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('threat_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedProfile, setSelectedProfile] = useState<HostileProfile | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const sortHeader = useCallback(
    (field: SortField, label: string) => (
      <button
        type="button"
        className="flex items-center gap-1 hover:text-gray-200 transition-colors"
        onClick={() => toggleSort(field)}
      >
        {label}
        {sortField === field && (
          <span className="text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </button>
    ),
    [sortField, sortDir, toggleSort],
  );

  const hours = days * 24;
  const { data: activeData, isLoading } = useQuery({
    queryKey: ['hostiles', 'active', hours],
    queryFn: () => apiJson<HostileProfile[]>(`/api/intel/hostiles/active?hours=${hours}`),
    staleTime: 30_000,
  });

  const profiles = activeData ?? [];

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase().trim();
    return profiles.filter((p) => p.entity_name.toLowerCase().includes(q));
  }, [profiles, search]);

  const sortedProfiles = useMemo(() => {
    return [...filteredProfiles].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string')
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      if (typeof aVal === 'number' && typeof bVal === 'number')
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      return 0;
    });
  }, [filteredProfiles, sortField, sortDir]);

  return (
    <>
      <ScrollArea className="h-full">
        <div className="px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder="Search hostiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-pochven-bg/50 border-pochven-border text-gray-300 placeholder:text-gray-500"
            />
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading...</div>
          ) : sortedProfiles.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No hostile activity detected</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-pochven-border hover:bg-transparent">
                  <TableHead className="text-gray-400">{sortHeader('entity_name', 'Entity')}</TableHead>
                  <TableHead className="text-gray-400">{sortHeader('threat_score', 'Threat')}</TableHead>
                  <TableHead className="text-gray-400">{sortHeader('total_kills', 'Kills')}</TableHead>
                  <TableHead className="text-gray-400">{sortHeader('last_seen', 'Last Seen')}</TableHead>
                  <TableHead className="text-gray-400">Ships</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProfiles.map((profile) => (
                  <TableRow
                    key={`${profile.entity_type}-${profile.entity_id}`}
                    className="cursor-pointer border-pochven-border text-gray-300 hover:bg-pochven-bg/50"
                    onClick={() => { setSelectedProfile(profile); setDetailOpen(true); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <img
                          src={eveEntityIcon(profile.entity_type, profile.entity_id, 64)}
                          alt=""
                          className="w-7 h-7 rounded-full flex-shrink-0 bg-black/30"
                          loading="lazy"
                        />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium text-gray-200 truncate">{profile.entity_name}</span>
                          <Badge variant="outline" className={cn('w-fit text-[10px]', getEntityTypeBadgeClass(profile.entity_type))}>
                            {profile.entity_type}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('font-mono text-xs', getThreatBadgeClass(profile.threat_score ?? 0))}>
                        {(profile.threat_score ?? 0).toFixed(0)}
                      </Badge>
                    </TableCell>
                    <TableCell>{(profile.total_kills ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{timeAgo(profile.last_seen)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getTopShipIds(profile).length > 0
                          ? getTopShipIds(profile).map((id) => (
                              <img key={id} src={eveShipRender(id, 64)} alt="" className="w-6 h-6 rounded bg-black/30" loading="lazy" />
                            ))
                          : <span className="text-xs text-gray-500">&mdash;</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </ScrollArea>

      <HostileDetailDialog
        profile={selectedProfile}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}

export default function AnalyticsPanel() {
  const character = useAuthStore((s) => s.character);
  const allianceId = character?.allianceId;
  const allianceName = character?.allianceName ?? 'My Alliance';

  const [scope, setScope] = useState<'all' | 'alliance'>(allianceId ? 'alliance' : 'all');
  const [days, setDays] = useState(7);

  const allianceFilter = scope === 'alliance' && allianceId ? `&allianceId=${allianceId}` : '';

  const scopeKey = scope === 'alliance' ? allianceId : 'all';

  const { data: killStats = [], isLoading: killStatsLoading } = useQuery<KillStat[]>({
    queryKey: ['analytics', 'kill-stats', days, scopeKey],
    queryFn: () => apiJson<KillStat[]>(`/api/analytics/kill-stats?days=${days}${allianceFilter}`),
    staleTime: 30_000,
  });

  const { data: topPilots = [], isLoading: pilotsLoading } = useQuery<TopPilot[]>({
    queryKey: ['analytics', 'top-pilots', days, DEFAULT_LIMIT, scopeKey],
    queryFn: () =>
      apiJson<TopPilot[]>(
        `/api/analytics/top-pilots?days=${days}&limit=${DEFAULT_LIMIT}${allianceFilter}`,
      ),
    staleTime: 30_000,
  });

  const { data: shipMeta = [], isLoading: shipsLoading } = useQuery<ShipMeta[]>({
    queryKey: ['analytics', 'ship-meta', days, DEFAULT_LIMIT, scopeKey],
    queryFn: () =>
      apiJson<ShipMeta[]>(
        `/api/analytics/ship-meta?days=${days}&limit=${DEFAULT_LIMIT}${allianceFilter}`,
      ),
    staleTime: 30_000,
  });

  const { data: iskEfficiency, isLoading: efficiencyLoading } = useQuery<ISKEfficiency>({
    queryKey: ['analytics', 'isk-efficiency', days, scopeKey],
    queryFn: () => apiJson<ISKEfficiency>(`/api/analytics/isk-efficiency?days=${days}${allianceFilter}`),
    staleTime: 30_000,
  });

  const { data: topLosses = [], isLoading: lossesLoading } = useQuery<TopLoss[]>({
    queryKey: ['analytics', 'top-losses', days, scopeKey],
    queryFn: () =>
      apiJson<TopLoss[]>(`/api/analytics/top-losses?days=${days}&limit=5${allianceFilter}`),
    staleTime: 30_000,
  });

  const hourlyDays = days <= 1 ? 1 : days <= 3 ? 3 : 7;
  const { data: hourlyActivity = [] } = useQuery<{ hour: number; kills: number; isk: number }[]>({
    queryKey: ['analytics', 'hourly-activity', hourlyDays, scopeKey],
    queryFn: () =>
      apiJson<{ hour: number; kills: number; isk: number }[]>(
        `/api/analytics/hourly-activity?days=${hourlyDays}${allianceFilter}`,
      ),
    staleTime: 30_000,
  });

  const overviewStats = useMemo(() => {
    const totalKills = killStats.reduce((sum, s) => sum + s.kills, 0);
    const totalIsk = killStats.reduce((sum, s) => sum + s.iskDestroyed, 0);
    const activePilots = topPilots.length;
    return { totalKills, totalIsk, activePilots };
  }, [killStats, topPilots]);

  const efficiency = iskEfficiency?.efficiency ?? 0;
  const efficiencyColor =
    efficiency > 50 ? 'text-green-400' : efficiency < 50 ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="flex h-full flex-col bg-pochven-surface">
      <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-pochven-border px-4 py-3 space-y-2">
          <div>
            <TabsList className="w-full bg-pochven-bg/50">
              <TabsTrigger
                value="overview"
                className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
              >
                Activity
              </TabsTrigger>
              <TabsTrigger
                value="pilots"
                className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
              >
                Pilots
              </TabsTrigger>
              <TabsTrigger
                value="ships"
                className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
              >
                Ships
              </TabsTrigger>
              <TabsTrigger
                value="hostiles"
                className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent hidden"
              >
                Hostiles
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center justify-between gap-2">
            <ScopeTabs
              scope={scope}
              setScope={setScope}
              allianceName={allianceName}
              allianceId={allianceId}
            />
            <div className="flex gap-0.5 bg-pochven-bg/50 rounded-md p-0.5">
              {TIME_PERIODS.map((tp) => (
                <button
                  key={tp.days}
                  onClick={() => setDays(tp.days)}
                  className={cn(
                    'text-[10px] py-1 px-2 rounded transition-colors font-medium',
                    days === tp.days
                      ? 'bg-pochven-accent/20 text-pochven-accent'
                      : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  {tp.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Overview Tab */}
        <TabsContent
          value="overview"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 py-3">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Skull className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                      Total Kills
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-100">
                    {killStatsLoading ? '...' : overviewStats.totalKills.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                      ISK Destroyed
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-100">
                    {killStatsLoading ? '...' : formatISK(overviewStats.totalIsk)}
                  </div>
                </div>
              </div>

              {/* ISK Efficiency */}
              <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">
                  ISK Efficiency
                </div>
                {efficiencyLoading ? (
                  <div className="text-sm text-gray-500">Loading...</div>
                ) : (
                  <>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Destroyed: {formatISK(iskEfficiency?.totalDestroyed ?? 0)}</span>
                      <span>Lost: {formatISK(iskEfficiency?.totalLost ?? 0)}</span>
                    </div>
                    <div className="h-2 bg-pochven-bg rounded overflow-hidden mb-1">
                      <div
                        className={cn(
                          'h-full rounded',
                          efficiency > 50 ? 'bg-green-500/60' : 'bg-red-500/60',
                        )}
                        style={{ width: `${Math.min(efficiency, 100)}%` }}
                      />
                    </div>
                    <div className={cn('text-xl font-bold text-center', efficiencyColor)}>
                      {efficiency.toFixed(1)}%
                    </div>
                  </>
                )}
              </div>


              {/* Top 5 Pilots Mini-Leaderboard */}
              {topPilots.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Top Pilots
                  </h3>
                  <PilotList
                    pilots={topPilots.slice(0, 5)}
                    isLoading={pilotsLoading}
                  />
                </div>
              )}

              {/* Biggest Losses */}
              <div>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Biggest Losses
                </h3>
                {lossesLoading ? (
                  <div className="text-sm text-gray-500 py-4 text-center">Loading...</div>
                ) : topLosses.length === 0 ? (
                  <div className="text-sm text-gray-500 py-4 text-center">No losses</div>
                ) : (
                  <div className="space-y-1">
                    {topLosses.map((loss, idx) => (
                      <a
                        key={loss.characterId}
                        href={`https://zkillboard.com/character/${loss.characterId}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/5 transition-colors group"
                      >
                        <span className="text-xs text-gray-600 w-5 text-right font-mono flex-shrink-0">
                          {idx + 1}
                        </span>
                        <img
                          src={evePortrait(loss.characterId)}
                          alt=""
                          className="w-8 h-8 rounded-full flex-shrink-0 bg-black/30"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-200 group-hover:text-white font-medium truncate block transition-colors">
                            {loss.characterName}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {loss.deaths} death{loss.deaths !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-red-400 flex-shrink-0">
                          {formatISK(loss.totalLost)}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent
          value="activity"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 py-3">
              {killStatsLoading ? (
                <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>
              ) : killStats.length === 0 ? (
                <div className="text-sm text-gray-500 py-6 text-center">No data</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">
                        Avg Kills / Day
                      </div>
                      <div className="text-2xl font-bold text-gray-100">
                        {(killStats.reduce((s, d) => s + d.kills, 0) / (killStats.length || 1)).toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">
                        Avg ISK / Day
                      </div>
                      <div className="text-2xl font-bold text-gray-100">
                        {formatISK(killStats.reduce((s, d) => s + d.iskDestroyed, 0) / (killStats.length || 1))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-3">
                      {hourlyDays === 1 ? 'Kills — Last 24 Hours' : `Avg Kills / Hour — ${hourlyDays}D`}
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyActivity} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                          <XAxis
                            dataKey="hour"
                            tick={{ fill: '#9ca3af', fontSize: 9 }}
                            tickFormatter={(v) => `${Number(v)}:00`}
                            stroke="#ffffff10"
                            interval={2}
                          />
                          <YAxis
                            tick={{ fill: '#9ca3af', fontSize: 10 }}
                            stroke="#ffffff10"
                            allowDecimals={hourlyDays > 1}
                          />
                          <Tooltip
                            contentStyle={{
                              background: '#1a1010',
                              border: '1px solid #ffffff15',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelFormatter={(v) => `${Number(v)}:00 – ${Number(v) + 1}:00 EVE`}
                            formatter={(v) => {
                              const n = Number(v);
                              return [
                                hourlyDays > 1 ? n.toFixed(1) : n,
                                hourlyDays > 1 ? 'Avg Kills' : 'Kills',
                              ];
                            }}
                          />
                          <Bar
                            dataKey="kills"
                            fill="#ef4444"
                            fillOpacity={0.7}
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-3">
                      {hourlyDays === 1 ? 'ISK Destroyed — Last 24 Hours' : `Avg ISK Destroyed / Hour — ${hourlyDays}D`}
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyActivity} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                          <XAxis
                            dataKey="hour"
                            tick={{ fill: '#9ca3af', fontSize: 9 }}
                            tickFormatter={(v) => `${Number(v)}:00`}
                            stroke="#ffffff10"
                            interval={2}
                          />
                          <YAxis
                            tick={{ fill: '#9ca3af', fontSize: 10 }}
                            stroke="#ffffff10"
                            tickFormatter={(v) => formatISK(Number(v))}
                          />
                          <Tooltip
                            contentStyle={{
                              background: '#1a1010',
                              border: '1px solid #ffffff15',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelFormatter={(v) => `${Number(v)}:00 – ${Number(v) + 1}:00 EVE`}
                            formatter={(v) => [
                              formatISK(Number(v)),
                              hourlyDays > 1 ? 'Avg ISK' : 'ISK Destroyed',
                            ]}
                          />
                          <Bar
                            dataKey="isk"
                            fill="#f59e0b"
                            fillOpacity={0.7}
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Pilots Tab */}
        <TabsContent
          value="pilots"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="px-4 py-2">
              <PilotList
                pilots={topPilots}
                isLoading={pilotsLoading}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Ships Tab */}
        <TabsContent
          value="ships"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="px-4 py-3">
              <ShipList ships={shipMeta} isLoading={shipsLoading} />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Hostiles Tab */}
        <TabsContent
          value="hostiles"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <HostilesTab days={days} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
