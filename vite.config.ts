import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// CDN加速：静态资源从jsDelivr加载（国内有节点），HTML从GitHub Pages加载
// jsDelivr格式：https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}
const CDN_BASE = process.env.CDN === '1'
  ? 'https://cdn.jsdelivr.net/gh/as5551238/team-business-hub@main/'
  : './';

export default defineConfig({
  base: CDN_BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: '团队业务中台',
        short_name: 'TBH',
        description: '中小团队AI目标中台',
        theme_color: '#1E40AF',
        background_color: '#ffffff',
        display: 'standalone',
        scope: './',
        start_url: './',
        categories: ['business', 'productivity'],
        icons: [
          { src: './icons.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'cdn-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 } },
          },
          {
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    modulePreload: false,
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'charts';
            if (id.includes('@supabase/supabase-js') || id.includes('@supabase/postgrest-js') || id.includes('@supabase/realtime-js') || id.includes('@supabase/storage-js') || id.includes('@supabase/functions-js')) return 'supabase';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('@sentry')) return 'sentry';
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler')) return 'vendor';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('dompurify')) return 'vendor';
            if (id.includes('@dnd-kit') || id.includes('date-fns')) return 'vendor';
          }
        },
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
});
