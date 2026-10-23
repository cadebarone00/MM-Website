import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maroonplayground.iosdev',
  appName: 'The Maroon Dev',
  webDir: 'capacitor-web',

  server: {
    url: process.env.DEV_IPHONE_PREVIEW === 'true' ? 'http://localhost:3001/dev-iphone' : 'http://localhost:3001',
    cleartext: true,
  },
};

export default config;