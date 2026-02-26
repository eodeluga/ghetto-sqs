# Schema And Index Rollout

## Rollout Sequence

1. Generate Prisma client:
   - `bun run generate`
2. Apply schema updates to staging:
   - `bunx prisma db push`
3. Verify new indexes exist and queries use expected plans.
4. Run integration tests against staging.
5. Deploy application and schema changes to production during a controlled window.

## Safety Checks

1. Validate unique constraints before enabling them in production.
2. Track index build duration and lock impact.
3. Ensure rollback steps are prepared before rollout.

## Rollback

1. Stop deploy traffic shift.
2. Revert the application release.
3. Restore database from the latest known-good backup if new constraints are violated.
4. Re-run smoke tests and reopen traffic only after validation.
