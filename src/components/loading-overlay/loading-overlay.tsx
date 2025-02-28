import React, { PropsWithChildren } from 'react';

interface LoadingOverlayProps extends PropsWithChildren {
  visible: boolean;
}

export const LoadingOverlay = ({ children, visible }: LoadingOverlayProps) => {
  if (!visible) return null;
  return (
    <div className="m-[1px] absolute inset-0 dark:bg-transparentGray-020 bg-transparentWhite-020 backdrop-blur-md flex items-center justify-center z-50">
      {children}
    </div>
  );
};
