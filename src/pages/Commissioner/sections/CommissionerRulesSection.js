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
 * - user: current user
 * - poolId: Firestore doc ID
 * - poolData: the pool object
 * - analytics: optional analytics instance
 */
export default function CommissionerRulesSection({ user, poolId, poolData, analytics }) {
  // 1) Declare Hooks at top level
  const [winCondition, setWinCondition] = useState(
    poolData?.rules?.winCondition || "lastDigit" // squares default
  );
  const [matchRule, setMatchRule] = useState(
    poolData?.rules?.matchRule || "sumLastDigit" // strip_cards default
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);
  const [pickemLoading, setPickemLoading] = useState(false);

  const db = getDb();

  // 2) Clear messages if pool changes
  useEffect(() => {
    setError("");
    setSuccessMessage("");
  }, [poolId]);

  // 3) Check if user is commissioner AFTER Hooks
  const isCommissioner = poolData?.commissionerId === user?.uid;
  if (!isCommissioner) {
    // Hide if user not commissioner
    return null;
  }

  /**
   * handleUpdateRules:
   * Updates the pool doc’s `rules` field with local states.
   */
  const handleUpdateRules = async () => {
    setError("");
    setSuccessMessage("");

    const newRules = {
      // squares
      winCondition,
      // strip_cards
      matchRule,
      // add more as needed
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
   * For squares: shuffle digits 0-9 for each axis, update doc with axisNumbers.
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
      const digits = [0,1,2,3,4,5,6,7,8,9];
      const xAxis = shuffleArray(digits.slice());
      const yAxis = shuffleArray(digits.slice());

      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, { axisNumbers: { x: xAxis, y: yAxis } });
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
   * Calls pickem scoring logic from `calculatePickemScores.js`
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
      await calculatePickemScores(poolId);
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

  // 4) Render UI
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
              <FormLabel component="legend">Win Condition</FormLabel>
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
                />
                <FormControlLabel
                  value="exactScore"
                  control={<Radio />}
                  label="Exact Score Match"
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
              <FormLabel component="legend">Match Rule</FormLabel>
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
                />
                <FormControlLabel
                  value="individualLastDigit"
                  control={<Radio />}
                  label="Individual Last Digit"
                />
              </RadioGroup>
            </FormControl>
          </>
        )}

        {/* PICK'EM POOLS */}
        {poolData.format === "pickem" && (
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
        )}

        {/* If squares or strip_cards, show an "Update Rules" button */}
        {(poolData.format === "squares" || poolData.format === "strip_cards") && (
          <Button variant="contained" onClick={handleUpdateRules} sx={{ mt: 2 }}>
            Update Rules
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
