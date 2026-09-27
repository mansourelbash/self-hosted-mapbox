import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.VITE_MAPBOX_TOKEN?.startsWith('sk.')) {
    throw new Error('Use a public Mapbox token (pk.) in VITE_MAPBOX_TOKEN. Secret tokens must never be included in the browser app.');
  }
  return {
    server: {
      proxy: {
        "/speech": {
          target: env.TTS_URL || "http://127.0.0.1:5001",
          rewrite: (path) => path.replace(/^\/speech/, ""),
        },
        "/routing": {
          target: env.OSRM_URL || "http://127.0.0.1:5000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/routing/, ""),
        },
      },
    },
  };
});
