/**
 * ranking.ts — Pure functions for Duker News ranking.
 *
 * Post score uses HN-style time-decay with gravity reduced by boost_amount.
 * Boost = "life extension" — boosted posts don't score higher at t=0 but
 * decay slower, staying visible longer to accumulate organic upvotes.
 *
 * Formula:
 *   score = points / (T + 2)^effective_gravity
 *   effective_gravity = BASE_GRAVITY - min(total_boost / BOOST_CAP, 1.0) × BOOST_POWER
 *
 * Constants:
 *   BASE_GRAVITY = 1.8  (HN default)
 *   MIN_GRAVITY  = 1.2  (max boost effect)
 *   BOOST_POWER  = 0.6  (BASE - MIN)
 *   BOOST_CAP    = 64   ($64 max per action, also normalizer)
 */

// ─── Constants ───────────────────────────────────────────

export const BASE_GRAVITY = 1.8
export const MIN_GRAVITY = 1.2
export const BOOST_POWER = BASE_GRAVITY - MIN_GRAVITY  // 0.6
export const BOOST_CAP = 64  // $64 normalizer

// ─── Core Functions ──────────────────────────────────────

/**
 * Compute effective gravity for a post based on its total boost.
 * Range: 1.8 (no boost) → 1.2 (max boost).
 */
export function effectiveGravity(totalBoost: number): number {
    const boostRatio = Math.min(totalBoost / BOOST_CAP, 1.0)
    return BASE_GRAVITY - boostRatio * BOOST_POWER
}

/**
 * Compute the ranking score for a post.
 *
 * @param points     - Organic upvote count (1 per user)
 * @param totalBoost - Accumulated boost in USDT (creator + upvote boosts)
 * @param createdAt  - Creation timestamp in milliseconds
 * @param now        - Current timestamp in milliseconds (default: Date.now())
 * @returns          - Ranking score (higher = ranked higher)
 */
export function computeScore(
    points: number,
    totalBoost: number,
    createdAt: number,
    now: number = Date.now(),
): number {
    const ageHours = Math.max(0, (now - createdAt) / (1000 * 60 * 60))
    const gravity = effectiveGravity(totalBoost)
    return points / Math.pow(ageHours + 2, gravity)
}

/**
 * Build an SQL expression for the ranking score.
 * Used in ORDER BY clauses for query-time scoring.
 *
 * D1/SQLite compatible — uses POWER() function.
 * total_boost is normalized: min(total_boost / 64.0, 1.0)
 *
 * @param nowMs - Current time in milliseconds
 */
export function scoreSqlExpr(nowMs: number): string {
    // age_hours = max(0, (now_ms - created_at) / 3600000.0)
    // gravity   = 1.8 - min(total_boost / 64.0, 1.0) * 0.6
    // score     = points / pow(age_hours + 2, gravity)
    //
    // Uses pow() instead of POWER() for SQLite compatibility (3.35+).
    return `(
        CAST(COALESCE(points, 1) AS REAL) / pow(
            MAX(0.0, (${nowMs} - created_at) / 3600000.0) + 2.0,
            ${BASE_GRAVITY} - MIN(COALESCE(total_boost, 0) / ${BOOST_CAP}.0, 1.0) * ${BOOST_POWER}
        )
    )`
}
