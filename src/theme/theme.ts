import {
  ActionIcon,
  Button,
  Checkbox,
  colorsTuple,
  createTheme,
  Divider,
  LoadingOverlay,
  MantineThemeOverride,
  Menu,
  Modal,
  Pagination,
  PasswordInput,
  Select,
  Skeleton,
  Slider,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  virtualColor,
  Paper,
  Alert,
  SegmentedControl,
} from '@mantine/core';
import {
  Spotlight,
  SpotlightActionsGroup,
  SpotlightActionsList,
  SpotlightEmpty,
} from '@mantine/spotlight';

import actionIconClasses from './ActionIcon.module.css';
import buttonClasses from './Button.module.css';
import passwordInputClasses from './PasswordInput.module.css';
import selectClasses from './Select.module.css';
import textareaClasses from './Textarea.module.css';
import textInputClasses from './TextInput.module.css';

export const theme = createTheme({
  breakpoints: {
    desktop: '64em',
  },
  fontSizes: {
    body1: '16px',
    body2: '14px',
  },
  lineHeights: {
    body1: '1.0', // 100% = 16px
    body2: '1.286', // 18px / 14px = 1.286
  },
  headings: {
    sizes: {
      h1: {
        fontSize: '32px',
        lineHeight: '1.3',
        fontWeight: '500',
      },
      h2: {
        fontSize: '24px',
        lineHeight: '1.3',
        fontWeight: '500',
      },
      h3: {
        fontSize: '18px',
        lineHeight: '1.3',
        fontWeight: '500',
      },
      h4: {
        fontSize: '16px',
        lineHeight: '1.3',
        fontWeight: '500',
      },
      h5: {
        fontSize: '14px',
        lineHeight: '1.3',
        fontWeight: '500',
      },
    },
  },
  colors: {
    'transparentWhite-004': colorsTuple('#FFFFFF0A'), // 4%
    'transparentWhite-008': colorsTuple('#FFFFFF14'), // 8%
    'transparentWhite-010': colorsTuple('#FFFFFF1A'), // 10%
    'transparentWhite-016': colorsTuple('#FFFFFF29'), // 16%
    'transparentWhite-020': colorsTuple('#FFFFFF33'), // 20%
    'transparentWhite-030': colorsTuple('#FFFFFF4D'), // 30%
    'transparentWhite-072': colorsTuple('#FFFFFFB8'), // 72%

    'transparentGray-004': colorsTuple('#2123280A'), // 4%
    'transparentGray-008': colorsTuple('#21232814'), // 8%
    'transparentGray-010': colorsTuple('#2123281A'), // 10%
    'transparentGray-012': colorsTuple('#2123281F'), // 12%
    'transparentGray-016': colorsTuple('#21232829'), // 16%
    'transparentGray-020': colorsTuple('#21232833'), // 20%
    'transparentGray-032': colorsTuple('#21232852'), // 32%
    'transparentGray-072': colorsTuple('#212328B8'), // 72%

    'transparentBrandBlue-008': colorsTuple('#4957C114'), // 8%
    'transparentBrandBlue-012': colorsTuple('#4957C11F'), // 12%
    'transparentBrandBlue-016': colorsTuple('#4957C129'), // 16%
    'darkModeTransparentBrandBlue-008': colorsTuple('#CAD8FF14'), // 8%
    'darkModeTransparentBrandBlue-012': colorsTuple('#869FFF1F'), // 12%
    'darkModeTransparentBrandBlue-032': colorsTuple('#4C61FF52'), // 32%

    'brand-blue-50': colorsTuple('#F4F4FB'),
    'brand-blue-100': colorsTuple('#E5E7F6'),
    'brand-blue-200': colorsTuple('#B8BDE7'),
    'brand-blue-300': colorsTuple('#98A0DC'),
    'brand-blue-400': colorsTuple('#737ECF'),
    'brand-blue-500': colorsTuple('#4957C1'),
    'brand-blue-600': colorsTuple('#737ECF'),
    'brand-blue-700': colorsTuple('#26349E'),
    'brand-blue-800': colorsTuple('#252E6D'),
    'brand-blue-900': colorsTuple('#131738'),

    'blue-grey-50': colorsTuple('#FFFFFF'),
    white: colorsTuple('#FFFFFF'),
    'blue-grey-100': colorsTuple('#F2F4F8'),
    'blue-grey-200': colorsTuple('#E5E9F2'),
    'blue-grey-300': colorsTuple('#C8CED9'),
    'blue-grey-400': colorsTuple('#A8B3C4'),
    'blue-grey-500': colorsTuple('#8292AA'),
    'blue-grey-600': colorsTuple('#5B6B86'),
    'blue-grey-700': colorsTuple('#384252'),
    'blue-grey-800': colorsTuple('#242B35'),
    'blue-grey-900': colorsTuple('#191D24'),

    'grey-50': colorsTuple('#FDFDFD'),
    'grey-100': colorsTuple('#F6F6F7'),
    'grey-200': colorsTuple('#EBECEE'),
    'grey-300': colorsTuple('#DBDDE1'),
    'grey-400': colorsTuple('#C7CAD0'),
    'grey-500': colorsTuple('#AEB2BB'),
    'grey-600': colorsTuple('#9096A3'),
    'grey-700': colorsTuple('#6F7785'),
    'grey-800': colorsTuple('#3E434B'),
    'grey-900': colorsTuple('#212328'),

    'green-50': colorsTuple('#FCFEFC'),
    'green-100': colorsTuple('#F4FAF4'),
    'green-200': colorsTuple('#E6F4E6'),
    'green-300': colorsTuple('#D2EBD3'),
    'green-400': colorsTuple('#B8E0BA'),
    'green-500': colorsTuple('#99D29B'),
    'green-600': colorsTuple('#75C277'),
    'green-700': colorsTuple('#4CAE4F'),
    'green-800': colorsTuple('#2B612C'),
    'green-900': colorsTuple('#163317'),

    'orange-50': colorsTuple('#FFFEFD'),
    'orange-100': colorsTuple('#FEF9F5'),
    'orange-200': colorsTuple('#FDF2E9'),
    'orange-300': colorsTuple('#FCE8D8'),
    'orange-400': colorsTuple('#FBDBC2'),
    'orange-500': colorsTuple('#F9CCA6'),
    'orange-600': colorsTuple('#F7B987'),
    'orange-700': colorsTuple('#F4A462'),
    'orange-800': colorsTuple('#A8520C'),
    'orange-900': colorsTuple('#4E2605'),

    'magenta-50': colorsTuple('#FFFCFD'),
    'magenta-100': colorsTuple('#FEF4F6'),
    'magenta-200': colorsTuple('#FDE5EB'),
    'magenta-300': colorsTuple('#FBD1DB'),
    'magenta-400': colorsTuple('#F9B8C7'),
    'magenta-500': colorsTuple('#F698AE'),
    'magenta-600': colorsTuple('#F37391'),
    'magenta-700': colorsTuple('#EF486F'),
    'magenta-800': colorsTuple('#990D2E'),
    'magenta-900': colorsTuple('#4A0616'),
    'brandBlue_neon-50': colorsTuple('#111111'),
    'brandBlue_neon-100': colorsTuple('#141414'),
    'brandBlue_neon-200': colorsTuple('#1B255A'),
    'brandBlue_neon-300': colorsTuple('#2C3B93'),
    'brandBlue_neon-400': colorsTuple('#384BCC'),
    'brandBlue_neon-500': colorsTuple('#4C61FF'),
    'brandBlue_neon-600': colorsTuple('#5B76EF'),
    'brandBlue_neon-700': colorsTuple('#6681FF'),
    'brandBlue_neon-800': colorsTuple('#869FFF'),
    'brandBlue_neon-900': colorsTuple('#CAD8FF'),

    'text-primary': virtualColor({
      name: 'text-primary',
      dark: 'grey-50',
      light: 'grey-900',
    }),
    'text-secondary': virtualColor({
      name: 'text-secondary',
      dark: 'blue-grey-400',
      light: 'grey-700',
    }),
    'text-tertiary': virtualColor({
      name: 'text-tertiary',
      dark: 'blue-grey-500',
      light: 'grey-500',
    }),
    'text-success': virtualColor({
      name: 'text-success',
      dark: 'green-700',
      light: 'green-700',
    }),
    'text-warning': virtualColor({
      name: 'text-warning',
      dark: 'orange-700',
      light: 'orange-700',
    }),
    'text-error': virtualColor({
      name: 'text-error',
      dark: 'magenta-700',
      light: 'magenta-700',
    }),
    'text-accent': virtualColor({
      name: 'text-accent',
      dark: 'brandBlue_neon-500',
      light: 'brand-blue-500',
    }),
    'text-contrast': virtualColor({
      name: 'text-contrast',
      dark: 'grey-50',
      light: 'white',
    }),

    // Icons
    'icon-default': virtualColor({
      name: 'icon-default',
      dark: 'blue-grey-300',
      light: 'grey-700',
    }),
    'icon-disabled': virtualColor({
      name: 'icon-disabled',
      dark: 'grey-500',
      light: 'grey-500',
    }),
    'icon-success': virtualColor({
      name: 'icon-success',
      dark: 'green-700',
      light: 'green-700',
    }),
    'icon-warning': virtualColor({
      name: 'icon-warning',
      dark: 'orange-700',
      light: 'orange-700',
    }),
    'icon-error': virtualColor({
      name: 'icon-error',
      dark: 'magenta-700',
      light: 'magenta-700',
    }),
    'icon-accent': virtualColor({
      name: 'icon-accent',
      dark: 'brandBlue_neon-500',
      light: 'brand-blue-500',
    }),
    'icon-contrast': virtualColor({
      name: 'icon-contrast',
      dark: 'blue-grey-200',
      light: 'blue-grey-200',
    }),

    // Backgrounds
    'background-primary': virtualColor({
      name: 'background-primary',
      dark: 'blue-grey-800',
      light: 'grey-50',
    }),
    'background-secondary': virtualColor({
      name: 'background-secondary',
      dark: 'blue-grey-900',
      light: 'blue-grey-100',
    }),
    'background-tertiary': virtualColor({
      name: 'background-tertiary',
      dark: 'blue-grey-600',
      light: 'blue-grey-200',
    }),
    'background-success': virtualColor({
      name: 'background-success',
      dark: 'green-200',
      light: 'green-200',
    }),
    'background-warning': virtualColor({
      name: 'background-warning',
      dark: 'orange-200',
      light: 'orange-200',
    }),
    'background-error': virtualColor({
      name: 'background-error',
      dark: 'magenta-200',
      light: 'magenta-200',
    }),
    'background-accent': virtualColor({
      name: 'background-accent',
      dark: 'brandBlue_neon-500',
      light: 'brand-blue-500',
    }),
    'background-inverse': virtualColor({
      name: 'background-inverse',
      dark: 'blue-grey-700',
      light: 'blue-grey-800',
    }),

    // Borders
    'border-light': virtualColor({
      name: 'border-light',
      dark: 'blue-grey-700',
      light: 'blue-grey-100',
    }),
    'border-primary': virtualColor({
      name: 'border-primary',
      dark: 'blue-grey-600',
      light: 'grey-300',
    }),
    'border-secondary': virtualColor({
      name: 'border-secondary',
      dark: 'grey-400',
      light: 'grey-500',
    }),
    'border-accent': virtualColor({
      name: 'border-accent',
      dark: 'brandBlue_neon-500',
      light: 'brand-blue-500',
    }),
    'border-success': virtualColor({
      name: 'border-success',
      dark: 'green-700',
      light: 'green-700',
    }),
    'border-warning': virtualColor({
      name: 'border-warning',
      dark: 'orange-700',
      light: 'orange-700',
    }),
    'border-error': virtualColor({
      name: 'border-error',
      dark: 'magenta-700',
      light: 'magenta-700',
    }),

    // States
    accentHover: virtualColor({
      name: 'accentHover',
      dark: 'brandBlue_neon-700',
      light: 'brand-blue-400',
    }),
    accentActive: virtualColor({
      name: 'accentActive',
      dark: 'brandBlue_neon-400',
      light: 'brand-blue-700',
    }),
    tertiaryHover: virtualColor({
      name: 'tertiaryHover',
      dark: 'blue-grey-700',
      light: 'blue-grey-300',
    }),
    tertiaryActive: virtualColor({
      name: 'tertiaryActive',
      dark: 'blue-grey-600',
      light: 'blue-grey-400',
    }),
    accentTransparentHover: virtualColor({
      name: 'accentTransparentHover',
      dark: 'transparentBrandBlue-008',
      light: 'transparentBrandBlue-008',
    }),
    accentTransparentActive: virtualColor({
      name: 'accentTransparentActive',
      dark: 'transparentBrandBlue-016',
      light: 'transparentBrandBlue-016',
    }),

    transparent004: virtualColor({
      name: 'transparent004',
      dark: 'transparentWhite-004',
      light: 'transparentGray-004',
    }),
    transparent008: virtualColor({
      name: 'transparent008',
      dark: 'transparentWhite-008',
      light: 'transparentGray-008',
    }),
    transparent010: virtualColor({
      name: 'transparent010',
      dark: 'transparentWhite-010',
      light: 'transparentGray-012',
    }),
    transparent016: virtualColor({
      name: 'transparent016',
      dark: 'transparentWhite-016',
      light: 'transparentGray-016',
    }),
    transparent020: virtualColor({
      name: 'transparent020',
      dark: 'transparentWhite-020',
      light: 'transparentGray-020',
    }),
    transparent032: virtualColor({
      name: 'transparent032',
      dark: 'transparentWhite-030',
      light: 'transparentGray-032',
    }),
    transparent072: virtualColor({
      name: 'transparent072',
      dark: 'transparentWhite-072',
      light: 'transparentGray-072',
    }),

    'transparent010-inverse': virtualColor({
      name: 'transparent010-inverse',
      dark: 'transparentWhite-010',
      light: 'transparentWhite-010',
    }),

    // transparentBrandBlue_palette
    'transparentBrandBlue_palette-008': virtualColor({
      name: 'transparentBrandBlue_palette-008',
      dark: 'darkModeTransparentBrandBlue-008',
      light: 'transparentBrandBlue-008',
    }),
    'transparentBrandBlue_palette-012': virtualColor({
      name: 'transparentBrandBlue_palette-012',
      dark: 'darkModeTransparentBrandBlue-012',
      light: 'transparentBrandBlue-012',
    }),
    'transparentBrandBlue_palette-016': virtualColor({
      name: 'transparentBrandBlue_palette-016',
      dark: 'white',
      light: 'transparentBrandBlue-016',
    }),
    'transparentBrandBlue_palette-032': virtualColor({
      name: 'transparentBrandBlue_palette-032',
      dark: 'darkModeTransparentBrandBlue-032',
      light: 'white',
    }),

    'brandBlue_palette-50': virtualColor({
      name: 'brandBlue_palette-50',
      dark: 'brandBlue_neon-50',
      light: 'brand-blue-50',
    }),
    'brandBlue_palette-100': virtualColor({
      name: 'brandBlue_palette-100',
      dark: 'brandBlue_neon-100',
      light: 'brand-blue-100',
    }),
    'brandBlue_palette-200': virtualColor({
      name: 'brandBlue_palette-200',
      dark: 'brandBlue_neon-200',
      light: 'brand-blue-200',
    }),
    'brandBlue_palette-300': virtualColor({
      name: 'brandBlue_palette-300',
      dark: 'brandBlue_neon-300',
      light: 'brand-blue-300',
    }),
    'brandBlue_palette-400': virtualColor({
      name: 'brandBlue_palette-400',
      dark: 'brand-blue-400',
      light: 'brand-blue-400',
    }),
    'brandBlue_palette-500': virtualColor({
      name: 'brandBlue_palette-500',
      dark: 'brandBlue_neon-500',
      light: 'brand-blue-500',
    }),
    'brandBlue_palette-700': virtualColor({
      name: 'brandBlue_palette-700',
      dark: 'brandBlue_neon-700',
      light: 'brand-blue-700',
    }),
    'brandBlue_palette-800': virtualColor({
      name: 'brandBlue_palette-800',
      dark: 'brandBlue_neon-800',
      light: 'brand-blue-800',
    }),
    'brandBlue_palette-900': virtualColor({
      name: 'brandBlue_palette-900',
      dark: 'brandBlue_neon-900',
      light: 'brand-blue-900',
    }),
  },

  components: {
    Divider: Divider.extend({
      defaultProps: {
        color: 'border-primary',
      },
    }),
    SpotlightEmpty: SpotlightEmpty.extend({
      defaultProps: {
        className: 'text-sm',
      },
    }),
    SpotlightAction: Spotlight.Action.extend({
      defaultProps: {
        fz: '14px',
        lh: '18px',
        className:
          'data-[selected=true]:bg-transparentBrandBlue-016 dark:data-[selected=true]:bg-transparentBrandBlue-016 dark:hover:bg-transparent004-dark rounded-2xl text-textSecondary-light dark:text-textSecondary-dark h-[36px] pl-2 pr-1',
      },
    }),
    SpotlightActionsList: SpotlightActionsList.extend({
      defaultProps: {
        className: 'pb-0 pt-2 px-0 border-borderPrimary-light dark:border-borderPrimary-dark',
      },
    }),
    SpotlightActionsGroup: SpotlightActionsGroup.extend({
      defaultProps: {
        classNames: {
          actionsGroup: 'mt-0',
        },
      },
    }),
    SpotlightRoot: Spotlight.Root.extend({
      defaultProps: {
        centered: false,
        transitionProps: {
          transition: 'fade-down',
          duration: 100,
          exitDuration: 1,
        },
        overlayProps: {
          className: 'bg-transparent010-light dark:bg-transparent004-dark',
          blur: 0,
        },
        classNames: {
          body: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark max-h-[500px] ',
          content: 'rounded-2xl ',
          inner: 'pt-[8px]',
        },
      },
    }),
    Button: Button.extend({
      defaultProps: {
        size: 'sm',
        variant: 'primary',
      },
      classNames: buttonClasses,
    }),
    Skeleton: Skeleton.extend({}),
    ActionIcon: ActionIcon.extend({
      defaultProps: {
        size: 'md',
        variant: 'transparent',
      },
      classNames: actionIconClasses,
    }),
    Switch: Switch.extend({
      defaultProps: {
        size: 'xs',
        color: 'icon-accent',
        withThumbIndicator: false,
      },
    }),
    Text: Text.extend({
      defaultProps: {
        size: 'body2',
        c: 'text-primary',
      },
    }),
    Title: Title.extend({
      defaultProps: {
        c: 'text-primary',
      },
    }),
    Select: Select.extend({
      defaultProps: {
        size: 'xs',
        withCheckIcon: false,
      },
      classNames: selectClasses,
    }),
    Pagination: Pagination.extend({
      defaultProps: {
        size: 'xs',
      },
    }),
    TextInput: TextInput.extend({
      classNames: textInputClasses,
      vars: (_, props) => {
        if (!props.size || props.size === 'sm') {
          return {
            wrapper: {
              '--input-height-sm': '35px',
            },
          };
        }
        return {};
      },
    }),
    Textarea: Textarea.extend({
      classNames: textareaClasses,
    }),
    PasswordInput: PasswordInput.extend({
      classNames: passwordInputClasses,
    }),
    Menu: Menu.extend({
      classNames: {
        item: 'py-1 px-2 text-textContrast-light dark:text-textContrast-dark bg-backgroundInverse-light dark:bg-backgroundInverse-dark hover:bg-transparentWhite-012 dark:hover:bg-transparentWhite-012',
        dropdown:
          'min-w-32 border-0 bg-backgroundInverse-light dark:bg-backgroundInverse-dark px-0 rounded-lg',
        divider: 'border-borderSecondary-light dark:border-borderSecondary-dark',
      },
    }),
    LoadingOverlay: LoadingOverlay.extend({
      defaultProps: {
        zIndex: 1000,
        overlayProps: {
          zIndex: 1000,
        },
      },
    }),

    Checkbox: Checkbox.extend({
      defaultProps: {
        size: 'xs',
        color: 'icon-accent',
      },
      classNames: (_, props) => ({
        input:
          'bg-transparent border-borderPrimary-light dark:border-borderPrimary-dark checked:bg-iconAccent-light dark:checked:bg-iconAccent-dark checked:border-iconAccent-light dark:checked:border-iconAccent-dark disabled:bg-backgroundTertiary-light dark:disabled:bg-backgroundTertiary-dark disabled:border-borderPrimary-light dark:disabled:border-borderPrimary-dark disabled:checked:bg-backgroundTertiary-light dark:disabled:checked:bg-backgroundTertiary-dark',
        label: `text-textPrimary-light dark:text-textPrimary-dark disabled:text-iconDisabled-light dark:disabled:text-iconDisabled-dark ${
          props?.size === 'md'
            ? 'text-base'
            : props?.size === 'sm'
              ? 'text-sm leading-[20px]'
              : 'text-sm leading-[16px]'
        }`,
        icon: 'disabled:text-iconDisabled-light dark:disabled:text-iconDisabled-dark',
      }),
    }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        padding: 24,
        shadow: 'lg',
        overlayProps: {
          blur: 0.7,
          className: 'bg-transparent016-light dark:bg-transparent008-dark',
        },
        classNames: {
          content: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark rounded-2xl',
          header: 'p-4 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
          body: 'p-4 pt-0',
        },
      },
    }),
    Slider: Slider.extend({
      defaultProps: {
        color: 'background-accent',
      },
    }),
    Paper: Paper.extend({
      defaultProps: {
        bg: 'background-primary',
        classNames: {
          root: 'border-borderPrimary-light dark:border-borderPrimary-dark',
        },
      },
    }),
    Alert: Alert.extend({
      defaultProps: {
        variant: 'filled',
      },
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: {
        size: 'sm',
        radius: 'xl',
        color: 'background-tertiary',
        bg: 'background-secondary',
      },
      classNames: {
        label: 'text-textPrimary-light dark:text-textPrimary-dark',
      },
    }),
  },
} as MantineThemeOverride);
