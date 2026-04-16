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
        brand: {
          50:  '#f0f4fa',
          100: '#d9e4f5',
          500: '#2c5282',
          600: '#1a3a5c',
          700: '#132d47',
        },
      },
      fontFamily: {
        sans: [
          '"Hiragino Kaku Gothic Pro"',
          'Meiryo',
          '"Yu Gothic"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
export default config
