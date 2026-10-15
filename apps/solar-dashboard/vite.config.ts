
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        proxy: {
            "/api/v1/telemetry": {
                target: "http://localhost:4401",
                changeOrigin: true
            },
            "/api/v1/energy": {
                target: "http://localhost:4401",
                changeOrigin: true
            },
            "/api/v1/auth": {
                target: "http://localhost:4400",
                changeOrigin: true
            }
        }
    }
});
