/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  extend: {
    colors: {
      skysoft: "#EAF4FF",
      skybtn: "#4AA3FF",
      skybtn2: "#2E8CFF",
    },
    boxShadow: {
      soft: "0 10px 30px rgba(0,0,0,0.08)",
    },
  },
},

  plugins: [],
};
