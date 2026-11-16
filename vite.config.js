import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { localAIPlugin } from './server/localAI.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), localAIPlugin(loadEnv(mode, process.cwd(), 'VITE_'))],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // LiveKit is only needed once someone joins a call: left out of 'vendor' so it
          // stays in the lazily loaded MeetingCall chunk.
          if (/node_modules[/\\](livekit-client|@livekit)[/\\]/.test(id)) return undefined;
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        }
      }
    }
  }
}))
