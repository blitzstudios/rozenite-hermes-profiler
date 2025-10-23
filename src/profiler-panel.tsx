/**
 * Hermes Profiler DevTools Panel
 * 
 * Provides UI for starting/stopping performance profiles and viewing them in Chrome DevTools.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { DEFAULT_PORT } from '../server/config.mjs';

// Type-safe event map for bridge communication
interface PluginEvents extends Record<string, unknown> {
  'start-profiling': {};
  'stop-profiling': {
    saveInDownloads?: boolean;
  };
  'profiling-started': {
    timestamp: number;
  };
  'profile-data': {
    filename?: string;
    path?: string;
    base64?: string; // Trace content (base64-encoded)
    size?: number;
    mime?: string;
    error?: string;
  };
}

type CapturedTrace = {
  id: string;
  receivedAt: number;
  filename: string;
  path?: string;
  size?: number;
  error?: string;
  transforming?: boolean;
  transformError?: string;
  transformedPath?: string;
};

export default function HermesProfilerPanel() {
  const client = useRozeniteDevToolsClient<PluginEvents>({ pluginId: '@sleeperhq/rozenite-hermes-profiler' });
  const [isProfiling, setIsProfiling] = useState(false);
  const [traces, setTraces] = useState<CapturedTrace[]>([]);
  const [isStopping, setIsStopping] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const pendingStopTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!client) return;

    const subStarted = client.onMessage('profiling-started', () => {
      setIsProfiling(true);
    });

    const subData = client.onMessage('profile-data', (data) => {
      if (pendingStopTimer.current) {
        clearTimeout(pendingStopTimer.current as any);
        pendingStopTimer.current = null;
      }
      setIsStopping(false);
      setIsProfiling(false);
      const id = `${Date.now()}`;
      const filename = data.filename;
      if (data.error) {
        setTraces((prev) => [
          {
            id,
            receivedAt: Date.now(),
            filename,
            error: data.error,
          },
          ...prev,
        ]);
        setStatusMsg(`Error: ${data.error}`);
        return;
      }
      setStatusMsg('Transforming profile…');
      const placeholder: CapturedTrace = {
        id,
        receivedAt: Date.now(),
        filename,
        path: data.path,
        transforming: true,
      };
      setTraces((prev) => [placeholder, ...prev]);
      if (data.path) {
        const tryEndpoints = async () => {
          const candidates = [
            `http://localhost:${DEFAULT_PORT}/rozenite/hermes/transform`,
            `http://127.0.0.1:${DEFAULT_PORT}/rozenite/hermes/transform`,
          ];
          let lastErr: any = null;
          for (const url of candidates) {
            try {
              const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path: data.path }),
              });
              const json = await res.json().catch(() => ({} as any));
              if (!res.ok || json?.ok === false) {
                lastErr = json?.stderr || json?.error || `HTTP ${res.status}`;
                continue;
              }
              return { ok: true, json };
            } catch (e: any) {
              lastErr = e?.message || String(e);
            }
          }
          return { ok: false, error: lastErr } as const;
        };

        tryEndpoints().then((result) => {
          if (!result.ok) {
            setTraces((prev) =>
              prev.map((t) =>
                t.id === id ? { ...t, transforming: false, transformError: String(result.error || 'Unknown error') } : t
              )
            );
            setStatusMsg('Transform failed');
            return;
          }
          
          const json = result.json;
          const transformedPath = json?.outputPath as string | undefined;
          
          // Calculate size from base64 if available
          let transformedSize: number | undefined;
          const transformedBase64 = json?.outputBase64 as string | undefined;
          if (transformedBase64) {
            transformedSize = Math.round((transformedBase64.length * 3) / 4);
          }
          
          setTraces((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, transforming: false, transformedPath, size: transformedSize, filename: json?.outputFilename || t.filename }
                : t
            )
          );
          setStatusMsg('Transform complete');
          setTimeout(() => setStatusMsg(null), 1500);
        });
      } else {
        setTraces((prev) =>
          prev.map((t) => (t.id === id ? { ...t, transforming: false, transformError: 'No path returned' } : t))
        );
        setStatusMsg('No path to transform');
      }
    });

    return () => {
      subStarted.remove();
      subData.remove();
    };
  }, [client]);

  const onStart = useCallback(() => {
    if (!client || isProfiling) return;
    setIsProfiling(true);
    setStatusMsg('Profiling started');
    client.send('start-profiling', {});
  }, [client, isProfiling]);

  const onStop = useCallback(() => {
    if (!client) return;
    if (isStopping) return;
    setIsStopping(true);
    setIsProfiling(false);
    setStatusMsg('Stopping…');
    if (pendingStopTimer.current) {
      clearTimeout(pendingStopTimer.current as any);
    }
    pendingStopTimer.current = setTimeout(() => {
      setIsStopping(false);
      setStatusMsg('No response from device. Check app logs.');
    }, 10000) as any;
    client.send('stop-profiling', { saveInDownloads: false });
  }, [client, isStopping]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hermes Release Profiler</Text>
        <Text style={styles.subtitle}>
          Start/stop a Hermes trace and view it with Google Chrome
        </Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          onPress={isProfiling ? onStop : onStart}
          style={[styles.button, isProfiling ? styles.buttonDanger : styles.buttonPrimary]}
          disabled={isStopping}
        >
          <Text style={styles.buttonText}>
            {isStopping ? 'Stopping…' : isProfiling ? 'Stop Profiling' : 'Start Profiling'}
          </Text>
        </Pressable>
      </View>

      {!!statusMsg && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {traces.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No traces yet</Text>
            <Text style={styles.emptySubtitle}>Start a session to capture a trace</Text>
          </View>
        ) : (
          traces.map((t) => (
            <View key={t.id} style={styles.traceCard}>
              <View style={styles.traceMeta}>
                <Text style={styles.traceTitle}>{t.filename}</Text>
                <Text style={styles.traceSubtitle}>
                  {new Date(t.receivedAt).toLocaleString()} • {t.size ? `${Math.round(t.size / 1024)} KB` : 'unknown size'}
                </Text>
                {!!t.error && <Text style={styles.traceError}>Error: {t.error}</Text>}
                {!!t.transformError && <Text style={styles.traceError}>Transform error: {t.transformError}</Text>}
              </View>
              <View style={styles.traceActions}>
                {!!t.transformedPath && (
                  <Pressable
                    onPress={async () => {
                      try {
                        const res = await fetch(`http://localhost:${DEFAULT_PORT}/rozenite/hermes/open`, {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ path: t.transformedPath }),
                        });
                        if (!res.ok) throw new Error(String(res.status));
                        setStatusMsg('Opening Chrome DevTools…');
                        setTimeout(() => setStatusMsg(null), 1500);
                      } catch (e) {
                        setStatusMsg('Failed to open Chrome.');
                        setTimeout(() => setStatusMsg(null), 2000);
                      }
                    }}
                    style={[styles.smallButton, styles.buttonPrimary]}
                  >
                    <Text style={styles.smallButtonText}>Open in Chrome DevTools</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d10',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomColor: '#1b1f24',
    borderBottomWidth: 1,
  },
  title: {
    color: '#e6edf3',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9da7b1',
    marginTop: 4,
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    borderBottomColor: '#1b1f24',
    borderBottomWidth: 1,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  buttonPrimary: {
    backgroundColor: '#238636',
  },
  buttonDanger: {
    backgroundColor: '#da3633',
  },
  buttonText: {
    color: '#e6edf3',
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
  },
  statusBar: {
    borderTopColor: '#1b1f24',
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statusText: {
    color: '#9da7b1',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: '#e6edf3',
    fontSize: 14,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#9da7b1',
    marginTop: 4,
    fontSize: 12,
  },
  traceCard: {
    backgroundColor: '#111318',
    borderColor: '#1b1f24',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  traceMeta: {
    marginBottom: 8,
  },
  traceTitle: {
    color: '#e6edf3',
    fontWeight: '600',
  },
  traceSubtitle: {
    color: '#9da7b1',
    fontSize: 12,
    marginTop: 4,
  },
  traceError: {
    color: '#ff6b6b',
    marginTop: 6,
    fontSize: 12,
  },
  traceActions: {
    flexDirection: 'row',
  },
  smallButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 8,
  },
  smallButtonText: {
    color: '#e6edf3',
    fontSize: 12,
    fontWeight: '600',
  },
});


