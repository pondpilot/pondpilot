// Mock import.meta.env
global.import = {
  meta: {
    env: {
      DEV: false,
      PROD: true,
    },
  },
};
