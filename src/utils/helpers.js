import { getAnalyticsService } from "../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";

// Initialize Firebase Analytics service
const analytics = getAnalyticsService();

/**
 * Generates a random invite code of specified length.
 * @param {number} [length=6] - Length of the invite code (must be between 4 and 10)
 * @returns {string} - Random invite code (e.g., "ABC123")
 * @throws {Error} - If length is invalid
 */
export function generateInviteCode(length = 6) {
  // Validate length
  if (typeof length !== "number" || length < 4 || length > 10) {
    console.error("generateInviteCode - Invalid length:", length);
    if (analytics) {
      logEvent(analytics, "generate_invite_code_failed", {
        error_message: "Invalid length; must be a number between 4 and 10.",
        length,
        timestamp: new Date().toISOString(),
      });
      console.log("generateInviteCode - Failure logged to Firebase Analytics");
    }
    throw new Error("Length must be a number between 4 and 10.");
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars.charAt(randomIndex);
  }

  console.log("generateInviteCode - Generated code:", result);
  if (analytics) {
    logEvent(analytics, "generate_invite_code_success", {
      codeLength: length,
      code: result,
      timestamp: new Date().toISOString(),
    });
    console.log("generateInviteCode - Success logged to Firebase Analytics");
  }

  return result;
}

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 * @throws {Error} - If array is not an array or is empty
 */
export function shuffleArray(array) {
  // Validate array
  if (!Array.isArray(array)) {
    console.error("shuffleArray - Invalid array:", array);
    if (analytics) {
      logEvent(analytics, "shuffle_array_failed", {
        error_message: "Input must be an array.",
        input: array,
        timestamp: new Date().toISOString(),
      });
      console.log("shuffleArray - Failure logged to Firebase Analytics");
    }
    throw new Error("Input must be an array.");
  }
  if (array.length === 0) {
    console.error("shuffleArray - Empty array:", array);
    if (analytics) {
      logEvent(analytics, "shuffle_array_failed", {
        error_message: "Array cannot be empty.",
        input: array,
        timestamp: new Date().toISOString(),
      });
      console.log("shuffleArray - Failure logged to Firebase Analytics");
    }
    throw new Error("Array cannot be empty.");
  }

  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  console.log("shuffleArray - Shuffled array:", arr);
  if (analytics) {
    logEvent(analytics, "shuffle_array_success", {
      arrayLength: arr.length,
      shuffledArray: arr,
      timestamp: new Date().toISOString(),
    });
    console.log("shuffleArray - Success logged to Firebase Analytics");
  }

  return arr;
}

/**
 * Assigns random digits (0–9) to the axes of a 10x10 grid for Square Pools.
 * @returns {{ rowDigits: number[], colDigits: number[] }} - Object with rowDigits and colDigits arrays (0–9)
 */
export function assignGridDigits() {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const rowDigits = shuffleArray(digits);
  const colDigits = shuffleArray(digits);
  const result = { rowDigits, colDigits };

  console.log("assignGridDigits - Assigned digits:", result);
  if (analytics) {
    logEvent(analytics, "assign_grid_digits_success", {
      rowDigits,
      colDigits,
      timestamp: new Date().toISOString(),
    });
    console.log("assignGridDigits - Success logged to Firebase Analytics");
  }

  return result;
}

/**
 * Generates a randomized list of numbers for Strip Cards (e.g., 10 or 20 numbers).
 * @param {number} [count=10] - Number of strip cards to generate (must be between 1 and 20)
 * @returns {number[]} - Array of random numbers (0–9)
 * @throws {Error} - If count is invalid
 */
export function generateStripCardNumbers(count = 10) {
  // Validate count
  if (typeof count !== "number" || count < 1 || count > 20) {
    console.error("generateStripCardNumbers - Invalid count:", count);
    if (analytics) {
      logEvent(analytics, "generate_strip_card_numbers_failed", {
        error_message: "Count must be a number between 1 and 20.",
        count,
        timestamp: new Date().toISOString(),
      });
      console.log("generateStripCardNumbers - Failure logged to Firebase Analytics");
    }
    throw new Error("Count must be a number between 1 and 20.");
  }

  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const result = [];

  // Generate random digits (0–9) for the specified count
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    result.push(digits[randomIndex]);
  }

  console.log("generateStripCardNumbers - Generated numbers:", result);
  if (analytics) {
    logEvent(analytics, "generate_strip_card_numbers_success", {
      count,
      numbers: result,
      timestamp: new Date().toISOString(),
    });
    console.log("generateStripCardNumbers - Success logged to Firebase Analytics");
  }

  return result;
}

/**
 * Calculates payouts for Square Pools based on pool settings.
 * @param {Object} poolSettings - Pool settings (e.g., totalPot, payoutStructure)
 * @param {number} poolSettings.totalPot - Total pot amount for payouts
 * @param {string | { q1: number, q2: number, q3: number, final: number }} [poolSettings.payoutStructure="default"] - Payout structure ("default" or custom percentages)
 * @param {Object} [scores=null] - Current scores to determine winners (optional, not implemented)
 * @returns {{ q1: number, q2: number, q3: number, final: number, winners?: Object }} - Payout distribution (e.g., per quarter, final)
 * @throws {Error} - If totalPot or payoutStructure is invalid
 */
