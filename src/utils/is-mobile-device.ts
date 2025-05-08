export const isMobileDevice = () => {
  const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  return mobileRegex.test(userAgent);
};
