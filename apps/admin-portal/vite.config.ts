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
                target:
                    "http://127.0.0.1:4300",
                changeOrigin: true
            },

            "/api/v1/admin": {
                target: "http://127.0.0.1:4400",
                changeOrigin: true
            },

            "/api/v1/auth": {
                target:
                    "http://127.0.0.1:4400",
                changeOrigin: true
            },

            "/api/v1/telemetry": {
                target:
                    "http://localhost:4401",
                changeOrigin: true
            },
            "/api/v1/energy": {
                target:
                    "http://localhost:4401",
                changeOrigin: true
            }
            ,
            "/api/v1/config": {
                target:
                    "http://localhost:4401",
                changeOrigin: true
            },
            "/api/v1/platform": {
                target:
                    "http://localhost:4402",
                changeOrigin: true
            }
        }
    }
});
