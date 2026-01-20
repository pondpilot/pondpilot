/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-mantine-color-scheme="dark"]'],
  theme: {
    screens: {
      xs: '36em', // 576px
      sm: '48em', // 768px
      md: '62em', // 992px
      lg: '75em', // 1200px
      xl: '88em', // 1408px
    },
    extend: {
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 200ms ease-out',
        'slide-out-right': 'slide-out-right 200ms ease-out',
      },
      colors: {
        borderLight: {
          light: '#F2F4F8',
          dark: '#384252',
        },
        borderPrimary: {
          light: '#DBDDE1',
          dark: '#5B6B86',
        },
        borderSecondary: {
          light: '#C7CAD0',
          dark: '#AEB2BB',
        },
        borderAccent: {
          light: '#4957C1',
          dark: '#4C61FF',
        },
        borderSuccess: {
          light: '#4CAE4F',
          dark: '#4CAE4F',
        },
        borderWarning: {
          light: '#F4A462',
          dark: '#F4A462',
        },
        borderError: {
          light: '#EF486F',
          dark: '#EF486F',
        },

        backgroundPrimary: {
          light: '#FDFDFD',
          dark: '#242B35',
        },
        backgroundSecondary: {
          light: '#F2F4F8',
          dark: '#191D24',
        },
        backgroundTertiary: {
          light: '#E5E9F2',
          dark: '#5B6B86',
        },
        backgroundSuccess: {
          light: '#E6F4E6',
          dark: '#2B612C',
        },
        backgroundWarning: {
          light: '#FDF2E9',
          dark: '#A8520C',
        },
        backgroundError: {
          light: '#FDE5EB',
          dark: '#990D2E',
        },
        backgroundAccent: {
          light: '#4957C1',
          dark: '#4C61FF',
        },
        backgroundInverse: {
          light: '#242B35',
          dark: '#384252',
        },

        // Icons
        iconDefault: {
          light: '#6F7785',
          dark: '#C8CED9',
        },
        iconDisabled: '#AEB2BB',
        iconSuccess: {
          light: '#4CAE4F',
          dark: '#75C277',
        },
        iconWarning: {
          light: '#F4A462',
          dark: '#F7B987',
        },
        iconError: {
          light: '#EF486F',
          dark: '#F37391',
        },
        iconAccent: {
          light: '#4957C1',
          dark: '#4C61FF',
        },
        iconContrast: '#E5E9F2',

        // Text
        textPrimary: {
          light: '#212328',
          dark: '#FDFDFD',
        },
        textSecondary: {
          light: '#6F7785',
          dark: '#A8B3C4',
        },
        textTertiary: {
          light: '#AEB2BB',
          dark: '#8292AA',
        },
        textSuccess: {
          light: '#4CAE4F',
          dark: '#75C277',
        },
        textWarning: {
          light: '#F4A462',
          dark: '#F7B987',
        },
        textError: {
          light: '#EF486F',
          dark: '#F37391',
        },
        textAccent: {
          light: '#4957C1',
          dark: '#4C61FF',
        },
        textContrast: {
          light: '#FFFFFF',
          dark: '#FDFDFD',
        },

        transparent004: {
          light: '#2123280A', // transparentGray-004
          dark: '#FFFFFF0A', // transparentWhite-004
        },
        transparent008: {
          light: '#21232814', // transparentGray-008
          dark: '#FFFFFF14', // transparentWhite-008
        },
        transparent010: {
          light: '#2123281F', // transparentGray-012
          dark: '#FFFFFF1A', // transparentWhite-010
        },
        transparent016: {
          light: '#21232829', // transparentGray-016
          dark: '#FFFFFF29', // transparentWhite-016
        },
        transparent020: {
          light: '#21232833', // transparentGray-020
          dark: '#FFFFFF33', // transparentWhite-020
        },
        transparent032: {
          light: '#21232852', // transparentGray-032
          dark: '#FFFFFF4D', // transparentWhite-030
        },
        transparent072: {
          light: '#212328B8', // transparentGray-072
          dark: '#FFFFFFB8', // transparentWhite-072
        },
        'transparent010-inverse': {
          light: '#FFFFFF1A', // transparentWhite-010
          dark: '#FFFFFF1A', // transparentWhite-010
        },

        // State colors
        accentHover: {
          light: '#737ECF', // brandBlue-400
          dark: '#6681FF', // brandBlue_neon-700
        },
        accentActive: {
          light: '#26349E', // brandBlue-700
          dark: '#384BCC', // brandBlue_neon-400
        },
        tertiaryHover: {
          light: '#C8CED9', // blue-grey-300
          dark: '#384252', // blue-grey-700
        },
        tertiaryActive: {
          light: '#A8B3C4', // blue-grey-400
          dark: '#5B6B86', // blue-grey-600
        },
        accentTransparentHover: {
          light: '#4957C114', // transparentBrandBlue-008
          dark: '#4957C114', // transparentBrandBlue-008
        },
        accentTransparentActive: {
          light: '#4957C129', // transparentBrandBlue-016
          dark: '#4957C129', // transparentBrandBlue-016
        },

        // transparentBrandBlue_palette
        'transparentBrandBlue_palette-008': {
          light: '#4957C114', // transparentBrandBlue-008
          dark: '#CAD8FF14', // darkModeTransparentBrandBlue-008
        },
        'transparentBrandBlue_palette-012': {
          light: '#4957C11F', // transparentBrandBlue-012
          dark: '#869FFF1F', // darkModeTransparentBrandBlue-012
        },
        'transparentBrandBlue_palette-016': {
          light: '#4957C129', // transparentBrandBlue-016
          dark: '#7B94FF29', // darkModeTransparentBrandBlue-016
        },
        'transparentBrandBlue_palette-032': {
          light: '#4957C152', // transparentBrandBlue-032
          dark: '#4C61FF52', // darkModeTransparentBrandBlue-032
        },

        transparentWhite: {
          '004': '#FFFFFF0A', // 4%
          '008': '#FFFFFF14', // 8%
          '010': '#FFFFFF1A', // 10%
          '016': '#FFFFFF29', // 16%
          '020': '#FFFFFF33', // 20%
          '030': '#FFFFFF4D', // 30%
          '072': '#FFFFFFB8', // 72%
        },
        transparentGray: {
          '004': '#2123280A', // 4%
          '008': '#21232814', // 8%
          '010': '#2123281A', // 10%
          '012': '#2123281F', // 12%
          '016': '#21232829', // 16%
          '020': '#21232833', // 20%
          '032': '#21232852', // 32%
          '072': '#212328B8', // 72%
        },
        transparentBrandBlue: {
          '008': '#4957C114', // 8%
          '012': '#4957C11F', // 12%
          '016': '#4957C129', // 16%
          '032': '#4957C152', // 32%
        },
        darkModeTransparentBrandBlue: {
          '008': '#CAD8FF14', // 8%
          '012': '#869FFF1F', // 12%
          '016': '#7B94FF29', // 16%
          '032': '#4C61FF52', // 32%
        },
        // Brand Colors
        'brand-blue': {
          50: '#F4F4FB',
          100: '#E5E7F6',
          200: '#B8BDE7',
          300: '#98A0DC',
          400: '#737ECF',
          500: '#4957C1',
          600: '#737ECF',
          700: '#26349E',
          800: '#252E6D',
          900: '#131738',
        },
        'blue-grey': {
          50: '#FFFFFF',
          100: '#F2F4F8',
          200: '#E5E9F2',
          300: '#C8CED9',
          400: '#A8B3C4',
          500: '#8292AA',
          600: '#5B6B86',
          700: '#384252',
          800: '#242B35',
          900: '#191D24',
        },
        grey: {
          50: '#FDFDFD',
          100: '#F6F6F7',
          200: '#EBECEE',
          300: '#DBDDE1',
          400: '#C7CAD0',
          500: '#AEB2BB',
          600: '#9096A3',
          700: '#6F7785',
          800: '#3E434B',
          900: '#212328',
        },
        green: {
          50: '#FCFEFC',
          100: '#F4FAF4',
          200: '#E6F4E6',
          300: '#D2EBD3',
          400: '#B8E0BA',
          500: '#99D29B',
          600: '#75C277',
          700: '#4CAE4F',
          800: '#2B612C',
          900: '#163317',
        },
        orange: {
          50: '#FFFEFD',
          100: '#FEF9F5',
          200: '#FDF2E9',
          300: '#FCE8D8',
          400: '#FBDBC2',
          500: '#F9CCA6',
          600: '#F7B987',
          700: '#F4A462',
          800: '#A8520C',
          900: '#4E2605',
        },
        magenta: {
          50: '#FFFCFD',
          100: '#FEF4F6',
          200: '#FDE5EB',
          300: '#FBD1DB',
          400: '#F9B8C7',
          500: '#F698AE',
          600: '#F37391',
          700: '#EF486F',
          800: '#990D2E',
          900: '#4A0616',
        },
        'brand-blue-neon': {
          50: '#111111',
          100: '#141414',
          200: '#1B255A',
          300: '#2C3B93',
          400: '#384BCC',
          500: '#4C61FF',
          600: '#5B76EF',
          700: '#6681FF',
          800: '#869FFF',
          900: '#CAD8FF',
        },
      },
    },
  },
  plugins: [],
};
