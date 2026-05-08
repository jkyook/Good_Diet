import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mummukji.app',
  appName: '머먹지',
  webDir: 'dist',
  server: {
    // 개발: npm run dev:all 후 로컬 IP 입력 (예: http://192.168.0.x:3000)
    // 배포: process.env.APP_URL ?? undefined
    url: process.env.CAPACITOR_SERVER_URL ?? undefined,
    cleartext: true, // Android HTTP 허용
  },
  plugins: {
    Camera: {},
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: true, // cleartext 허용 시 true로
  },
};

export default config;
