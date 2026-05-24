import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
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
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler')) return 'vendor';
            if (id.includes('@radix-ui')) return 'radix';
          }
        },
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
});
