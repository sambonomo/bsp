/***********************************
 * validations.js (UPDATED VERSION)
 ***********************************/
import { getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";

// Initialize Firebase Analytics service
const analytics = getAnalyticsService();

/**
 * Validates an email address using a robust regex.
 * @param {string} email - Email address to validate
 * @returns {string|null} - Error message if invalid, null if valid
 */
export function validateEmail(email) {
  // Validate email type and presence
  if (typeof email !== "string") {
    console.error("validateEmail - Invalid email type:", typeof email);
    if (analytics) {
      logEvent(analytics, "validate_email_failed", {
        error_message: "Email must be a string.",
        email,
        timestamp: new Date().toISOString(),
      });
      console.log("validateEmail - Failure logged to Firebase Analytics");
    }
    return "Email must be a string.";
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    console.warn("validateEmail - Email is required:", trimmedEmail);
    if (analytics) {
      logEvent(analytics, "validate_email_failed", {
        error_message: "Email is required.",
        email: trimmedEmail,
        timestamp: new Date().toISOString(),
      });
      console.log("validateEmail - Failure logged to Firebase Analytics");
    }
    return "Email is required.";
  }

  // RFC 5322 compliant regex (simplified for practical use)
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const isValid = re.test(trimmedEmail);
  console.log("validateEmail - Email:", trimmedEmail, "Valid:", isValid);

  if (isValid) {
    if (analytics) {
      logEvent(analytics, "validate_email_success", {
        email: trimmedEmail,
        timestamp: new Date().toISOString(),
      });
      console.log("validateEmail - Success logged to Firebase Analytics");
    }
    return null;
  } else {
    if (analytics) {
      logEvent(analytics, "validate_email_failed", {
        error_message: "Please enter a valid email address.",
        email: trimmedEmail,
        timestamp: new Date().toISOString(),
      });
      console.log("validateEmail - Failure logged to Firebase Analytics");
    }
    return "Please enter a valid email address.";
  }
}

/**
 * Validates a password with rules:
 * - Minimum length of 8 characters
 * - At least one uppercase letter
 * - At least one number
 * - At least one special character
 * @param {string} password - Password to validate
 * @returns {string|null} - Error message if invalid, null if valid
 */
export function validatePassword(password) {
  if (typeof password !== "string") {
    console.error("validatePassword - Invalid password type:", typeof password);
    if (analytics) {
      logEvent(analytics, "validate_password_failed", {
        error_message: "Password must be a string.",
        password,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePassword - Failure logged to Firebase Analytics");
    }
    return "Password must be a string.";
  }

  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    console.warn("validatePassword - Password is required:", trimmedPassword);
    if (analytics) {
      logEvent(analytics, "validate_password_failed", {
        error_message: "Password is required.",
        password: trimmedPassword,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePassword - Failure logged to Firebase Analytics");
    }
    return "Password is required.";
  }

  if (trimmedPassword.length < 8) {
    console.warn("validatePassword - Password too short:", trimmedPassword.length);
    if (analytics) {
      logEvent(analytics, "validate_password_failed", {
        error_message: "Password must be at least 8 characters long.",
        passwordLength: trimmedPassword.length,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePassword - Failure logged to Firebase Analytics");
    }
    return "Password must be at least 8 characters long.";
  }

  const uppercaseRegex = /[A-Z]/;
  if (!uppercaseRegex.test(trimmedPassword)) {
    console.warn("validatePassword - Missing uppercase:", trimmedPassword);
    if (analytics) {
      logEvent(analytics, "validate_password_failed", {
        error_message: "Password must contain at least one uppercase letter.",
        timestamp: new Date().toISOString(),
      });
      console.log("validatePassword - Failure logged to Firebase Analytics");
    }
    return "Password must contain at least one uppercase letter.";
  }

  const numberRegex = /[0-9]/;
  if (!numberRegex.test(trimmedPassword)) {
    console.warn("validatePassword - Missing number:", trimmedPassword);
    if (analytics) {
      logEvent(analytics, "validate_password_failed", {
        error_message: "Password must contain at least one number.",
        timestamp: new Date().toISOString(),
      });
      console.log("validatePassword - Failure logged to Firebase Analytics");
    }
    return "Password must contain at least one number.";
  }

  const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;
  if (!specialCharRegex.test(trimmedPassword)) {
    console.warn("validatePassword - Missing special character:", trimmedPassword);
    if (analytics) {
      logEvent(analytics, "validate_password_failed", {
        error_message: "Password must contain at least one special character.",
        timestamp: new Date().toISOString(),
      });
      console.log("validatePassword - Failure logged to Firebase Analytics");
    }
    return "Password must contain at least one special character.";
  }

  console.log("validatePassword - Password valid:", trimmedPassword);
  if (analytics) {
    logEvent(analytics, "validate_password_success", {
      passwordLength: trimmedPassword.length,
      timestamp: new Date().toISOString(),
    });
    console.log("validatePassword - Success logged to Firebase Analytics");
  }

  return null;
}

/**
 * Validates that two passwords match (e.g., new password and confirm password).
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {string|null}
 */
export function validateConfirmPassword(password, confirmPassword) {
  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    console.error("validateConfirmPassword - Invalid input types:", { password, confirmPassword });
    if (analytics) {
      logEvent(analytics, "validate_confirm_password_failed", {
        error_message: "Both passwords must be strings.",
        password,
        confirmPassword,
        timestamp: new Date().toISOString(),
      });
      console.log("validateConfirmPassword - Failure logged to Firebase Analytics");
    }
    return "Both passwords must be strings.";
  }

  const trimmedPassword = password.trim();
  const trimmedConfirmPassword = confirmPassword.trim();

  if (!trimmedPassword) {
    console.warn("validateConfirmPassword - Password is required:", trimmedPassword);
    if (analytics) {
      logEvent(analytics, "validate_confirm_password_failed", {
        error_message: "Password is required.",
        password: trimmedPassword,
        confirmPassword: trimmedConfirmPassword,
        timestamp: new Date().toISOString(),
      });
      console.log("validateConfirmPassword - Failure logged to Firebase Analytics");
    }
    return "Password is required.";
  }

  if (!trimmedConfirmPassword) {
    console.warn("validateConfirmPassword - Confirmation password is required:", trimmedConfirmPassword);
    if (analytics) {
      logEvent(analytics, "validate_confirm_password_failed", {
        error_message: "Please confirm your password.",
        password: trimmedPassword,
        confirmPassword: trimmedConfirmPassword,
        timestamp: new Date().toISOString(),
      });
      console.log("validateConfirmPassword - Failure logged to Firebase Analytics");
    }
    return "Please confirm your password.";
  }

  const isMatch = trimmedPassword === trimmedConfirmPassword;
  console.log("validateConfirmPassword - Passwords match:", isMatch);

  if (isMatch) {
    if (analytics) {
      logEvent(analytics, "validate_confirm_password_success", {
        passwordLength: trimmedPassword.length,
        timestamp: new Date().toISOString(),
      });
      console.log("validateConfirmPassword - Success logged to Firebase Analytics");
    }
    return null;
  } else {
    if (analytics) {
      logEvent(analytics, "validate_confirm_password_failed", {
        error_message: "Passwords do not match.",
        passwordLength: trimmedPassword.length,
        confirmPasswordLength: trimmedConfirmPassword.length,
        timestamp: new Date().toISOString(),
      });
      console.log("validateConfirmPassword - Failure logged to Firebase Analytics");
    }
    return "Passwords do not match.";
  }
}

/**
 * Validates a pool name:
 * - Required
 * - Must not exceed 100 characters
 * - Can contain letters, numbers, spaces, underscores, hyphens, and basic punctuation (.,!?)
 * @param {string} name
 * @returns {string|null}
 */
export function validatePoolName(name) {
  if (typeof name !== "string") {
    console.error("validatePoolName - Invalid pool name type:", typeof name);
    if (analytics) {
      logEvent(analytics, "validate_pool_name_failed", {
        error_message: "Pool name must be a string.",
        name,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolName - Failure logged to Firebase Analytics");
    }
    return "Pool name must be a string.";
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    console.warn("validatePoolName - Pool name is required:", trimmedName);
    if (analytics) {
      logEvent(analytics, "validate_pool_name_failed", {
        error_message: "Pool name is required.",
        name: trimmedName,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolName - Failure logged to Firebase Analytics");
    }
    return "Pool name is required.";
  }

  if (trimmedName.length > 100) {
    console.warn("validatePoolName - Pool name too long:", trimmedName.length);
    if (analytics) {
      logEvent(analytics, "validate_pool_name_failed", {
        error_message: "Pool name cannot exceed 100 characters.",
        nameLength: trimmedName.length,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolName - Failure logged to Firebase Analytics");
    }
    return "Pool name cannot exceed 100 characters.";
  }

  // Allowed: letters, numbers, spaces, underscores, hyphens, .,!?
  const re = /^[a-zA-Z0-9\s_\-.,!?]+$/;
  if (!re.test(trimmedName)) {
    console.warn("validatePoolName - Invalid characters in pool name:", trimmedName);
    if (analytics) {
      logEvent(analytics, "validate_pool_name_failed", {
        error_message:
          "Pool name can only contain letters, numbers, spaces, underscores, hyphens, and .,!?",
        name: trimmedName,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolName - Failure logged to Firebase Analytics");
    }
    return "Pool name can only contain letters, numbers, spaces, underscores, hyphens, and .,!?";
  }

  console.log("validatePoolName - Pool name valid:", trimmedName);
  if (analytics) {
    logEvent(analytics, "validate_pool_name_success", {
      name: trimmedName,
      nameLength: trimmedName.length,
      timestamp: new Date().toISOString(),
    });
    console.log("validatePoolName - Success logged to Firebase Analytics");
  }

  return null;
}

/**
 * Validates a buy-in amount:
 * - Required
 * - Must be a positive number or "Donations only"
 * @param {string} amount
 * @returns {string|null}
 */
export function validateBuyInAmount(amount) {
  if (typeof amount !== "string") {
    console.error("validateBuyInAmount - Invalid buy-in amount type:", typeof amount);
    if (analytics) {
      logEvent(analytics, "validate_buy_in_amount_failed", {
        error_message: "Buy-in amount must be a string.",
        amount,
        timestamp: new Date().toISOString(),
      });
      console.log("validateBuyInAmount - Failure logged to Firebase Analytics");
    }
    return "Buy-in amount must be a string.";
  }

  const trimmedAmount = amount.trim();
  if (!trimmedAmount) {
    console.warn("validateBuyInAmount - Buy-in amount is required:", trimmedAmount);
    if (analytics) {
      logEvent(analytics, "validate_buy_in_amount_failed", {
        error_message: "Buy-in amount or 'Donations only' is required.",
        amount: trimmedAmount,
        timestamp: new Date().toISOString(),
      });
      console.log("validateBuyInAmount - Failure logged to Firebase Analytics");
    }
    return "Buy-in amount or 'Donations only' is required.";
  }

  if (trimmedAmount.toLowerCase() === "donations only") {
    console.log("validateBuyInAmount - Donations only, valid:", trimmedAmount);
    if (analytics) {
      logEvent(analytics, "validate_buy_in_amount_success", {
        amount: trimmedAmount,
        timestamp: new Date().toISOString(),
      });
      console.log("validateBuyInAmount - Success logged to Firebase Analytics");
    }
    return null;
  }

  const parsed = parseFloat(trimmedAmount);
  const isValid = !isNaN(parsed) && parsed >= 0;
  console.log("validateBuyInAmount - Amount:", trimmedAmount, "Valid:", isValid);

  if (isValid) {
    if (analytics) {
      logEvent(analytics, "validate_buy_in_amount_success", {
        amount: trimmedAmount,
        parsedAmount: parsed,
        timestamp: new Date().toISOString(),
      });
      console.log("validateBuyInAmount - Success logged to Firebase Analytics");
    }
    return null;
  } else {
    if (analytics) {
      logEvent(analytics, "validate_buy_in_amount_failed", {
        error_message: "Buy-in amount must be a positive number or 'Donations only'.",
        amount: trimmedAmount,
        timestamp: new Date().toISOString(),
      });
      console.log("validateBuyInAmount - Failure logged to Firebase Analytics");
    }
    return "Buy-in amount must be a positive number or 'Donations only'.";
  }
}

/**
 * Validates an invite code:
 * - Required
 * - Must be 6 alphanumeric characters
 * @param {string} code
 * @returns {string|null}
 */
export function validateInviteCode(code) {
  if (typeof code !== "string") {
    console.error("validateInviteCode - Invalid invite code type:", typeof code);
    if (analytics) {
      logEvent(analytics, "validate_invite_code_failed", {
        error_message: "Invite code must be a string.",
        code,
        timestamp: new Date().toISOString(),
      });
      console.log("validateInviteCode - Failure logged to Firebase Analytics");
    }
    return "Invite code must be a string.";
  }

  const trimmedCode = code.trim();
  if (!trimmedCode) {
    console.warn("validateInviteCode - Invite code is required:", trimmedCode);
    if (analytics) {
      logEvent(analytics, "validate_invite_code_failed", {
        error_message: "Invite code is required.",
        code: trimmedCode,
        timestamp: new Date().toISOString(),
      });
      console.log("validateInviteCode - Failure logged to Firebase Analytics");
    }
    return "Invite code is required.";
  }

  const re = /^[A-Z0-9]{6}$/;
  const isValid = re.test(trimmedCode.toUpperCase());
  console.log("validateInviteCode - Code:", trimmedCode, "Valid:", isValid);

  if (isValid) {
    if (analytics) {
      logEvent(analytics, "validate_invite_code_success", {
        code: trimmedCode,
        timestamp: new Date().toISOString(),
      });
      console.log("validateInviteCode - Success logged to Firebase Analytics");
    }
    return null;
  } else {
    if (analytics) {
      logEvent(analytics, "validate_invite_code_failed", {
        error_message: "Invite code must be 6 alphanumeric characters.",
        code: trimmedCode,
        timestamp: new Date().toISOString(),
      });
      console.log("validateInviteCode - Failure logged to Firebase Analytics");
    }
    return "Invite code must be 6 alphanumeric characters.";
  }
}

/**
 * Validates a payout structure for Square Pools:
 * - Percentages for Q1, Q2, Q3, and Final must total 100%
 * @param {{ q1: number, q2: number, q3: number, final: number }} structure
 * @returns {string|null}
 */
export function validatePayoutStructure(structure) {
  if (!structure || typeof structure !== "object") {
    console.error("validatePayoutStructure - Invalid structure:", structure);
    if (analytics) {
      logEvent(analytics, "validate_payout_structure_failed", {
        error_message: "Payout structure is required and must be an object.",
        structure,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePayoutStructure - Failure logged to Firebase Analytics");
    }
    return "Payout structure is required and must be an object.";
  }

  const { q1, q2, q3, final } = structure;
  if (
    q1 == null ||
    q2 == null ||
    q3 == null ||
    final == null ||
    typeof q1 !== "number" ||
    typeof q2 !== "number" ||
    typeof q3 !== "number" ||
    typeof final !== "number"
  ) {
    console.warn("validatePayoutStructure - Missing or invalid fields:", structure);
    if (analytics) {
      logEvent(analytics, "validate_payout_structure_failed", {
        error_message: "Payout structure must include Q1, Q2, Q3, and Final percentages as numbers.",
        structure,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePayoutStructure - Failure logged to Firebase Analytics");
    }
    return "Payout structure must include Q1, Q2, Q3, and Final percentages as numbers.";
  }

  const total = (parseFloat(q1) + parseFloat(q2) + parseFloat(q3) + parseFloat(final)) * 100;
  const isValid = Math.abs(total - 100) <= 1; // Allow small rounding errors
  console.log("validatePayoutStructure - Total percentage:", total, "Valid:", isValid);

  if (isValid) {
    if (analytics) {
      logEvent(analytics, "validate_payout_structure_success", {
        structure,
        totalPercentage: total,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePayoutStructure - Success logged to Firebase Analytics");
    }
    return null;
  } else {
    if (analytics) {
      logEvent(analytics, "validate_payout_structure_failed", {
        error_message: "Payout percentages must total 100%.",
        totalPercentage: total,
        structure,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePayoutStructure - Failure logged to Firebase Analytics");
    }
    return "Payout percentages must total 100%.";
  }
}

/**
 * Validates pool settings for Square Pools or Strip Cards:
 * - Total pot must be non-negative
 * - Number of strip cards must be between 1 and 20 (if applicable)
 * @param {{ totalPot: number|string, stripCardCount?: number, format: string }} settings
 * @returns {string|null}
 */
export function validatePoolSettings(settings) {
  if (!settings || typeof settings !== "object") {
    console.error("validatePoolSettings - Invalid settings:", settings);
    if (analytics) {
      logEvent(analytics, "validate_pool_settings_failed", {
        error_message: "Pool settings are required and must be an object.",
        settings,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolSettings - Failure logged to Firebase Analytics");
    }
    return "Pool settings are required and must be an object.";
  }

  const { totalPot, stripCardCount, format } = settings;

  // Validate format
  if (typeof format !== "string" || !["squares", "strip_cards"].includes(format)) {
    console.warn("validatePoolSettings - Invalid format:", format);
    if (analytics) {
      logEvent(analytics, "validate_pool_settings_failed", {
        error_message: "Format must be 'squares' or 'strip_cards'.",
        format,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolSettings - Failure logged to Firebase Analytics");
    }
    return "Format must be 'squares' or 'strip_cards'.";
  }

  // Validate total pot
  const parsedPot = typeof totalPot === "string" ? parseFloat(totalPot) : totalPot;
  if (typeof parsedPot !== "number" || isNaN(parsedPot) || parsedPot < 0) {
    console.warn("validatePoolSettings - Invalid total pot:", totalPot);
    if (analytics) {
      logEvent(analytics, "validate_pool_settings_failed", {
        error_message: "Total pot must be a non-negative number.",
        totalPot,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolSettings - Failure logged to Firebase Analytics");
    }
    return "Total pot must be a non-negative number.";
  }

  // Validate strip card count if format is strip_cards
  if (format === "strip_cards") {
    const parsedCount =
      typeof stripCardCount === "string" ? parseInt(stripCardCount, 10) : stripCardCount;
    if (typeof parsedCount !== "number" || isNaN(parsedCount) || parsedCount < 1 || parsedCount > 20) {
      console.warn("validatePoolSettings - Invalid strip card count:", stripCardCount);
      if (analytics) {
        logEvent(analytics, "validate_pool_settings_failed", {
          error_message: "Number of strip cards must be between 1 and 20.",
          stripCardCount,
          timestamp: new Date().toISOString(),
        });
        console.log("validatePoolSettings - Failure logged to Firebase Analytics");
      }
      return "Number of strip cards must be between 1 and 20.";
    }
  }

  console.log("validatePoolSettings - Settings valid:", settings);
  if (analytics) {
    logEvent(analytics, "validate_pool_settings_success", {
      settings,
      timestamp: new Date().toISOString(),
    });
    console.log("validatePoolSettings - Success logged to Firebase Analytics");
  }

  return null;
}

/**
 * Validates a score input for Square Pools:
 * - Must be a non-negative integer
 * @param {string|number} score
 * @returns {string|null}
 */
export function validateScoreInput(score) {
  const parsedScore = typeof score === "string" ? parseInt(score, 10) : score;
  const isValid = typeof parsedScore === "number" && !isNaN(parsedScore) && parsedScore >= 0;
  console.log("validateScoreInput - Score:", score, "Valid:", isValid);

  if (isValid) {
    if (analytics) {
      logEvent(analytics, "validate_score_input_success", {
        score: parsedScore,
        timestamp: new Date().toISOString(),
      });
      console.log("validateScoreInput - Success logged to Firebase Analytics");
    }
    return null;
  } else {
    if (analytics) {
      logEvent(analytics, "validate_score_input_failed", {
        error_message: "Score must be a non-negative integer.",
        score,
        timestamp: new Date().toISOString(),
      });
      console.log("validateScoreInput - Failure logged to Firebase Analytics");
    }
    return "Score must be a non-negative integer.";
  }
}

/**
 * Validates a matchup object for pool management:
 * - Must include gameId, homeTeam, awayTeam, startTime, and status
 * - gameId: string, ≤50 characters
 * - homeTeam: string, ≤100 characters
 * - awayTeam: string, ≤100 characters
 * - startTime: string, ≤50 characters
 * - status: must be 'pending' or 'completed'
 * @param {{ gameId: string, homeTeam: string, awayTeam: string, startTime: string, status: string }} matchup
 * @returns {string|null}
 */
export function validateMatchup(matchup) {
  if (!matchup || typeof matchup !== "object") {
    console.error("validateMatchup - Invalid matchup:", matchup);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "Matchup is required and must be an object.",
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "Matchup is required and must be an object.";
  }

  const { gameId, homeTeam, awayTeam, startTime, status } = matchup;

  if (!gameId || !homeTeam || !awayTeam || !startTime || !status) {
    console.warn("validateMatchup - Missing required fields:", matchup);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "Matchup must include gameId, homeTeam, awayTeam, startTime, and status.",
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "Matchup must include gameId, homeTeam, awayTeam, startTime, and status.";
  }

  if (typeof gameId !== "string" || gameId.length > 50) {
    console.warn("validateMatchup - Invalid gameId:", gameId);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "gameId must be a string with 50 or fewer characters.",
        gameId,
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "gameId must be a string with 50 or fewer characters.";
  }

  if (typeof homeTeam !== "string" || homeTeam.length > 100) {
    console.warn("validateMatchup - Invalid homeTeam:", homeTeam);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "homeTeam must be a string with 100 or fewer characters.",
        homeTeam,
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "homeTeam must be a string with 100 or fewer characters.";
  }

  if (typeof awayTeam !== "string" || awayTeam.length > 100) {
    console.warn("validateMatchup - Invalid awayTeam:", awayTeam);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "awayTeam must be a string with 100 or fewer characters.",
        awayTeam,
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "awayTeam must be a string with 100 or fewer characters.";
  }

  if (typeof startTime !== "string" || startTime.length > 50) {
    console.warn("validateMatchup - Invalid startTime:", startTime);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "startTime must be a string with 50 or fewer characters.",
        startTime,
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "startTime must be a string with 50 or fewer characters.";
  }

  if (typeof status !== "string" || !["pending", "completed"].includes(status)) {
    console.warn("validateMatchup - Invalid status:", status);
    if (analytics) {
      logEvent(analytics, "validate_matchup_failed", {
        error_message: "status must be 'pending' or 'completed'.",
        status,
        matchup,
        timestamp: new Date().toISOString(),
      });
      console.log("validateMatchup - Failure logged to Firebase Analytics");
    }
    return "status must be 'pending' or 'completed'.";
  }

  console.log("validateMatchup - Matchup valid:", matchup);
  if (analytics) {
    logEvent(analytics, "validate_matchup_success", {
      matchup,
      timestamp: new Date().toISOString(),
    });
    console.log("validateMatchup - Success logged to Firebase Analytics");
  }

  return null;
}

/**
 * Validates a pool deadline:
 * - Must not be empty
 * - Must parse as a valid date
 * - Must be in the future (compared to current time)
 * @param {string} deadline - Typically an ISO string (or a local date/time string).
 * @returns {string|null} - Error message if invalid, null if valid
 */
export function validatePoolDeadline(deadline) {
  if (typeof deadline !== "string") {
    console.error("validatePoolDeadline - Invalid deadline type:", typeof deadline);
    if (analytics) {
      logEvent(analytics, "validate_pool_deadline_failed", {
        error_message: "Deadline must be a string (ISO or date/time).",
        deadline,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolDeadline - Failure logged to Firebase Analytics");
    }
    return "Deadline must be a valid date/time string.";
  }

  const trimmed = deadline.trim();
  if (!trimmed) {
    console.warn("validatePoolDeadline - Deadline is required:", trimmed);
    if (analytics) {
      logEvent(analytics, "validate_pool_deadline_failed", {
        error_message: "Deadline is required.",
        deadline: trimmed,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolDeadline - Failure logged to Firebase Analytics");
    }
    return "Deadline is required.";
  }

  // Attempt to parse date
  const dateValue = new Date(trimmed);
  if (isNaN(dateValue.getTime())) {
    console.warn("validatePoolDeadline - Invalid date format:", trimmed);
    if (analytics) {
      logEvent(analytics, "validate_pool_deadline_failed", {
        error_message: "Deadline must be a valid date/time.",
        deadline: trimmed,
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolDeadline - Failure logged to Firebase Analytics");
    }
    return "Deadline must be a valid date/time.";
  }

  // Must be in the future
  const now = new Date();
  if (dateValue <= now) {
    console.warn("validatePoolDeadline - Deadline is not in the future:", dateValue);
    if (analytics) {
      logEvent(analytics, "validate_pool_deadline_failed", {
        error_message: "Deadline must be in the future.",
        deadline: dateValue.toISOString(),
        timestamp: new Date().toISOString(),
      });
      console.log("validatePoolDeadline - Failure logged to Firebase Analytics");
    }
    return "Deadline must be in the future.";
  }

  console.log("validatePoolDeadline - Deadline valid:", dateValue.toISOString());
  if (analytics) {
    logEvent(analytics, "validate_pool_deadline_success", {
      deadline: dateValue.toISOString(),
      timestamp: new Date().toISOString(),
    });
    console.log("validatePoolDeadline - Success logged to Firebase Analytics");
  }
  return null;
}
