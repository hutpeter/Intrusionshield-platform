import {
  defineConfig
} from "vite";

import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react()
  ],

  server: {
    port: 5173,
    host: "localhost",

    proxy: {
      "/api/v1/his": {
        target: "http://localhost:4300",
        changeOrigin: true
      }
    }
  }
});