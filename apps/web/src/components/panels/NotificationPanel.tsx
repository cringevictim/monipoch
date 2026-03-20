import { useState, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Trash2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch, apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSoundPreferences } from '@/stores/sound-preferences';
import {
  playKillSound,
  playFightSound,
  playCampSound,
  playRoamSound,
} from '@/lib/sounds';

interface AlertRule {
  id: number;
  user_id: number;
  event_type: string;
  conditions: Record<string, unknown>;
  enabled: boolean;
  browser_notify: boolean;
  discord_notify: boolean;
  created_at: string;
}

interface DiscordWebhook {
  id: number;
  name: string;
  configured: boolean;
  eventTypes: string[];
  enabled: boolean;
}

const EVENT_TYPES = [
  { value: 'killmail.pochven', label: 'High Value Kill' },
  { value: 'fight.update', label: 'Large Fight' },
  { value: 'camp.detected', label: 'Gate Camp Detected' },
  { value: 'roam.tracked', label: 'Roaming Fleet' },
] as const;

function eventLabel(value: string): string {
  return EVENT_TYPES.find((e) => e.value === value)?.label ?? value;
}

function formatConditionsSummary(conditions: Record<string, unknown>): string {
  const parts: string[] = [];
  if (conditions.system && typeof conditions.system === 'string') {
    parts.push(`System: ${conditions.system}`);
  }
  if (conditions.minIsk != null && typeof conditions.minIsk === 'number') {
    parts.push(`Min ISK: ${conditions.minIsk.toLocaleString()}`);
  }
  if (conditions.min_isk != null && typeof conditions.min_isk === 'number') {
    parts.push(`Min ISK: ${conditions.min_isk.toLocaleString()}`);
  }
  return parts.length > 0 ? parts.join(' • ') : 'No filters';
}

