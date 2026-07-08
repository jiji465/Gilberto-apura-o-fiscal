import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mantém os nomes; valores alinhados ao relatório (verde-oliva + dourado).
        navy: { DEFAULT: "#3f4e2c", 2: "#4e603a" },
        gold: { DEFAULT: "#b0892e", 2: "#9c7b2e", deep: "#7a5f1f" },
      },
      fontFamily: {
        sans: ["var(--font-plex)", "system-ui", "sans-serif"],
        serif: ["var(--font-jost)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
export default config
