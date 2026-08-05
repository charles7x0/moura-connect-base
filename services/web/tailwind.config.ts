import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // ISA 101 Color Discipline
        isa: {
          bg: '#2D2D2D',
          surface: '#363636',
          panel: '#424242',
          border: '#4A4A4A',
          'text-primary': '#E0E0E0',
          'text-secondary': '#9E9E9E',
          'text-muted': '#6B7280',
          'process-normal': '#808080',
          'alarm-critical': '#DC2626',
          'alarm-high': '#F59E0B',
          'alarm-medium': '#FACC15',
          'state-ok': '#4CAF50',
          'state-active': '#2196F3',
          'state-offline': '#6B7280',
        },
      },
    },
  },
  plugins: [],
};

export default config;
