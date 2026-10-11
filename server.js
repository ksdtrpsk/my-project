// Root entrypoint detected by Vercel; reuse all existing routes and services.
const { start } = require('./backend/server');
start().catch(error => { console.error(error.message); process.exitCode = 1; });
