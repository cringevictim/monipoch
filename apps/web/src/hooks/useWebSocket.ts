import { useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import type { WsEvent, WsKillEvent, WsNotificationEvent } from '@monipoch/shared';
import { shouldPlaySound } from '@/stores/sound-preferences';
import { playSoundForEvent } from '@/lib/sounds';
import { useMapStore } from '@/stores/map';

/** Tracks the wall-clock time each kill was first received by the frontend. */
export const killArrivalTimes = new Map<number, number>();

interface WsState {
  connected: boolean;
  lastEvent: WsEvent | null;
  recentKills: WsEvent[];
  setConnected: (v: boolean) => void;
  pushEvent: (ev: WsEvent) => void;
}

export const useWsStore = create<WsState>()((set) => ({
  connected: false,
  lastEvent: null,
  recentKills: [],
  setConnected: (connected) => set({ connected }),
  pushEvent: (ev) =>
    set((s) => {
      if (ev.type !== 'kill.new') return { lastEvent: ev };
      const killId = (ev as WsKillEvent).killmail.killmail_id;
      const isDuplicate = s.recentKills.some(
        (k) => k.type === 'kill.new' && (k as WsKillEvent).killmail.killmail_id === killId,
      );
      if (isDuplicate) return { lastEvent: ev };
      killArrivalTimes.set(killId, Date.now());
      // Prune old entries to avoid unbounded growth
      if (killArrivalTimes.size > 100) {
        const ids = [...killArrivalTimes.keys()];
        for (let i = 0; i < ids.length - 60; i++) killArrivalTimes.delete(ids[i]);
      }
      return {
        lastEvent: ev,
        recentKills: [ev, ...s.recentKills].slice(0, 50),
      };
    }),
}));

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const { setConnected, pushEvent } = useWsStore();

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
    const url = `${protocol}//${host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsEvent;
        pushEvent(data);

        if (useMapStore.getState().soundEnabled && shouldPlaySound(data.type)) {
          playSoundForEvent(data.type);
        }

        if (data.type === 'notification') {
          const notif = data as WsNotificationEvent;
          if (Notification.permission === 'granted') {
            new Notification(notif.title, { body: notif.description, icon: '/favicon.ico' });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then((perm) => {
              if (perm === 'granted') {
                new Notification(notif.title, { body: notif.description, icon: '/favicon.ico' });
              }
            });
          }
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (mountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, [setConnected, pushEvent]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
