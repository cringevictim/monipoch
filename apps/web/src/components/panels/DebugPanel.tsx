import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, X, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Scenario {
  id: string;
  label: string;
  description: string;
  category: 'kills' | 'fights' | 'tactical' | 'misc';
  color: string;
}

const SCENARIOS: Scenario[] = [
  { id: 'kill', label: 'Single Kill', description: 'Full pipeline — ticker, heatmap, detection', category: 'kills', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { id: 'kill-expensive', label: '10B Kill', description: 'High-value kill through full pipeline', category: 'kills', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { id: 'kill-burst', label: 'Kill Burst (5x)', description: 'Rapid-fire 5 kills, triggers fights', category: 'kills', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { id: 'fight-start', label: 'Fight Start', description: 'Fight indicator on map', category: 'fights', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { id: 'fight-escalate', label: 'Fight Escalate', description: 'Upgrade ongoing fight', category: 'fights', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { id: 'fight-end', label: 'Fight End', description: 'Conclude active fight', category: 'fights', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { id: 'camp', label: 'Gate Camp', description: 'Camp indicator on map', category: 'tactical', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { id: 'roam', label: 'Roaming Fleet', description: 'Roam indicator on map', category: 'tactical', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { id: 'notification', label: 'Notification', description: 'Browser notification', category: 'misc', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { id: 'clear', label: 'Clear Tactical', description: 'Remove all debug camps/roams', category: 'misc', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
];

const SYSTEMS = [
  { systemId: 30001372, name: 'Kino' },
  { systemId: 30003495, name: 'Raravoss' },
  { systemId: 30000206, name: 'Wirashoda' },
  { systemId: 30002411, name: 'Skarkon' },
  { systemId: 30005005, name: 'Ignebaener' },
  { systemId: 30003465, name: 'Tabbetzur' },
];

const CATEGORIES = [
  { key: 'kills', label: 'Kills' },
  { key: 'fights', label: 'Fights' },
  { key: 'tactical', label: 'Tactical Intel' },
  { key: 'misc', label: 'Misc' },
] as const;

interface LogEntry {
  id: number;
  time: string;
  scenario: string;
  result: string;
  ok: boolean;
}

let logIdCounter = 0;

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<number | undefined>(undefined);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [firing, setFiring] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const fire = useCallback(async (scenarioId: string) => {
    setFiring(scenarioId);
    try {
      const resp = await apiFetch(`/api/debug/simulate/${scenarioId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedSystem ? { systemId: selectedSystem } : {}),
      });
      const data = await resp.json();
      const entry: LogEntry = {
        id: logIdCounter++,
        time: new Date().toLocaleTimeString(),
        scenario: scenarioId,
        result: data.systemName ? `${scenarioId} → ${data.systemName}` : scenarioId,
        ok: data.ok ?? resp.ok,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 30));
    } catch (err: any) {
      setLogs((prev) => [{
        id: logIdCounter++,
        time: new Date().toLocaleTimeString(),
        scenario: scenarioId,
        result: `Error: ${err.message}`,
        ok: false,
      }, ...prev].slice(0, 30));
    } finally {
      setFiring(null);
    }
  }, [selectedSystem]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-12 right-3 z-50 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${
          open
            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
            : 'bg-pochven-bg/80 text-gray-500 hover:text-gray-300 border border-pochven-border hover:border-gray-600'
        }`}
        title="Debug Dashboard"
      >
        <Bug className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-24 right-3 z-50 w-[340px] max-h-[calc(100vh-120px)] rounded-xl border border-pochven-border bg-pochven-surface/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-pochven-border">
              <div className="flex items-center gap-2">
                <Bug className="h-3.5 w-3.5 text-red-400" />
                <span className="text-sm font-semibold text-gray-200">Debug Dashboard</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* System selector */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                  Target System
                </label>
                <div className="relative mt-1">
                  <select
                    value={selectedSystem ?? ''}
                    onChange={(e) => setSelectedSystem(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full appearance-none bg-pochven-bg/80 border border-pochven-border rounded-md px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-gray-600"
                  >
                    <option value="">Random</option>
                    {SYSTEMS.map((s) => (
                      <option key={s.systemId} value={s.systemId}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                </div>
              </div>

              {/* Scenario buttons by category */}
              {CATEGORIES.map(({ key, label }) => {
                const items = SCENARIOS.filter((s) => s.category === key);
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">
                      {label}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map((sc) => (
                        <button
                          key={sc.id}
                          onClick={() => fire(sc.id)}
                          disabled={firing !== null}
                          className={`relative px-2.5 py-2 rounded-lg border text-left transition-all duration-100 hover:brightness-125 disabled:opacity-50 ${sc.color}`}
                          title={sc.description}
                        >
                          <div className="text-xs font-medium leading-tight">{sc.label}</div>
                          <div className="text-[9px] opacity-60 mt-0.5 leading-tight">{sc.description}</div>
                          {firing === sc.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Log */}
              {logs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                      Log
                    </div>
                    <button
                      onClick={() => setLogs([])}
                      className="text-[10px] text-gray-600 hover:text-gray-400"
                    >
                      Clear
                    </button>
                  </div>
                  <div ref={logRef} className="space-y-0.5 max-h-36 overflow-y-auto">
                    {logs.map((entry) => (
                      <div
                        key={entry.id}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          entry.ok ? 'text-green-400/80' : 'text-red-400/80'
                        }`}
                      >
                        <span className="text-gray-600">{entry.time}</span>{' '}
                        {entry.ok ? '✓' : '✗'} {entry.result}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
