/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Luxury pink / cream palette
        cream: {
          50: "#FFFCFA",
          100: "#FDF7F2",
          200: "#FAF0E8",
          300: "#F4E5DA",
        },
        blush: {
          50: "#FDF2F2",
          100: "#FAE6E6",
          200: "#F5D5D8",
          300: "#EFBEC6",
          400: "#E39FAF",
        },
        rose: {
          400: "#DC8199",
          500: "#C9647F",
          600: "#B04C68",
        },
        plum: {
          500: "#8A3D5C",
          600: "#732F4A",
          700: "#5C233A",
          800: "#43182A",
          900: "#2E101D",
        },
        gold: {
          300: "#E3CB9C",
          400: "#D4B27A",
          500: "#C09A5C",
        },
        ink: {
          400: "#9C8791",
          500: "#7A6470",
          600: "#544350",
          700: "#3A2C36",
          900: "#241A21",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Manrope", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(67, 24, 42, 0.04), 0 4px 16px -4px rgba(67, 24, 42, 0.08)",
        lift: "0 2px 4px rgba(67, 24, 42, 0.05), 0 12px 32px -8px rgba(67, 24, 42, 0.14)",
        glow: "0 0 0 3px rgba(227, 159, 175, 0.28)",
      },
      backgroundImage: {
        "luxe-gradient": "linear-gradient(135deg, #FDF7F2 0%, #FAE6E6 45%, #F4E5DA 100%)",
        "plum-gradient": "linear-gradient(135deg, #5C233A 0%, #8A3D5C 100%)",
        "rose-gradient": "linear-gradient(120deg, #DC8199 0%, #C9647F 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(220, 129, 153, 0.5)" },
          "70%": { boxShadow: "0 0 0 10px rgba(220, 129, 153, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(220, 129, 153, 0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
      },
    },
  },
  plugins: [],
};
