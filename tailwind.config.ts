import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary-color)",
        neutral: "var(--neutral-color)",
        accent: "var(--accent-color)",
        background: "var(--background-color)",
        foreground: "var(--foreground-color)",
        "footer-bg": "var(--footer-bg-color)",
        "footer-heading": "var(--footer-heading-color)",
        "footer-text": "var(--footer-text-color)",
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
