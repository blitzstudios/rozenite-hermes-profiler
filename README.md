# @sleeperhq/rozenite-hermes-profiler

A [Rozenite](https://rozenite.dev) plugin that integrates [`react-native-release-profiler`](https://github.com/margelo/react-native-release-profiler) with Rozenite DevTools. Profile your React Native app's performance and view the results directly in Chrome DevTools with one click.

## Features

- ✅ **One-Click Profiling**: Start/stop performance profiling from the DevTools panel
- ✅ **Automatic Transformation**: Raw Hermes CPU profiles are automatically converted to Chrome DevTools format
- ✅ **Chrome Integration**: Profiles open directly in Chrome DevTools Performance tab
- ✅ **Clean UI**: Simple, minimal interface for capturing and viewing profiles

## Prerequisites

1. **react-native-release-profiler**: Install and configure according to [their documentation](https://github.com/margelo/react-native-release-profiler#installation)
2. **react-native-fs**: Required for reading profile files from the device
3. **Rozenite**: This is a Rozenite plugin, so you need Rozenite set up in your React Native project

## Installation

```bash
# Using yarn
yarn add @sleeperhq/rozenite-hermes-profiler react-native-release-profiler react-native-fs

# Using npm
npm install @sleeperhq/rozenite-hermes-profiler react-native-release-profiler react-native-fs
```

## Setup

### 1. Install the Plugin in Your React Native App

In your app's entry point (e.g., `index.app.js` or `App.tsx`):

```typescript
import { useHermesProfilerDevTools } from '@sleeperhq/rozenite-hermes-profiler';

function App() {
  // Initialize the plugin
  useHermesProfilerDevTools();
  
  // ... rest of your app
}
```

### 2. Register the Plugin with Rozenite

In your `rspack.config.js` (or equivalent bundler config):

```javascript
const { withRozenite } = require('@rozenite/repack');

module.exports = {
  plugins: [
    withRozenite({
      include: [
        '@rozenite/network-activity-plugin',
        '@rozenite/mmkv-plugin',
        '@sleeperhq/rozenite-hermes-profiler',  // Add this
      ],
    }),
  ],
};
```

### 3. Start the Dev Server Middleware

The plugin requires a local server to transform profiles. Add this to your bundler config:

```javascript
// At the top of rspack.config.js
const startHermesProfilerServer = require('@sleeperhq/rozenite-hermes-profiler/server/registerDevServerMiddleware.cjs');
startHermesProfilerServer();

// ... rest of your config
```

## Usage

1. **Open Rozenite DevTools**: Launch your React Native app and open the Rozenite DevTools
2. **Navigate to Hermes Profiler Panel**: Find the "Hermes Profiler" tab
3. **Start Profiling**: Click the "Start Profiling" button (turns red)
4. **Perform Actions**: Use your app and perform the actions you want to profile
5. **Stop Profiling**: Click "Stop Profiling"
6. **View Results**: The profile will automatically transform and appear in the list
7. **Open in Chrome**: Click "Open in Chrome DevTools" to view the performance profile

The profile will open directly in Chrome DevTools Performance tab where you can:
- View the call tree
- Analyze function execution times
- Identify performance bottlenecks
- See detailed flame charts

## Architecture

The plugin consists of three main components:

1. **React Native Hook** (`useHermesProfilerDevTools`): Handles communication between the app and DevTools, triggers profiling, and reads profile files
2. **DevTools Panel** (`profiler-panel.tsx`): Provides the UI for starting/stopping profiling and viewing results
3. **Dev Server Middleware** (`registerDevServerMiddleware.cjs`): Runs a local HTTP server that:
   - Transforms raw Hermes profiles using the `react-native-release-profiler` CLI
   - Serves transformed profiles via HTTP (required for Chrome DevTools to load them)
   - Opens Chrome DevTools with the profile loaded

## Configuration

The plugin runs a standalone server on `http://localhost:9337` by default. This port is used for:
- Profile transformation requests
- Serving profiles to Chrome DevTools
- Opening Chrome with the correct DevTools URL

The port is configured from a shared config file: `server/config.cjs`.

## Troubleshooting

### "Transform failed" error
- Ensure `react-native-release-profiler` is installed and accessible via `npx`
- Check that the profile file exists at the reported path

### Chrome doesn't open or shows "site can't be reached"
- The plugin opens `chrome://inspect` first to initialize DevTools
- Wait a moment and try clicking "Open in Chrome DevTools" again
- Ensure Google Chrome is installed at the default location

### "Profile not found" when opening in Chrome
- This usually resolves itself on retry as the profile is cached
- Check the dev server logs for the actual file path

## Development

```bash
# Install dependencies
yarn install

# Build the plugin
yarn build

# Development mode (watches for changes)
yarn dev
```

## License

MIT

## Credits

- Built for [Rozenite DevTools](https://rozenite.dev)
- Uses [react-native-release-profiler](https://github.com/margelo/react-native-release-profiler) by Margelo

