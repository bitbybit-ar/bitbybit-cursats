-- Drop the `users.features_autorenewal` column (ADR 0020, revised).
--
-- Autorenewal was deferred from the MVP in ADR 0020, which initially
-- kept the column ("no destructive migration") so a future re-launch
-- could land cleanly. We're now removing the column outright: the API
-- write path was already disabled (UpdateUserProfileSchema no longer
-- accepts it), and leaving a dead boolean on the users table only
-- invites confusion for anyone reading the schema.
--
-- Re-introducing autorenewal will require a fresh migration; the
-- shape may differ from the original anyway.

ALTER TABLE "users" DROP COLUMN "features_autorenewal";
