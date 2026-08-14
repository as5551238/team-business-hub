import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tbh.app',
  appName: '团队业务中台',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // 使用线上 URL 作为内容源（可选：也可用本地 bundled dist）
    // url: 'https://as5551238.github.io/team-business-hub/',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1E40AF',
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      showSpinner: true,
      androidScaleType: 'centerCrop',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#1E40AF',
      sound: 'beep.wav',
    },
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#1E40AF',
  },
  android: {
    backgroundColor: '#1E40AF',
    allowMixedContent: false,
  },
};

export default config;
