import { defineConfig } from "vite";

const proxy = {
  "/matches": "http://127.0.0.1:8000",
  "/ws": { target: "ws://127.0.0.1:8000", ws: true },
};

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