export function calculatePayouts(poolSettings, scores = null) {
  const { totalPot = 0, payoutStructure = "default" } = poolSettings;

  // Validate totalPot
  if (typeof totalPot !== "number" || totalPot <= 0) {
    console.error("calculatePayouts - Invalid totalPot:", totalPot);
    if (analytics) {
      logEvent(analytics, "calculate_payouts_failed", {
        error_message: "Total pot must be a number greater than 0.",
        totalPot,
        timestamp: new Date().toISOString(),
      });
      console.log("calculatePayouts - Failure logged to Firebase Analytics");
    }
    throw new Error("Total pot must be a number greater than 0.");
  }

  // Default payout structure: 20% per quarter, 40% for final
  const defaultStructure = {
    q1: 0.2, // 20% for Q1
    q2: 0.2, // 20% for Q2
    q3: 0.2, // 20% for Q3
    final: 0.4, // 40% for final score
  };

  // Determine payout structure
  let structure;
  if (payoutStructure === "default") {
    structure = defaultStructure;
  } else if (
    typeof payoutStructure === "object" &&
    payoutStructure !== null &&
    typeof payoutStructure.q1 === "number" &&
    typeof payoutStructure.q2 === "number" &&
    typeof payoutStructure.q3 === "number" &&
    typeof payoutStructure.final === "number"
  ) {
    structure = {
      q1: payoutStructure.q1,
      q2: payoutStructure.q2,
      q3: payoutStructure.q3,
      final: payoutStructure.final,
    };
  } else {
    console.error("calculatePayouts - Invalid payoutStructure:", payoutStructure);
    if (analytics) {
      logEvent(analytics, "calculate_payouts_failed", {
        error_message: "Payout structure must be 'default' or an object with q1, q2, q3, and final properties as numbers.",
        payoutStructure,
        timestamp: new Date().toISOString(),
      });
      console.log("calculatePayouts - Failure logged to Firebase Analytics");
    }
    throw new Error("Payout structure must be 'default' or an object with q1, q2, q3, and final properties as numbers.");
  }

  // Validate payout structure totals to 100%
  const totalPercentage = (structure.q1 + structure.q2 + structure.q3 + structure.final) * 100;
  if (Math.abs(totalPercentage - 100) > 1) {
    console.error("calculatePayouts - Payout structure does not total 100%:", totalPercentage);
    if (analytics) {
      logEvent(analytics, "calculate_payouts_failed", {
        error_message: "Payout structure percentages must total 100%.",
        totalPercentage,
        structure,
        timestamp: new Date().toISOString(),
      });
      console.log("calculatePayouts - Failure logged to Firebase Analytics");
    }
    throw new Error("Payout structure percentages must total 100%.");
  }

  // Calculate payouts
  const payouts = {
    q1: totalPot * structure.q1,
    q2: totalPot * structure.q2,
    q3: totalPot * structure.q3,
    final: totalPot * structure.final,
  };

  // Optionally calculate winners based on scores (placeholder for actual logic)
  if (scores) {
    // Example: scores = { home: { q1: 7, q2: 14, q3: 21, final: 28 }, away: { q1: 3, q2: 10, q3: 17, final: 24 } }
    // This would require grid data to determine winners, to be implemented in dashboard logic
    console.log("calculatePayouts - Scores provided, but winner calculation is TBD:", scores);
    payouts.winners = {
      q1: null,
      q2: null,
      q3: null,
      final: null,
    };
  }

  console.log("calculatePayouts - Calculated payouts:", payouts);
  if (analytics) {
    logEvent(analytics, "calculate_payouts_success", {
      totalPot,
      structure,
      payouts,
      timestamp: new Date().toISOString(),
    });
    console.log("calculatePayouts - Success logged to Firebase Analytics");
  }

  return payouts;
}

/**
 * Formats a number as currency (USD).
 * @param {number} amount - Amount to format
 * @returns {string} - Formatted currency string (e.g., "$12.34")
 * @throws {Error} - If amount is invalid
 */
export function formatCurrency(amount) {
  // Validate amount
  if (typeof amount !== "number" || isNaN(amount)) {
    console.error("formatCurrency - Invalid amount:", amount);
    if (analytics) {
      logEvent(analytics, "format_currency_failed", {
        error_message: "Amount must be a valid number.",
        amount,
        timestamp: new Date().toISOString(),
      });
      console.log("formatCurrency - Failure logged to Firebase Analytics");
    }
    throw new Error("Amount must be a valid number.");
  }

  const formatted = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  console.log("formatCurrency - Formatted amount:", formatted);
  if (analytics) {
    logEvent(analytics, "format_currency_success", {
      amount,
      formatted,
      timestamp: new Date().toISOString(),
    });
    console.log("formatCurrency - Success logged to Firebase Analytics");
  }

  return formatted;
}