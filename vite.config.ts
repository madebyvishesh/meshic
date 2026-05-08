import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: {
    noDiscovery: true,
    entries: ["index.html"],
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "lucide-react", "gifenc"],
  },
})
