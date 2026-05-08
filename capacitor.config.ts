import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mummukji.app',
  appName: '머먹지',
  webDir: 'dist',
  plugins: {
    Camera: {
      // iOS: permission strings are in Info.plist
    },
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
