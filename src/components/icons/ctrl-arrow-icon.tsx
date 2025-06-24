interface CtrlArrowIconProps extends React.ComponentPropsWithoutRef<'svg'> {
  size?: number | string;
}

export function CtrlArrowIcon({ size, style, ...others }: CtrlArrowIconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, ...style }}
      {...others}
    >
      <path d="M5 8.33329L10 4.16663L15 8.33329" />
    </svg>
  );
}
