export const DotAnimation = () => {
  return (
    <span className="dot-animation w-2">
      <style>
        {`
          @keyframes dots {
            0%,
            20% {
              content: '.';
            }
            40% {
              content: '..';
            }
            60% {
              content: '...';
            }
            80%,
            100% {
              content: '';
            }
          }
          .dot-animation::after {
            display: inline-block;
            width: 12px;
            animation: dots 1.2s steps(1, end) infinite;
            content: '';
          }
        `}
      </style>
    </span>
  );
};
