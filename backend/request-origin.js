// Vercel terminates HTTPS before forwarding to the Node server.
function requestOrigin(req) {
  const protocol = process.env.VERCEL === '1' || req.socket?.encrypted ? 'https' : 'http';
  return protocol + '://' + req.headers.host;
}
function allowedHost(host) {
  if (/^((localhost)|(127\.0\.0\.1)):\d+$/.test(host || '')) return true;
  const configured = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, ...(process.env.APP_HOSTS || '').split(',')].filter(Boolean).map(value => value.trim().toLowerCase());
  return configured.includes((host || '').toLowerCase());
}
module.exports = { requestOrigin, allowedHost };