export default function NotificationPanel() {
  const queryClient = useQueryClient();
  const [showAddRule, setShowAddRule] = useState(false);
  const [discordMessage, setDiscordMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery<AlertRule[]>({
    queryKey: ['notifications', 'rules'],
    queryFn: () => apiJson<AlertRule[]>('/api/notifications/rules'),
  });

  const { data: discordConfig, isLoading: discordLoading } = useQuery<
    DiscordWebhook | null
  >({
    queryKey: ['notifications', 'discord'],
    queryFn: async () => {
      const data = await apiJson<DiscordWebhook | null>('/api/notifications/discord');
      return data ?? null;
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (body: {
      eventType: string;
      conditions: Record<string, unknown>;
      browserNotify: boolean;
      discordNotify: boolean;
    }) => {
      const res = await apiFetch('/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
      setShowAddRule(false);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/notifications/rules/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete rule');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
    },
  });

  const saveDiscordMutation = useMutation({
    mutationFn: async (body: {
      url: string;
      name: string;
      eventTypes: string[];
    }) => {
      const res = await apiFetch('/api/notifications/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save Discord config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'discord'] });
      setDiscordMessage({ type: 'success', text: 'Discord webhook saved' });
    },
    onError: (err) => {
      setDiscordMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save',
      });
    },
  });

  const testDiscordMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiFetch('/api/notifications/discord/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error('Test failed');
      return res.json();
    },
    onSuccess: () => {
      setDiscordMessage({ type: 'success', text: 'Test message sent' });
    },
    onError: (err) => {
      setDiscordMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Test failed',
      });
    },
  });

  return (
    <div className="flex h-full flex-col bg-pochven-surface">
      <Tabs
        defaultValue="rules"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 border-b border-pochven-border px-4 py-3">
          <TabsList className="w-full bg-pochven-bg/50">
            <TabsTrigger
              value="rules"
              className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Alert Rules
            </TabsTrigger>
            <TabsTrigger
              value="discord"
              className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Discord
            </TabsTrigger>
            <TabsTrigger
              value="sounds"
              className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Sounds
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="rules"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">
                  Alert Rules
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-pochven-border text-pochven-accent hover:bg-pochven-accent/10"
                  onClick={() => setShowAddRule(true)}
                >
                  Add Rule
                </Button>
              </div>

              {showAddRule && (
                <AddRuleForm
                  onSubmit={(data) => createRuleMutation.mutate(data)}
                  onCancel={() => setShowAddRule(false)}
                  isSubmitting={createRuleMutation.isPending}
                />
              )}

              {rulesLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading...
                </div>
              ) : rules.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No alert rules configured
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onDelete={() => deleteRuleMutation.mutate(rule.id)}
                      isDeleting={
                        deleteRuleMutation.isPending &&
                        deleteRuleMutation.variables === rule.id
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="discord"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <DiscordTab
              config={discordConfig}
              isLoading={discordLoading}
              message={discordMessage}
              onMessageClear={() => setDiscordMessage(null)}
              onSave={(data) => saveDiscordMutation.mutate(data)}
              onTest={(url) => testDiscordMutation.mutate(url)}
              isSaving={saveDiscordMutation.isPending}
              isTesting={testDiscordMutation.isPending}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="sounds"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <SoundsTab />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AddRuleFormProps {
  onSubmit: (data: {
    eventType: string;
    conditions: Record<string, unknown>;
    browserNotify: boolean;
    discordNotify: boolean;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function AddRuleForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: AddRuleFormProps) {
  const [eventType, setEventType] = useState<string>(EVENT_TYPES[0].value);
  const [system, setSystem] = useState('');
  const [minIsk, setMinIsk] = useState('');
  const [browserNotify, setBrowserNotify] = useState(true);
  const [discordNotify, setDiscordNotify] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const conditions: Record<string, unknown> = {};
    if (system.trim()) conditions.system = system.trim();
    const minIskNum = parseInt(minIsk, 10);
    if (!Number.isNaN(minIskNum) && minIskNum > 0) {
      conditions.minIsk = minIskNum;
    }
    onSubmit({
      eventType,
      conditions,
      browserNotify,
      discordNotify,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-4 space-y-4"
    >
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400">
          Event type
        </label>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm',
            'text-gray-200 border-pochven-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          )}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400">
          System filter (optional)
        </label>
        <Input
          placeholder="e.g. Jita"
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          className="bg-pochven-bg/50 border-pochven-border text-gray-300"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400">
          Min ISK filter (optional)
        </label>
        <Input
          type="number"
          placeholder="e.g. 1000000000"
          value={minIsk}
          onChange={(e) => setMinIsk(e.target.value)}
          className="bg-pochven-bg/50 border-pochven-border text-gray-300"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Browser notification</span>
        <Switch checked={browserNotify} onCheckedChange={setBrowserNotify} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Discord notification</span>
        <Switch checked={discordNotify} onCheckedChange={setDiscordNotify} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          className="bg-pochven-accent hover:bg-pochven-accent/90"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="border-pochven-border"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface RuleCardProps {
  rule: AlertRule;
  onDelete: () => void;
  isDeleting: boolean;
}

function RuleCard({ rule, onDelete, isDeleting }: RuleCardProps) {
  return (
    <div className="rounded-lg border border-pochven-border bg-pochven-bg/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Badge
            variant="outline"
            className="mb-1.5 border-pochven-accent/40 text-pochven-accent"
          >
            {eventLabel(rule.event_type)}
          </Badge>
          <p className="text-xs text-gray-400">
            {formatConditionsSummary(rule.conditions)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-[11px] text-gray-500">
              Browser: {rule.browser_notify ? 'On' : 'Off'}
            </span>
            <span className="text-[11px] text-gray-500">
              Discord: {rule.discord_notify ? 'On' : 'Off'}
            </span>
            {!rule.enabled && (
              <Badge variant="secondary" className="text-[10px]">
                Disabled
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-gray-400 hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface DiscordTabProps {
  config: DiscordWebhook | null | undefined;
  isLoading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  onMessageClear: () => void;
  onSave: (data: { url: string; name: string; eventTypes: string[] }) => void;
  onTest: (url: string) => void;
  isSaving: boolean;
  isTesting: boolean;
}

function DiscordTab({
  config,
  isLoading,
  message,
  onMessageClear,
  onSave,
  onTest,
  isSaving,
  isTesting,
}: DiscordTabProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  useEffect(() => {
    if (config) {
      setUrl('');
      setName(config.name ?? '');
      setEventTypes(config.eventTypes ?? []);
    } else {
      setUrl('');
      setName('');
      setEventTypes([]);
    }
  }, [config]);

  const toggleEventType = (et: string) => {
    setEventTypes((prev) =>
      prev.includes(et) ? prev.filter((e) => e !== et) : [...prev, et]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ url: url.trim(), name: name.trim(), eventTypes });
  };

  const handleTest = () => {
    if (url.trim()) onTest(url.trim());
  };

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-3">
      <h3 className="text-sm font-medium text-gray-300">Discord Webhook</h3>

      {message && (
        <div
          className={cn(
            'rounded-md px-3 py-2 text-sm',
            message.type === 'success'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'bg-red-500/20 text-red-400 border border-red-500/40'
          )}
        >
          {message.text}
          <button
            type="button"
            className="ml-2 underline"
            onClick={onMessageClear}
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400">
            Webhook URL
          </label>
          <Input
            placeholder="https://discord.com/api/webhooks/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-pochven-bg/50 border-pochven-border text-gray-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400">
            Webhook name
          </label>
          <Input
            placeholder="e.g. Monipoch Alerts"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-pochven-bg/50 border-pochven-border text-gray-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400">
            Event types to forward
          </label>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((et) => (
              <label
                key={et.value}
                className="flex cursor-pointer items-center gap-1.5 rounded border border-pochven-border px-2.5 py-1.5 text-sm text-gray-300 hover:bg-pochven-bg/50"
              >
                <input
                  type="checkbox"
                  checked={eventTypes.includes(et.value)}
                  onChange={() => toggleEventType(et.value)}
                  className="rounded border-pochven-border"
                />
                {et.label}
              </label>
            ))}
          </div>
        </div>

        <Separator className="bg-pochven-border" />

        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={isSaving}
            className="bg-pochven-accent hover:bg-pochven-accent/90"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !url.trim()}
            className="border-pochven-border"
          >
            Test
          </Button>
        </div>
      </form>
    </div>
  );
}

const SOUND_OPTIONS = [
  {
    key: 'kill_sound' as const,
    label: 'Kills',
    description: 'Play a sound when a new kill appears on the map',
    play: playKillSound,
  },
  {
    key: 'fight_sound' as const,
    label: 'Fights',
    description: 'Play a sound when a fight is detected or escalates',
    play: playFightSound,
  },
  {
    key: 'camp_sound' as const,
    label: 'Gate Camps',
    description: 'Play a sound when a gate camp is detected',
    play: playCampSound,
  },
  {
    key: 'roam_sound' as const,
    label: 'Roaming Fleets',
    description: 'Play a sound when a roaming fleet is tracked',
    play: playRoamSound,
  },
] as const;

function SoundsTab() {
  const { preferences, loaded, load, update } = useSoundPreferences();

  useEffect(() => {
    load();
  }, [load]);

  if (!loaded) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-3">
      <h3 className="text-sm font-medium text-gray-300">Map Event Sounds</h3>
      <p className="text-xs text-gray-500">
        Toggle sounds for events that appear on the map. Click the speaker icon
        to preview each sound.
      </p>

      <div className="space-y-2">
        {SOUND_OPTIONS.map((opt) => (
          <div
            key={opt.key}
            className="flex items-center justify-between rounded-lg border border-pochven-border bg-pochven-bg/50 p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">
                {opt.label}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {opt.description}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={opt.play}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="Preview sound"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <Switch
                checked={preferences[opt.key]}
                onCheckedChange={(checked) =>
                  update({ [opt.key]: checked })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
