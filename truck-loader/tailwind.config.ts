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
          50:  '#eef4fb',
          100: '#d4e4f4',
          200: '#a8c9e8',
          300: '#7baedd',
          400: '#4e93d1',
          500: '#2563a8',
          600: '#1a3a5c',
          700: '#132d47',
          800: '#0c1f35',
        },
        sys: {
          header:  '#0c1f35',
          nav:     '#17324e',
          panel:   '#f0f4f8',
          border:  '#c8d4df',
          text:    '#2c4a68',
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
      fontSize: {
        '2xs': ['10px', '14px'],
      },
    },
  },
  plugins: [],
}
export default config
