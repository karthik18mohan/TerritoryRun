import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#05080f",
        aurora: "#34d399",
        lava: "#f97316"
      },
      boxShadow: {
        glow: "0 0 30px rgba(52, 211, 153, 0.35)",
        neon: "0 0 45px rgba(59, 130, 246, 0.3)"
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        pulseSlow: "pulse 4s ease-in-out infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" }
        }
      }
    }
  },
  plugins: []
} satisfies Config;
