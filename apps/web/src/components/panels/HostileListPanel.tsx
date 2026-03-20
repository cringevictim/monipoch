import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  HostileDetailDialog,
  type HostileProfile,
} from './HostileDetailDialog';

type SortField = 'entity_name' | 'threat_score' | 'total_kills' | 'last_seen';
type SortDir = 'asc' | 'desc';

interface HostilesResponse {
  data: HostileProfile[];
  total: number;
  page: number;
}

function getThreatBadgeClass(score: number): string {
  if (score < 20) return 'bg-green-500/20 text-green-400 border-green-500/40';
  if (score < 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  if (score < 80) return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
  return 'bg-red-500/20 text-red-400 border-red-500/40';
}

function getEntityTypeBadgeClass(
  type: HostileProfile['entity_type'],
): string {
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

function eveShipRender(typeId: number, size = 32) {
  return `https://images.evetech.net/types/${typeId}/render?size=${size}`;
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

export default function HostileListPanel() {
  const [activeTab, setActiveTab] = useState<'active' | 'all' | 'top'>('active');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('threat_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
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

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['hostiles', 'active', 2],
    queryFn: () => apiJson<HostileProfile[]>('/api/intel/hostiles/active?hours=2'),
    enabled: activeTab === 'active',
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ['hostiles', 'all', page, sortField, sortDir],
    queryFn: () =>
      apiJson<HostilesResponse>(
        `/api/intel/hostiles?page=${page}&limit=50&sort=${sortField}&order=${sortDir}`,
      ),
    enabled: activeTab === 'all',
  });

  const { data: topData, isLoading: topLoading } = useQuery({
    queryKey: ['hostiles', 'top-threats', 20],
    queryFn: () => apiJson<HostileProfile[]>('/api/intel/hostiles/top-threats?limit=20'),
    enabled: activeTab === 'top',
  });

  const profiles = useMemo(() => {
    if (activeTab === 'active') return activeData ?? [];
    if (activeTab === 'top') return topData ?? [];
    return allData?.data ?? [];
  }, [activeTab, activeData, topData, allData]);

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase().trim();
    return profiles.filter((p) =>
      p.entity_name.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const sortedProfiles = useMemo(() => {
    if (activeTab === 'all') return filteredProfiles;
    return [...filteredProfiles].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [filteredProfiles, sortField, sortDir, activeTab]);

  const isLoading =
    (activeTab === 'active' && activeLoading) ||
    (activeTab === 'all' && allLoading) ||
    (activeTab === 'top' && topLoading);

  const handleRowClick = useCallback((profile: HostileProfile) => {
    setSelectedProfile(profile);
    setDetailOpen(true);
  }, []);

  return (
    <div className="flex h-full flex-col bg-pochven-surface">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'active' | 'all' | 'top')}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 space-y-3 border-b border-pochven-border px-4 py-3">
          <TabsList className="w-full justify-start bg-pochven-bg/50">
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Active
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              All Hostiles
            </TabsTrigger>
            <TabsTrigger
              value="top"
              className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Top Threats
            </TabsTrigger>
          </TabsList>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder="Search hostiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-pochven-bg/50 border-pochven-border text-gray-300 placeholder:text-gray-500"
            />
          </div>
        </div>

        <TabsContent
          value={activeTab}
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="px-4 pb-4">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading...
                </div>
              ) : sortedProfiles.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No hostile activity detected
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-pochven-border hover:bg-transparent">
                        <TableHead className="text-gray-400">
                          {sortHeader('entity_name', 'Entity')}
                        </TableHead>
                        <TableHead className="text-gray-400">
                          {sortHeader('threat_score', 'Threat')}
                        </TableHead>
                        <TableHead className="text-gray-400">
                          {sortHeader('total_kills', 'Kills')}
                        </TableHead>
                        <TableHead className="text-gray-400">
                          {sortHeader('last_seen', 'Last Seen')}
                        </TableHead>
                        <TableHead className="text-gray-400">Ships</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedProfiles.map((profile) => (
                        <TableRow
                          key={`${profile.entity_type}-${profile.entity_id}`}
                          className="cursor-pointer border-pochven-border text-gray-300 hover:bg-pochven-bg/50"
                          onClick={() => handleRowClick(profile)}
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
                                <span className="font-medium text-gray-200 truncate">
                                  {profile.entity_name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'w-fit text-[10px]',
                                    getEntityTypeBadgeClass(profile.entity_type),
                                  )}
                                >
                                  {profile.entity_type}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-mono text-xs',
                                getThreatBadgeClass(profile.threat_score ?? 0),
                              )}
                            >
                              {(profile.threat_score ?? 0).toFixed(0)}
                            </Badge>
                          </TableCell>
                          <TableCell>{(profile.total_kills ?? 0).toLocaleString()}</TableCell>
                          <TableCell>{timeAgo(profile.last_seen)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getTopShipIds(profile).length > 0
                                ? getTopShipIds(profile).map((id) => (
                                    <img
                                      key={id}
                                      src={eveShipRender(id, 64)}
                                      alt=""
                                      className="w-6 h-6 rounded bg-black/30"
                                      loading="lazy"
                                    />
                                  ))
                                : <span className="text-xs text-gray-500">&mdash;</span>
                              }
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {activeTab === 'all' && allData && allData.total > 50 && (
                    <div className="mt-3 flex items-center justify-between border-t border-pochven-border pt-3">
                      <span className="text-xs text-gray-500">
                        Page {page} of {Math.ceil(allData.total / 50)}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-pochven-border text-gray-300"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-pochven-border text-gray-300"
                          onClick={() =>
                            setPage((p) =>
                              Math.min(Math.ceil(allData.total / 50), p + 1),
                            )
                          }
                          disabled={page >= Math.ceil(allData.total / 50)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <HostileDetailDialog
        profile={selectedProfile}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
