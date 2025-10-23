/**
 * Rozenite Hermes Profiler - Dev Server Middleware
 *
 * Provides HTTP endpoints for:
 * 1. Transforming raw Hermes profiles to Chrome DevTools format
 * 2. Serving transformed profiles via HTTP
 * 3. Opening Chrome DevTools with the profile loaded
 */

const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let started = false;
let serverPort;

module.exports = async function startHermesProfilerServer() {
  if (started) return { port: serverPort, server: null };
  started = true;

  // Load port from config (ESM)
  const { DEFAULT_PORT } = await import('./config.mjs');
  serverPort = DEFAULT_PORT;

  const app = express();
  app.use(express.json());
  
  // CORS headers for DevTools panel
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Transform raw Hermes profile to Chrome DevTools format
  app.post('/rozenite/hermes/transform', (req, res) => {
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    if (!rawPath) return res.status(400).json({ error: 'missing_path' });

    const child = spawn('npx', ['react-native-release-profiler', '--local', rawPath], {
      shell: false,
      cwd: process.cwd(),
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('[Hermes Profiler] Transform failed:', stderr);
        return res.status(500).json({ error: 'transform_failed', stderr });
      }

      // The CLI outputs the converted file to the CWD, not the original path
      // Extract the original filename and look for it in CWD with -converted.json suffix
      const originalFilename = path.basename(rawPath);
      const convertedFilename = originalFilename.replace(/\.cpuprofile$/, '-converted.json');
      const outputPath = path.join(process.cwd(), convertedFilename);

      // Read and return the transformed profile
      try {
        const outputContent = fs.readFileSync(outputPath, 'utf8');
        const outputBase64 = Buffer.from(outputContent, 'utf8').toString('base64');
        
        res.json({
          ok: true,
          outputPath,
          outputFilename: convertedFilename,
          outputBase64,
          mime: 'application/json',
          stdout,
        });
      } catch (e) {
        console.error('[Hermes Profiler] Failed to read output:', e);
        console.error('[Hermes Profiler] CWD:', process.cwd());
        console.error('[Hermes Profiler] Expected path:', outputPath);
        res.status(500).json({ error: String(e.message) });
      }
    });
  });

  // Cache for profile paths (filename -> full path)
  const profilePathCache = new Map();

  // Serve transformed profiles via HTTP
  app.get('/rozenite/hermes/profile/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Security: validate filename pattern
    if (!/^profile-[A-F0-9-]+-\d+-[A-F0-9]+-converted\.json$/.test(filename)) {
      return res.status(400).json({ error: 'invalid_filename' });
    }
    
    const profilePath = profilePathCache.get(filename);
    if (!profilePath || !fs.existsSync(profilePath)) {
      return res.status(404).json({ error: 'not_found' });
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const content = fs.readFileSync(profilePath, 'utf8');
    res.send(content);
  });

  // Open Chrome DevTools with the profile loaded
  app.post('/rozenite/hermes/open', async (req, res) => {
    try {
      const filePath = typeof req.body?.path === 'string' ? req.body.path : '';
      if (!filePath) return res.status(400).json({ error: 'missing_path' });

      const filename = path.basename(filePath);
      profilePathCache.set(filename, filePath);
      
      const profileUrl = `http://localhost:${serverPort}/rozenite/hermes/profile/${filename}`;
      const devtoolsUrl = `devtools://devtools/bundled/devtools_app.html?loadTimelineFromURL=${encodeURIComponent(profileUrl)}`;

      const open = (await import('open')).default;
      
      // Open chrome://inspect first to initialize DevTools
      await open('chrome://inspect/#devices', { 
        app: ['Google Chrome'],
        wait: false,
      });
      
      // Wait for Chrome to initialize, then open the profile
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await open(devtoolsUrl, { 
        app: ['Google Chrome'],
        wait: false,
      });

      res.json({ ok: true, profileUrl, devtoolsUrl });
    } catch (e) {
      console.error('[Hermes Profiler] Failed to open Chrome:', e);
      res.status(500).json({ error: String(e.message) });
    }
  });

  // Start server
  const server = http.createServer(app);
  server.listen(serverPort, () => {
    console.log(`[Hermes Profiler] Server listening at http://localhost:${serverPort}`);
  });

  return { port: serverPort, server };
};
