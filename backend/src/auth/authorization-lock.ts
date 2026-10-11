import { EntityManager } from "typeorm";

// User mutations take the exclusive lock; task operations take its shared form.
// Acquire this before reading authorization state and before task row locks.
export async function lockAuthorization(
  manager: EntityManager,
  shared = false,
) {
  await manager.query(
    shared
      ? "SELECT pg_advisory_xact_lock_shared(1791701867, 4)"
      : "SELECT pg_advisory_xact_lock(1791701867, 4)",
  );
}
