/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#050505",
          glass: "rgba(20, 20, 20, 0.4)",
          primary: "#00f3ff",
          secondary: "#ff00ff",
          accent: "#7000ff",
          text: "#e0e0e0",
          dim: "#808080",
        }
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        display: ['"Syne"', 'sans-serif'],
        tech: ['"Michroma"', 'sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)",
        'scan-line': "linear-gradient(to bottom, transparent, #00f3ff, transparent)",
      },
      backgroundSize: {
        'grid-40': '40px 40px',
      }
    },
  },
  plugins: [],
}
