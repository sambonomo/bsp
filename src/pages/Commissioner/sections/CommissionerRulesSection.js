// /src/pages/Commissioner/sections/CommissionerRulesSection.js

import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Button,
  Alert,
} from "@mui/material";

import { getDb } from "../../../firebase/config";
import { logEvent } from "firebase/analytics";

// Utility for squares digit assignment
import { shuffleArray } from "../../../utils/helpers"; 
// For pick’em scoring
import { calculatePickemScores } from "../../../utils/calculatePickemScores";

/**
 * CommissionerRulesSection:
 * Manages “rules” for squares or strip_cards, plus pick’em scoring or other format-specific actions.
 *
 * Props:
 * - user: current user (to check if they’re commissioner)
 * - poolId: Firestore doc ID
 * - poolData: pool object from Firestore (must contain .format, .rules, etc.)
 * - analytics: optional analytics instance if you want to log from here
 */
export default function CommissionerRulesSection({ user, poolId, poolData, analytics }) {
  const isCommissioner = poolData?.commissionerId === user?.uid;

  // Local states for squares + strip cards rules
  const [winCondition, setWinCondition] = useState(
    poolData?.rules?.winCondition || "lastDigit" // squares default
  );
  const [matchRule, setMatchRule] = useState(
    poolData?.rules?.matchRule || "sumLastDigit" // strip_cards default
  );

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // For the squares reassign step
  const [reassignLoading, setReassignLoading] = useState(false);

  // For pick’em scoring
  const [pickemLoading, setPickemLoading] = useState(false);

  const db = getDb();

  useEffect(() => {
    // Clear any old messages if pool changes
    setError("");
    setSuccessMessage("");
  }, [poolId]);

  if (!isCommissioner) {
    // Hide entirely if user is not commissioner
    return null;
  }

  /**
   * handleUpdateRules:
   * Updates the pool doc’s `rules` field with our local states (winCondition, matchRule).
   */
  const handleUpdateRules = async () => {
    setError("");
    setSuccessMessage("");

    // Build a rules object
    const newRules = {
      // if squares
      winCondition,
      // if strip_cards
      matchRule,
      // can add more fields for pickem, survivor, etc.
    };

    try {
      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, { rules: newRules });
      setSuccessMessage("Rules updated successfully!");
      if (analytics) {
        logEvent(analytics, "update_rules", {
          userId: user.uid,
          poolId,
          rules: newRules,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleUpdateRules - Error:", err);
      setError(err.message || "Failed to update rules.");
      if (analytics) {
        logEvent(analytics, "update_rules_failed", {
          userId: user.uid,
          poolId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  /**
   * handleReassignGridDigits:
   * For squares format, shuffles digits 0-9 for each axis.
   * Then updates the doc with axisNumbers.x and axisNumbers.y.
   */
  const handleReassignGridDigits = async () => {
    if (poolData.format !== "squares") {
      setError("This action is only available for squares pools.");
      return;
    }
    setError("");
    setSuccessMessage("");
    setReassignLoading(true);

    try {
      const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const xAxis = shuffleArray(digits.slice()); // make a copy
      const yAxis = shuffleArray(digits.slice());

      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, {
        axisNumbers: { x: xAxis, y: yAxis },
      });
      setSuccessMessage("Grid digits reassigned successfully!");
      if (analytics) {
        logEvent(analytics, "reassign_grid_digits", {
          userId: user.uid,
          poolId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleReassignGridDigits - Error:", err);
      setError(err.message || "Failed to reassign grid digits.");
      if (analytics) {
        logEvent(analytics, "reassign_grid_digits_failed", {
          userId: user.uid,
          poolId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setReassignLoading(false);
    }
  };

  /**
   * handleComputePickemScores:
   * Calls your existing pickem scoring logic from `calculatePickemScores.js`.
   */
  const handleComputePickemScores = async () => {
    if (poolData.format !== "pickem") {
      setError("This action is only available for pick’em pools.");
      return;
    }
    setError("");
    setSuccessMessage("");
    setPickemLoading(true);

    try {
      await calculatePickemScores(poolId); // This presumably does all Firestore writes
      setSuccessMessage("Pick'em scores computed successfully!");
      if (analytics) {
        logEvent(analytics, "compute_pickem_scores", {
          userId: user.uid,
          poolId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleComputePickemScores - Error:", err);
      setError(err.message || "Failed to compute pick’em scores.");
      if (analytics) {
        logEvent(analytics, "compute_pickem_scores_failed", {
          userId: user.uid,
          poolId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setPickemLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Pool Rules
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} role="alert" aria-live="assertive">
            {successMessage}
          </Alert>
        )}

        {/* SQUARES RULES */}
        {poolData.format === "squares" && (
          <>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Squares - Win Condition
            </Typography>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                Win Condition
              </FormLabel>
              <RadioGroup
                row
                value={winCondition}
                onChange={(e) => setWinCondition(e.target.value)}
                aria-label="Select win condition for squares pool"
              >
                <FormControlLabel
                  value="lastDigit"
                  control={<Radio />}
                  label="Last Digit Match"
                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                />
                <FormControlLabel
                  value="exactScore"
                  control={<Radio />}
                  label="Exact Score Match"
                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                />
              </RadioGroup>
            </FormControl>

            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={handleReassignGridDigits}
                disabled={reassignLoading}
                aria-label="Reassign grid digits for squares"
              >
                {reassignLoading ? "Reassigning..." : "Reassign Grid Digits"}
              </Button>
            </Box>
          </>
        )}

        {/* STRIP CARDS RULES */}
        {poolData.format === "strip_cards" && (
          <>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Strip Cards - Match Rule
            </Typography>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                Match Rule
              </FormLabel>
              <RadioGroup
                row
                value={matchRule}
                onChange={(e) => setMatchRule(e.target.value)}
                aria-label="Select match rule for strip cards pool"
              >
                <FormControlLabel
                  value="sumLastDigit"
                  control={<Radio />}
                  label="Sum Last Digit"
                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                />
                <FormControlLabel
                  value="individualLastDigit"
                  control={<Radio />}
                  label="Individual Last Digit"
                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                />
              </RadioGroup>
            </FormControl>
          </>
        )}

        {/* PICK'EM SCORING */}
        {poolData.format === "pickem" && (
          <>
            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={handleComputePickemScores}
                disabled={pickemLoading}
                aria-label="Compute pick'em scores"
              >
                {pickemLoading ? "Computing..." : "Compute Pick'em Scores"}
              </Button>
            </Box>
          </>
        )}

        {/* FUTURE: Survivor? Additional rules? etc. */}
        {/* e.g. if (poolData.format === "survivor") { ... } */}

        {/* UPDATE RULES BUTTON (applies to squares or strip_cards) */}
        {/* We won't show if pickem is the only logic, or you can keep it for consistency */}
        {(poolData.format === "squares" || poolData.format === "strip_cards") && (
          <Button variant="contained" onClick={handleUpdateRules} sx={{ mt: 2 }}>
            Update Rules
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
