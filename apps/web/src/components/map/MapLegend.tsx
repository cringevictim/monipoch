import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

function Swatch({ color }: { color: string }) {
  return (
    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
  );
}

function RingSwatch({ color, dashed, pulse }: { color: string; dashed?: boolean; pulse?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
      <span
        className={`w-4 h-4 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{
          border: `1.5px ${dashed ? 'dashed' : 'solid'} ${color}`,
          opacity: 0.7,
        }}
      />
    </span>
  );
}

const HEAT_STOPS = [
  { color: '#2a1a1a', label: '0' },
  { color: '#2d4a1e', label: '1-2' },
  { color: '#6b6b00', label: '3-5' },
  { color: '#b35900', label: '6-10' },
  { color: '#cc2200', label: '11-20' },
  { color: '#ff0040', label: '20+' },
];

export default function MapLegend() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="absolute top-3 right-3 z-30 select-none">
      <div
        className="bg-black/55 backdrop-blur-md rounded-lg border border-white/[0.06] overflow-hidden"
        style={{ minWidth: expanded ? 290 : undefined }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 px-3.5 py-2 w-full text-left hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex-1">Legend</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </button>

        <AnimatePresence>
          {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
          <div className="px-3.5 pb-3 space-y-3.5">
            {/* Heatmap */}
            <Section title="System Kill Heatmap" desc="Node color shows kills in the selected time window">
              <div className="flex items-center gap-0.5">
                {HEAT_STOPS.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-0.5 flex-1">
                    <span className="w-full h-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-[11px] text-gray-500">{s.label}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Constellations */}
            <Section title="Constellations" desc="Each constellation has a distinct accent color">
              <div className="space-y-1">
                <Row><Swatch color="#d4943a" /><span className="text-gray-300">Krai Perun</span></Row>
                <Row><Swatch color="#c43c3c" /><span className="text-gray-300">Krai Svarog</span></Row>
                <Row><Swatch color="#b84c8a" /><span className="text-gray-300">Krai Veles</span></Row>
              </div>
            </Section>

            {/* Fight detection */}
            <Section title="Activity Detection" desc="Ring shrinks and fades over 5 min, refreshes on new kills">
              <div className="space-y-1">
                <Row><RingSwatch color="#ffaa00" pulse /><span className="text-gray-300">Solo kill</span></Row>
                <Row><RingSwatch color="#ff8800" pulse /><span className="text-gray-300">Small gang</span></Row>
                <Row><RingSwatch color="#ff4400" pulse /><span className="text-gray-300">Medium gang</span></Row>
                <Row><RingSwatch color="#ff0044" pulse /><span className="text-gray-300">Large fleet</span></Row>
              </div>
            </Section>

            {/* Tactical detection */}
            <Section title="Gate Camps & Roams" desc="Detected from killmail patterns">
              <div className="space-y-1">
                <Row>
                  <RingSwatch color="#ef4444" dashed pulse />
                  <span className="text-gray-300">Gate camp — kills at the same stargate</span>
                </Row>
                <Row>
                  <RingSwatch color="#f59e0b" dashed pulse />
                  <span className="text-gray-300">Roaming fleet — kills across different locations</span>
                </Row>
                <Row>
                  <span className="inline-flex items-center justify-center w-6 flex-shrink-0">
                    <span className="px-1 py-0 text-[9px] font-semibold rounded border border-red-500/30 bg-black/40 text-red-400 leading-tight">CAMP</span>
                  </span>
                  <span className="text-gray-300">Drifting label — click to open details</span>
                </Row>
              </div>
            </Section>

            {/* Kill feed */}
            <Section title="Kill Feed & Logs" desc="Colors indicate your alliance involvement">
              <div className="space-y-1">
                <Row><Swatch color="#4ade80" /><span className="text-green-400/90">Alliance member got the kill</span></Row>
                <Row><Swatch color="#f87171" /><span className="text-red-400/90">Alliance member was killed</span></Row>
                <Row><Swatch color="#9ca3af" /><span className="text-gray-300">Neutral — no alliance involved</span></Row>
              </div>
            </Section>

            {/* Ticker timer */}
            <Section title="Kill Ticker" desc="Bottom bar shows recent kills with a countdown border">
              <div className="space-y-1">
                <Row>
                  <span className="inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
                    <span className="w-4 h-4 rounded border border-red-500/70" style={{
                      borderImage: 'linear-gradient(to right, #ef4444 60%, transparent 60%) 1',
                    }} />
                  </span>
                  <span className="text-gray-300">Snake timer — 90s countdown border</span>
                </Row>
                <Row>
                  <span className="inline-flex items-center justify-center w-5 h-5 flex-shrink-0 text-[11px] text-yellow-400">⏸</span>
                  <span className="text-gray-300">Timer pauses while kill is expanded</span>
                </Row>
              </div>
            </Section>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-gray-300 font-medium mb-0.5">{title}</p>
      <p className="text-xs text-gray-500 mb-1.5 leading-tight">{desc}</p>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-[13px]">{children}</div>;
}
