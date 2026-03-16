/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          border: 'var(--color-border)',
          bg: 'var(--color-bg-elevated)',
          inner: 'var(--color-bg-subtle)',
        },
        hyper: {
          dark: 'var(--color-bg-base)',
          accent: 'var(--color-accent-primary)',
          'accent-secondary': 'var(--color-accent-secondary)',
        },
        semantic: {
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          danger: 'var(--color-danger)',
          info: 'var(--color-info)',
        },
      },
      fontFamily: {
        sans: ['Geist Sans', 'Geist', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        inner: 'var(--radius-inner)',
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
        sm: 'var(--shadow-sm)',
      },
      backgroundImage: {
        'hyper-gradient': 'radial-gradient(ellipse 80% 50% at 50% 0%, #1a237e 0%, #0a0e1b 50%, #0a0e1b 100%)',
      },
      transitionProperty: {
        base: 'var(--transition-base)',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        sticky: 'var(--z-sticky)',
        drawer: 'var(--z-drawer)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
    },
  },
  plugins: [],
};
