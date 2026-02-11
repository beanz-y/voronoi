/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#242424",      // Matches your ctk.configure(bg="#242424")
        panel: "#1a1a1a",   // Darker panel background
        accent: "#10b981",  // Your 'Generate' button green
        accentHover: "#059669",
      }
    },
  },
  plugins: [],
}