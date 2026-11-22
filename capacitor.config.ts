import type { CapacitorConfig } from '@capacitor/cli'

// The Android app loads the live site, so every web deploy reaches installed apps at once. Trade-off: the app needs a
// connection to open (the web app's own service worker still caches the shell after the first load).
const config: CapacitorConfig = {
  appId: 'in.jumpstartpreschool.go',
  appName: 'Jumpstart Go',
  webDir: 'dist',
  server: { url: 'https://jumpstart-go.singhankit91624.workers.dev', androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
}

export default config
