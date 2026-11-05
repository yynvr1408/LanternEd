export interface CapacitorConfig {
  appId: string
  appName: string
  webDir: string
  bundledWebRuntime?: boolean
  server?: {
    androidScheme?: string
    iosScheme?: string
    hostname?: string
    cleartext?: boolean
    allowNavigation?: string[]
  }
  android?: {
    allowMixedContent?: boolean
    captureInput?: boolean
    webContentsDebuggingEnabled?: boolean
    buildOptions?: {
      keystorePath?: string
      keystorePassword?: string
    }
  }
  ios?: {
    contentInset?: 'automatic' | 'never' | 'scrollable'
    scrollEnabled?: boolean
    limitsNavigationsToAppBoundDomains?: boolean
    preferredContentMode?: 'mobile' | 'desktop'
    scheme?: string
  }
  plugins?: Record<string, Record<string, unknown>>
}

const config: CapacitorConfig = {
  appId: 'org.lanterned.app',
  appName: 'LanternEd',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'ionic',
    cleartext: true, // Allow local LAN websocket connections without SSL requirement
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#121A19',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#121A19',
    },
  },
}

export default config
