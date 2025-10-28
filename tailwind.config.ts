import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'blood-red': '#8B0000',
        'dark-blood': '#ff0000',
      },
      fontFamily: {
        'horror': ['Cinzel', 'serif'],
      },
    },
  },
  plugins: [],
}
export default config
