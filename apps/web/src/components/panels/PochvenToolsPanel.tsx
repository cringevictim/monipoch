import { useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { POCHVEN_SYSTEMS, POCHVEN_SYSTEM_BY_ID } from '@monipoch/shared';
import { cn } from '@/lib/utils';
import { apiFetch, apiJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface IntelReport {
  id: number;
  solar_system_id: number | null;
  raw_text: string;
  parsed_ships: string[];
  pilot_count: number | null;
  reported_by_user_id: number;
  reported_at: string;
}

interface WormholeConnection {
  id: number;
  from_system_id: number;
  to_system_id: number;
  wormhole_type: string;
  estimated_eol: string | null;
  reported_at: string;
  reporter_name?: string;
}


function getSystemName(systemId: number): string {
  return POCHVEN_SYSTEM_BY_ID.get(systemId)?.name ?? `System ${systemId}`;
}

function formatTimeRemaining(eol: string | null): string {
  if (!eol) return 'Unknown';
  const end = new Date(eol).getTime();
  const now = Date.now();
  const ms = end - now;
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

export default function PochvenToolsPanel() {
  const queryClient = useQueryClient();

  const [intelText, setIntelText] = useState('');
  const [intelSystemId, setIntelSystemId] = useState<string>('');
  const [whFromId, setWhFromId] = useState<string>('');
  const [whToId, setWhToId] = useState<string>('');
  const [whType, setWhType] = useState('');
  const [whEol, setWhEol] = useState('');

  const { data: intelReports = [], isLoading: intelLoading } = useQuery<IntelReport[]>({
    queryKey: ['tools', 'intel'],
    queryFn: () => apiJson<IntelReport[]>('/api/tools/intel'),
    refetchInterval: 15_000,
  });

  const { data: wormholes = [], isLoading: whLoading } = useQuery<WormholeConnection[]>({
    queryKey: ['tools', 'wormholes'],
    queryFn: () => apiJson<WormholeConnection[]>('/api/tools/wormholes'),
    refetchInterval: 15_000,
  });

  const intelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/tools/intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: intelText,
          systemId: intelSystemId ? parseInt(intelSystemId, 10) : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit intel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', 'intel'] });
      setIntelText('');
      setIntelSystemId('');
    },
  });

  const whMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/tools/wormholes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromSystemId: parseInt(whFromId, 10),
          toSystemId: parseInt(whToId, 10),
          whType: whType || 'K162',
          estimatedEol: whEol ? new Date(whEol).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to report wormhole');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', 'wormholes'] });
      setWhFromId('');
      setWhToId('');
      setWhType('');
      setWhEol('');
    },
  });

  const closeWhMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/tools/wormholes/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to close connection');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', 'wormholes'] });
    },
  });

  return (
    <Tabs defaultValue="intel" className="h-full flex flex-col">
      <div className="px-4 pt-2 flex-shrink-0">
        <TabsList className="w-full bg-pochven-surface/80 border border-pochven-border">
          <TabsTrigger
            value="intel"
            className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
          >
            Intel
          </TabsTrigger>
          <TabsTrigger
            value="wormholes"
            className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
          >
            Wormholes
          </TabsTrigger>
          <TabsTrigger
            value="filament"
            className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
          >
            Filament
          </TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <TabsContent value="intel" className="m-0 p-4 pt-2 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="space-y-3">
            <textarea
              className={cn(
                'w-full min-h-[80px] rounded-md border border-pochven-border bg-pochven-bg/50 px-3 py-2 text-sm',
                'placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pochven-accent'
              )}
              placeholder="Paste intel e.g. 5 sabres + loki on Niarja gate..."
              value={intelText}
              onChange={(e) => setIntelText(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <Select value={intelSystemId || '__none__'} onValueChange={(v) => setIntelSystemId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="w-[140px] border-pochven-border bg-pochven-bg/50">
                  <SelectValue placeholder="System (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {POCHVEN_SYSTEMS.map((s) => (
                    <SelectItem key={s.systemId} value={String(s.systemId)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="bg-pochven-accent hover:bg-pochven-accent/80 text-pochven-bg"
                onClick={() => intelMutation.mutate()}
                disabled={!intelText.trim() || intelMutation.isPending}
              >
                Submit
              </Button>
            </div>
          </div>

          <Separator className="my-4 border-pochven-border" />

          {intelLoading ? (
            <div className="text-sm text-gray-500">Loading intel...</div>
          ) : intelReports.length === 0 ? (
            <div className="text-sm text-gray-500">No recent intel reports</div>
          ) : (
            <div className="space-y-3">
              {intelReports.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    'rounded-lg border border-pochven-border bg-pochven-bg/50 p-3'
                  )}
                >
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{timeAgo(r.reported_at)}</span>
                    {r.solar_system_id != null && (
                      <>
                        <span>•</span>
                        <span className="text-pochven-accent">
                          {getSystemName(r.solar_system_id)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-sm text-gray-200 mt-1">{r.raw_text}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Array.isArray(r.parsed_ships) &&
                      r.parsed_ships.map((ship) => (
                        <Badge
                          key={ship}
                          variant="secondary"
                          className="text-[10px] border-pochven-border text-gray-400"
                        >
                          {ship}
                        </Badge>
                      ))}
                    {r.pilot_count != null && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-pochven-accent/50 text-pochven-accent"
                      >
                        {r.pilot_count} pilots
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="wormholes" className="m-0 p-4 pt-2 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="space-y-3 mb-4">
            <div className="text-sm font-medium text-gray-300">Report Connection</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">From</label>
                <Select value={whFromId} onValueChange={setWhFromId}>
                  <SelectTrigger className="border-pochven-border bg-pochven-bg/50">
                    <SelectValue placeholder="System" />
                  </SelectTrigger>
                  <SelectContent>
                    {POCHVEN_SYSTEMS.map((s) => (
                      <SelectItem key={s.systemId} value={String(s.systemId)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">To</label>
                <Select value={whToId} onValueChange={setWhToId}>
                  <SelectTrigger className="border-pochven-border bg-pochven-bg/50">
                    <SelectValue placeholder="System" />
                  </SelectTrigger>
                  <SelectContent>
                    {POCHVEN_SYSTEMS.map((s) => (
                      <SelectItem key={s.systemId} value={String(s.systemId)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">WH Type</label>
                <Input
                  placeholder="C729, K162..."
                  value={whType}
                  onChange={(e) => setWhType(e.target.value)}
                  className="border-pochven-border bg-pochven-bg/50"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">EOL (optional)</label>
                <Input
                  type="datetime-local"
                  value={whEol}
                  onChange={(e) => setWhEol(e.target.value)}
                  className="border-pochven-border bg-pochven-bg/50"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="bg-pochven-accent hover:bg-pochven-accent/80 text-pochven-bg"
              onClick={() => whMutation.mutate()}
              disabled={
                !whFromId ||
                !whToId ||
                whMutation.isPending
              }
            >
              Report Connection
            </Button>
          </div>

          <Separator className="my-4 border-pochven-border" />

          {whLoading ? (
            <div className="text-sm text-gray-500">Loading wormholes...</div>
          ) : wormholes.length === 0 ? (
            <div className="text-sm text-gray-500">No active wormhole connections</div>
          ) : (
            <div className="space-y-3">
              {wormholes.map((wh) => (
                <div
                  key={wh.id}
                  className={cn(
                    'rounded-lg border border-pochven-border bg-pochven-bg/50 p-3'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-pochven-accent font-medium">
                        {getSystemName(wh.from_system_id)}
                      </span>
                      <span className="text-gray-500 mx-2">→</span>
                      <span className="text-pochven-accent font-medium">
                        {getSystemName(wh.to_system_id)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500 hover:text-red-400"
                      onClick={() => closeWhMutation.mutate(wh.id)}
                      disabled={closeWhMutation.isPending}
                    >
                      Close
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                    <Badge variant="outline" className="border-pochven-border">
                      {wh.wormhole_type || 'K162'}
                    </Badge>
                    <span>{formatTimeRemaining(wh.estimated_eol)} left</span>
                    {wh.reporter_name && (
                      <span>• {wh.reporter_name}</span>
                    )}
                    <span>• {timeAgo(wh.reported_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="filament" className="m-0 p-4 pt-2 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="text-sm text-gray-500">
            Filament intel features coming soon. Track filament connections and timers.
          </div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
