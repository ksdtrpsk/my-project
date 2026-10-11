# Shared MySQL sessions

Production and local startup now use app_sessions, shared by all server instances. Existing in-memory session tokens expire during rollout; sign in again. Student/admin roles remain separate. Only token hashes are stored; password changes invalidate sessions through the stored credential fingerprint as well as explicit revocation. Cookies are Secure on Vercel.

Before deploying, connect to the intended existing database and run database/migrations/shared-sessions.sql, or set the intended DB environment variables and run npm run migrate:sessions. This migration is repeatable and does not modify accounts, passwords, bookings or QR data. Do not reimport schema.sql into an existing database. New installations use the updated schema.sql.

The local configured database was migrated successfully. The remote Aiven database has NOT been migrated by the agent. Push the changed backend files, package.json, schema and migration, then redeploy after applying the remote migration. No new environment variables are required.

Validation: 236 tests passed, zero failed/skipped with RUN_MYSQL_TESTS=1. Feature 2 integration now uses MySQL sessions, including existing booking/QR and password reset scenarios. Added two-server checks for both roles, private pages, logout across instances, expiration, role separation and stale-credential rejection. Live Vercel verification still requires redeployment.

Login and password-attempt rate limits remain per-instance as before; this change moves session storage only.
