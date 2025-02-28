/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-mantine-color-scheme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
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
        borderSuccess: '#4CAE4F',
        borderWarning: '#F4A462',
        borderError: '#EF486F',

        backgroundPrimary: {
          light: '#FDFDFD',
          dark: '#242B35',
        },
        backgroundSecondary: {
          light: '#F2F4F8',
          dark: '#384252',
        },
        backgroundTertiary: {
          light: '#E5E9F2',
          dark: '#5B6B86',
        },
        backgroundSuccess: '#E6F4E6',
        backgroundWarning: '#FDF2E9',
        backgroundError: '#FDE5EB',
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
        iconSuccess: '#4CAE4F',
        iconWarning: '#F4A462',
        iconError: '#EF486F',
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
          dark: '#D2EBD3',
        },
        textWarning: {
          light: '#F4A462',
          dark: '#F9DBC2',
        },
        textError: {
          light: '#EF486F',
          dark: '#F9B8C7',
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
        transparent012: {
          light: '#2123281F', // transparentGray-012
          dark: '#FFFFFF1F', // transparentWhite-012
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
          dark: '#FFFFFF52', // transparentWhite-032
        },
        transparent072: {
          light: '#212328B8', // transparentGray-072
          dark: '#FFFFFFB8', // transparentWhite-072
        },

        transparentWhite: {
          '004': '#FFFFFF0A', // 4%
          '008': '#FFFFFF14', // 8%
          '012': '#FFFFFF1F', // 12%
          '016': '#FFFFFF29', // 16%
          '020': '#FFFFFF33', // 20%
          '032': '#FFFFFF52', // 32%
          '072': '#FFFFFFB8', // 72%
        },
        transparentGray: {
          '004': '#2123280A', // 4%
          '008': '#21232814', // 8%
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
        },
        darkModeTransparentBrandBlue: {
          '008': '#CAD8FF14', // 8%
          '012': '#869FFF1F', // 12%
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
