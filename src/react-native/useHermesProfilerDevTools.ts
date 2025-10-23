import { useEffect } from 'react';
import { startProfiling, stopProfiling } from 'react-native-release-profiler';
import RNFS from 'react-native-fs';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';

interface PluginEvents {
  'start-profiling': {};
  'stop-profiling': { saveInDownloads?: boolean };
  'profiling-started': { timestamp: number };
  'profile-data': {
    filename?: string;
    path?: string;
    base64?: string;
    size?: number;
    mime?: string;
    error?: string;
  };
}

export const useHermesProfilerDevTools = () => {
  const client = useRozeniteDevToolsClient<PluginEvents>({
    pluginId: '@sleeperhq/rozenite-hermes-profiler',
  });

  useEffect(() => {
    if (!client) return;

    const subStart = client.onMessage('start-profiling', () => {
      try {
        startProfiling();
        client.send('profiling-started', { timestamp: Date.now() });
      } catch (e: any) {
        console.error('[Rozenite Hermes Profiler] Start error:', e);
        client.send('profile-data', { error: String(e?.message || e) });
      }
    });

    const subStop = client.onMessage('stop-profiling', async (payload) => {
      try {
        const saveInDownloads = !!payload?.saveInDownloads;
        
        // Stop profiling with 9s timeout
        const path = await Promise.race<string>([
          stopProfiling(saveInDownloads),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Profiler timeout')), 9000)
          ),
        ]);

        const filename = path?.split('/')?.pop?.() || 'hermes-profile.trace';

        // Read the profile file
        let base64: string | undefined;
        let size: number | undefined;
        
        if (path && RNFS?.readFile) {
          try {
            base64 = await RNFS.readFile(path, 'base64');
            const stat = await RNFS.stat(path);
            size = Number(stat.size || 0);
          } catch (fsErr) {
            console.warn('[Rozenite Hermes Profiler] Failed to read profile:', fsErr);
          }
        }

        client.send('profile-data', {
          filename,
          path,
          base64,
          size,
          mime: 'application/octet-stream',
        });
      } catch (e: any) {
        console.error('[Rozenite Hermes Profiler] Stop error:', e);
        client.send('profile-data', { error: String(e?.message || e) });
      }
    });

    return () => {
      subStart.remove();
      subStop.remove();
    };
  }, [client]);

  return client;
};
