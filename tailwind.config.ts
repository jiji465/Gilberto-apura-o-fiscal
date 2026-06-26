import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B2A4A", 2: "#16456f" },
        gold: { DEFAULT: "#E8A53D", 2: "#cf8a1e", deep: "#a86c12" },
      },
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
        serif: ["Spectral", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
}
export default config
