interface AltIconProps extends React.ComponentPropsWithoutRef<'svg'> {
  size?: number | string;
}

export function AltIcon({ size, style, ...others }: AltIconProps) {
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
      <path d="M3.33301 13.3333V8.33332C3.33301 7.8913 3.5086 7.46737 3.82116 7.15481C4.13372 6.84225 4.55765 6.66666 4.99967 6.66666C5.4417 6.66666 5.86563 6.84225 6.17819 7.15481C6.49075 7.46737 6.66634 7.8913 6.66634 8.33332V13.3333M3.33301 10.8333H6.66634M9.16634 6.66666V13.3333H12.4997M13.333 6.66666H16.6663M14.9997 6.66666V13.3333" />
    </svg>
  );
}
