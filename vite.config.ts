import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');
          const marker = '/node_modules/';
          const dependencyPath = normalizedId.slice(normalizedId.lastIndexOf(marker) + marker.length);
          const packageName = dependencyPath.startsWith('@')
            ? dependencyPath.split('/').slice(0, 2).join('/')
            : dependencyPath.split('/')[0];

          if (packageName.startsWith('@supabase/')) return 'supabase-vendor';
        },
      },
    },
  },
}));
