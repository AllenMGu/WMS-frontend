// Runtime configuration for the standalone Web frontend.
// Keep /api when the frontend and backend share a reverse-proxy origin.
window.WMS_CONFIG = Object.assign(
  {
    apiBaseUrl: "/api"
  },
  window.WMS_CONFIG || {}
);
