import { collection, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import { getDb, getAnalyticsService } from "../firebase/config"; // Updated imports
import { logEvent } from "firebase/analytics";

// Initialize Firebase services
const db = getDb();
const analytics = getAnalyticsService();

/**
 * Retry logic for Firestore operations with exponential backoff.
 * @param {string} operation - Name of the operation for logging
 * @param {Function} callback - Firestore operation to execute
 * @param {number} [maxRetries=3] - Maximum number of retries
 * @param {number} [retryDelayBase=1000] - Base delay in milliseconds for exponential backoff
 * @returns {Promise<any>} - Result of the Firestore operation
 * @throws {Error} - If the operation fails after max retries
 */
const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callback();
    } catch (error) {
      if (analytics) {
        logEvent(analytics, "firebase_operation_retry", {
          userId: "anonymous", // User ID not available in utility function; could be passed as param if needed
          operation,
          attempt,
          error_message: error.message,
          timestamp: new Date().toISOString(),
        });
        console.log(`scoring.js - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
      }
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = Math.pow(2, attempt - 1) * retryDelayBase; // Exponential backoff: 1s, 2s, 4s
      console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Calculates pick'em scores for a pool, updates the scoreboard in Firestore, and returns the scoreboard.
 * Supports weighted scoring for upsets and tiebreaker logic.
 * @param {string} poolId - ID of the pool to calculate scores for
 * @param {Object} [options] - Scoring options
 * @param {boolean} [options.includeUpsets=false] - Whether to award bonus points for upset picks
 * @param {number} [options.upsetBonus=2] - Bonus points for correctly picking an upset
 * @param {boolean} [options.useTiebreaker=false] - Whether to use total points as a tiebreaker
 * @returns {Promise<Object>} - Scoreboard { userId: { points, tiebreakerPoints } }
 * @throws {Error} - If poolId is invalid, Firestore operations fail, or no matchups are found
 */
export async function calculatePickemScores(poolId, options = {}) {
  const { includeUpsets = false, upsetBonus = 2, useTiebreaker = false } = options;

  // Validate poolId
  if (!poolId || typeof poolId !== "string") {
    console.error("calculatePickemScores - Invalid poolId:", poolId);
    throw new Error("Pool ID is required and must be a string.");
  }

  // Validate options
  if (typeof includeUpsets !== "boolean") {
    console.error("calculatePickemScores - Invalid includeUpsets:", includeUpsets);
    throw new Error("includeUpsets must be a boolean.");
  }
  if (typeof upsetBonus !== "number" || upsetBonus < 0) {
    console.error("calculatePickemScores - Invalid upsetBonus:", upsetBonus);
    throw new Error("upsetBonus must be a non-negative number.");
  }
  if (typeof useTiebreaker !== "boolean") {
    console.error("calculatePickemScores - Invalid useTiebreaker:", useTiebreaker);
    throw new Error("useTiebreaker must be a boolean.");
  }

  console.log("calculatePickemScores - Starting calculation for poolId:", poolId);
  console.log("calculatePickemScores - Options:", { includeUpsets, upsetBonus, useTiebreaker });

  // 1. Fetch all matchups
  const matchupsRef = collection(db, "pools", poolId, "matchups");
  let snapshot;
  try {
    snapshot = await withRetry("Fetch Matchups", () => getDocs(matchupsRef));
    console.log("calculatePickemScores - Fetched matchups:", snapshot.size);
  } catch (error) {
    console.error("calculatePickemScores - Error fetching matchups:", error);
    let userFriendlyError = "Failed to fetch matchups.";
    if (error.code === "permission-denied") {
      userFriendlyError = "You do not have permission to access matchups for this pool.";
    } else if (error.code === "unavailable") {
      userFriendlyError = "Firestore is currently unavailable. Please try again later.";
    }
    if (analytics) {
      logEvent(analytics, "calculate_pickem_scores_failed", {
        poolId,
        userId: "anonymous",
        error_message: userFriendlyError,
        stage: "fetch_matchups",
        timestamp: new Date().toISOString(),
      });
      console.log("calculatePickemScores - Failure logged to Firebase Analytics");
    }
    throw new Error(userFriendlyError);
  }

  if (snapshot.empty) {
    console.log("calculatePickemScores - No matchups found for poolId:", poolId);
    throw new Error("No matchups found for this pool.");
  }

  // 2. Build a scoreboard object: { userId: { points, tiebreakerPoints } }
  const scoreboard = {};

  snapshot.forEach((matchDoc) => {
    const mData = matchDoc.data();
    console.log("calculatePickemScores - Processing matchup:", matchDoc.id, mData);

    // Must have a finalScore to determine winner
    if (!mData.finalScore?.home || !mData.finalScore?.away) {
      console.log("calculatePickemScores - Skipping matchup, no final score:", matchDoc.id);
      return;
    }

    // Determine the winner side
    const winner = mData.finalScore.home > mData.finalScore.away ? "home" : "away";
    console.log("calculatePickemScores - Winner for matchup", matchDoc.id, ":", winner);

    // Calculate total points for tiebreaker (if enabled)
    const totalPoints = useTiebreaker ? mData.finalScore.home + mData.finalScore.away : 0;

    // Determine if this is an upset (if enabled)
    let isUpset = false;
    if (includeUpsets && mData.favorite) {
      isUpset = (mData.favorite === "home" && winner === "away") || (mData.favorite === "away" && winner === "home");
      console.log("calculatePickemScores - Matchup", matchDoc.id, "is upset:", isUpset);
    }

    if (!mData.picks) {
      console.log("calculatePickemScores - Skipping matchup, no picks:", matchDoc.id);
      return;
    }

    // picks: { userId: "home"|"away" }
    Object.entries(mData.picks).forEach(([uid, pick]) => {
      if (!scoreboard[uid]) {
        scoreboard[uid] = { points: 0, tiebreakerPoints: 0 };
      }
      if (pick === winner) {
        const points = isUpset ? 1 + upsetBonus : 1;
        scoreboard[uid].points += points;
        if (useTiebreaker) {
          scoreboard[uid].tiebreakerPoints += totalPoints;
        }
        console.log(
          "calculatePickemScores - User",
          uid,
          "scored",
          points,
          "points for matchup",
          matchDoc.id,
          useTiebreaker ? `(Tiebreaker: ${totalPoints})` : ""
        );
      }
    });
  });

  // 3. Store scoreboard in the pool doc
  const poolDocRef = doc(db, "pools", poolId);
  try {
    await withRetry("Update Scoreboard", () => updateDoc(poolDocRef, { pickemScoreboard: scoreboard }));
    console.log("calculatePickemScores - Updated scoreboard in Firestore:", scoreboard);
    if (analytics) {
      logEvent(analytics, "calculate_pickem_scores_success", {
        poolId,
        userId: "anonymous",
        matchupsProcessed: snapshot.size,
        usersScored: Object.keys(scoreboard).length,
        timestamp: new Date().toISOString(),
      });
      console.log("calculatePickemScores - Success logged to Firebase Analytics");
    }
  } catch (error) {
    console.error("calculatePickemScores - Error updating scoreboard:", error);
    let userFriendlyError = "Failed to update scoreboard.";
    if (error.code === "permission-denied") {
      userFriendlyError = "You do not have permission to update the scoreboard for this pool.";
    } else if (error.code === "unavailable") {
      userFriendlyError = "Firestore is currently unavailable. Please try again later.";
    }
    if (analytics) {
      logEvent(analytics, "calculate_pickem_scores_failed", {
        poolId,
        userId: "anonymous",
        error_message: userFriendlyError,
        stage: "update_scoreboard",
        timestamp: new Date().toISOString(),
      });
      console.log("calculatePickemScores - Failure logged to Firebase Analytics");
    }
    throw new Error(userFriendlyError);
  }

  return scoreboard;
}

/**
 * Calculates weekly pick'em scores for a specific week within a pool.
 * Updates the weekly scoreboard in pools/{poolId}/weeklyScores/{week}.
 * @param {string} poolId - ID of the pool to calculate scores for
 * @param {string} week - Week identifier (e.g., "week1", "week2")
 * @param {Object} [options] - Scoring options
 * @param {boolean} [options.includeUpsets=false] - Whether to award bonus points for upset picks
 * @param {number} [options.upsetBonus=2] - Bonus points for correctly picking an upset
 * @param {boolean} [options.useTiebreaker=false] - Whether to use total points as a tiebreaker
 * @returns {Promise<Object>} - Weekly scoreboard { userId: { points, tiebreakerPoints } }
 * @throws {Error} - If poolId or week is invalid, Firestore operations fail, or no matchups are found
 */
export async function calculateWeeklyScores(poolId, week, options = {}) {
  const { includeUpsets = false, upsetBonus = 2, useTiebreaker = false } = options;

  // Validate inputs
  if (!poolId || typeof poolId !== "string") {
    console.error("calculateWeeklyScores - Invalid poolId:", poolId);
    throw new Error("Pool ID is required and must be a string.");
  }
  if (!week || typeof week !== "string" || !week.match(/^week\d+$/)) {
    console.error("calculateWeeklyScores - Invalid week format:", week);
    throw new Error("Week identifier must be a string in the format 'weekN' (e.g., 'week1', 'week2').");
  }
  if (typeof includeUpsets !== "boolean") {
    console.error("calculateWeeklyScores - Invalid includeUpsets:", includeUpsets);
    throw new Error("includeUpsets must be a boolean.");
  }
  if (typeof upsetBonus !== "number" || upsetBonus < 0) {
    console.error("calculateWeeklyScores - Invalid upsetBonus:", upsetBonus);
    throw new Error("upsetBonus must be a non-negative number.");
  }
  if (typeof useTiebreaker !== "boolean") {
    console.error("calculateWeeklyScores - Invalid useTiebreaker:", useTiebreaker);
    throw new Error("useTiebreaker must be a boolean.");
  }

  console.log("calculateWeeklyScores - Starting calculation for poolId:", poolId, "Week:", week);
  console.log("calculateWeeklyScores - Options:", { includeUpsets, upsetBonus, useTiebreaker });

  // 1. Fetch matchups for the specific week
  const matchupsRef = collection(db, "pools", poolId, "matchups");
  let snapshot;
  try {
    snapshot = await withRetry("Fetch Matchups for Week", () => getDocs(matchupsRef));
    console.log("calculateWeeklyScores - Fetched matchups for week", week, ":", snapshot.size);
  } catch (error) {
    console.error("calculateWeeklyScores - Error fetching matchups:", error);
    let userFriendlyError = "Failed to fetch matchups.";
    if (error.code === "permission-denied") {
      userFriendlyError = "You do not have permission to access matchups for this pool.";
    } else if (error.code === "unavailable") {
      userFriendlyError = "Firestore is currently unavailable. Please try again later.";
    }
    if (analytics) {
      logEvent(analytics, "calculate_weekly_scores_failed", {
        poolId,
        week,
        userId: "anonymous",
        error_message: userFriendlyError,
        stage: "fetch_matchups",
        timestamp: new Date().toISOString(),
      });
      console.log("calculateWeeklyScores - Failure logged to Firebase Analytics");
    }
    throw new Error(userFriendlyError);
  }

  // 2. Build a weekly scoreboard: { userId: { points, tiebreakerPoints } }
  const scoreboard = {};
  let matchupsForWeekCount = 0;

  snapshot.forEach((matchDoc) => {
    const mData = matchDoc.data();
    console.log("calculateWeeklyScores - Processing matchup:", matchDoc.id, mData);

    // Skip if matchup is not for this week
    if (mData.week !== parseInt(week.replace("week", ""))) {
      console.log("calculateWeeklyScores - Skipping matchup, wrong week:", matchDoc.id, mData.week);
      return;
    }

    matchupsForWeekCount++;

    // Must have a finalScore to determine winner
    if (!mData.finalScore?.home || !mData.finalScore?.away) {
      console.log("calculateWeeklyScores - Skipping matchup, no final score:", matchDoc.id);
      return;
    }

    // Determine the winner side
    const winner = mData.finalScore.home > mData.finalScore.away ? "home" : "away";
    console.log("calculateWeeklyScores - Winner for matchup", matchDoc.id, ":", winner);

    // Calculate total points for tiebreaker (if enabled)
    const totalPoints = useTiebreaker ? mData.finalScore.home + mData.finalScore.away : 0;

    // Determine if this is an upset (if enabled)
    let isUpset = false;
    if (includeUpsets && mData.favorite) {
      isUpset = (mData.favorite === "home" && winner === "away") || (mData.favorite === "away" && winner === "home");
      console.log("calculateWeeklyScores - Matchup", matchDoc.id, "is upset:", isUpset);
    }

    if (!mData.picks) {
      console.log("calculateWeeklyScores - Skipping matchup, no picks:", matchDoc.id);
      return;
    }

    // picks: { userId: "home"|"away" }
    Object.entries(mData.picks).forEach(([uid, pick]) => {
      if (!scoreboard[uid]) {
        scoreboard[uid] = { points: 0, tiebreakerPoints: 0 };
      }
      if (pick === winner) {
        const points = isUpset ? 1 + upsetBonus : 1;
        scoreboard[uid].points += points;
        if (useTiebreaker) {
          scoreboard[uid].tiebreakerPoints += totalPoints;
        }
        console.log(
          "calculateWeeklyScores - User",
          uid,
          "scored",
          points,
          "points for matchup",
          matchDoc.id,
          useTiebreaker ? `(Tiebreaker: ${totalPoints})` : ""
        );
      }
    });
  });

  if (matchupsForWeekCount === 0) {
    console.log("calculateWeeklyScores - No matchups found for poolId:", poolId, "Week:", week);
    throw new Error(`No matchups found for week ${week} in this pool.`);
  }

  // 3. Store weekly scoreboard in Firestore under pools/{poolId}/weeklyScores/{week}
  const weekDocRef = doc(db, "pools", poolId, "weeklyScores", week);
  try {
    await withRetry("Update Weekly Scoreboard", () => setDoc(weekDocRef, { scoreboard }));
    console.log("calculateWeeklyScores - Updated weekly scoreboard in Firestore for week", week, ":", scoreboard);
    if (analytics) {
      logEvent(analytics, "calculate_weekly_scores_success", {
        poolId,
        week,
        userId: "anonymous",
        matchupsProcessed: matchupsForWeekCount,
        usersScored: Object.keys(scoreboard).length,
        timestamp: new Date().toISOString(),
      });
      console.log("calculateWeeklyScores - Success logged to Firebase Analytics");
    }
  } catch (error) {
    console.error("calculateWeeklyScores - Error updating weekly scoreboard:", error);
    let userFriendlyError = "Failed to update weekly scoreboard.";
    if (error.code === "permission-denied") {
      userFriendlyError = "You do not have permission to update the weekly scoreboard for this pool.";
    } else if (error.code === "unavailable") {
      userFriendlyError = "Firestore is currently unavailable. Please try again later.";
    }
    if (analytics) {
      logEvent(analytics, "calculate_weekly_scores_failed", {
        poolId,
        week,
        userId: "anonymous",
        error_message: userFriendlyError,
        stage: "update_scoreboard",
        timestamp: new Date().toISOString(),
      });
      console.log("calculateWeeklyScores - Failure logged to Firebase Analytics");
    }
    throw new Error(userFriendlyError);
  }

  return scoreboard;
}