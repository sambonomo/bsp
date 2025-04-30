// /src/pages/Commissioner/sections/CommissionerPotSection.js

import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Box, Card, CardContent, Typography, Stack, TextField, Button, Alert } from "@mui/material";

import { getDb } from "../../../firebase/config";
import { logEvent } from "firebase/analytics";

// Validations you already have in ../utils/validations (adjust path as needed)
import { validateBuyInAmount, validatePayoutStructure } from "../../../utils/validations";

/**
 * CommissionerPotSection:
 * Manages the pool's total pot and payout structure (Q1, Q2, Q3, Final).
 *
 * Props:
 * - user: the current logged-in user object (so we can check if commissioner)
 * - poolId: string (Firestore document ID for this pool)
 * - poolData: the pool object from Firestore (must contain commissionerId, totalPot, payoutStructure, etc.)
 */
export default function CommissionerPotSection({ user, poolId, poolData }) {
  // Check if user is the commissioner
  const isCommissioner = poolData?.commissionerId === user?.uid;

  // Local state for errors and success messages
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Local state for total pot (default to string form)
  const [totalPot, setTotalPot] = useState(
    poolData?.totalPot ? String(poolData.totalPot) : ""
  );

  // Local state for payout structure
  // If no payoutStructure in doc, default to { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 }
  const initialPayout = poolData?.payoutStructure || { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 };
  const [q1, setQ1] = useState(initialPayout.q1);
  const [q2, setQ2] = useState(initialPayout.q2);
  const [q3, setQ3] = useState(initialPayout.q3);
  const [finalQ, setFinalQ] = useState(initialPayout.final);

  // Firestore reference
  const db = getDb();

  // If not commissioner, hide this entire section
  if (!isCommissioner) {
    return null;
  }

  // Clears error/success upon mounting or if pool changes
  useEffect(() => {
    setError("");
    setSuccessMessage("");
  }, [poolId]);

  /**
   * handleUpdateTotalPot
   * Validates the `totalPot` input, then updates the pool doc in Firestore.
   */
  const handleUpdateTotalPot = async () => {
    setError("");
    setSuccessMessage("");

    // 1) Validate
    const validationError = validateBuyInAmount(totalPot);
    if (validationError) {
      setError(validationError);
      return;
    }

    // 2) Parse (if numeric) or keep 'Donations only'
    let parsedPot = totalPot.trim();
    if (parsedPot.toLowerCase() !== "donations only") {
      parsedPot = parseFloat(parsedPot);
    }

    try {
      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, { totalPot: parsedPot });
      setSuccessMessage("Total pot updated successfully!");
      // You can log an analytics event here if you want
      // e.g.: logEvent(analytics, "update_total_pot", {...})
    } catch (err) {
      console.error("handleUpdateTotalPot - Error:", err);
      setError(err.message || "Failed to update total pot.");
    }
  };

  /**
   * handleUpdatePayouts
   * Validates Q1/Q2/Q3/Final, then updates `payoutStructure` in Firestore.
   */
  const handleUpdatePayouts = async () => {
    setError("");
    setSuccessMessage("");

    // Build an object from the four fields
    const structure = {
      q1: parseFloat(q1),
      q2: parseFloat(q2),
      q3: parseFloat(q3),
      final: parseFloat(finalQ),
    };

    // Validate
    const validationError = validatePayoutStructure(structure);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, { payoutStructure: structure });
      setSuccessMessage("Payout structure updated successfully!");
      // You can log an analytics event here if you want
      // e.g.: logEvent(analytics, "update_payout_structure", {...})
    } catch (err) {
      console.error("handleUpdatePayouts - Error:", err);
      setError(err.message || "Failed to update payout structure.");
    }
  };

  return (
    <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Pot & Payouts
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

        {/* TOTAL POT SETTINGS */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Total Pot
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              label="Total Pot"
              placeholder='e.g. "100" or "Donations only"'
              value={totalPot}
              onChange={(e) => setTotalPot(e.target.value)}
              size="small"
              sx={{ width: 200 }}
              inputProps={{ "aria-label": "Enter total pot amount" }}
            />
            <Button variant="contained" onClick={handleUpdateTotalPot}>
              Update Pot
            </Button>
          </Stack>
        </Box>

        {/* PAYOUT STRUCTURE */}
        <Box>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Payout Structure (Decimal or Fraction of 1.0)
          </Typography>
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }} sx={{ mb: 2 }}>
            <TextField
              label="Q1 (%)"
              type="number"
              value={q1}
              onChange={(e) => setQ1(e.target.value)}
              size="small"
              sx={{ width: 100 }}
              inputProps={{ "aria-label": "Enter payout percentage for Q1" }}
            />
            <TextField
              label="Q2 (%)"
              type="number"
              value={q2}
              onChange={(e) => setQ2(e.target.value)}
              size="small"
              sx={{ width: 100 }}
              inputProps={{ "aria-label": "Enter payout percentage for Q2" }}
            />
            <TextField
              label="Q3 (%)"
              type="number"
              value={q3}
              onChange={(e) => setQ3(e.target.value)}
              size="small"
              sx={{ width: 100 }}
              inputProps={{ "aria-label": "Enter payout percentage for Q3" }}
            />
            <TextField
              label="Final (%)"
              type="number"
              value={finalQ}
              onChange={(e) => setFinalQ(e.target.value)}
              size="small"
              sx={{ width: 100 }}
              inputProps={{ "aria-label": "Enter payout percentage for final" }}
            />
          </Stack>
          <Button variant="contained" onClick={handleUpdatePayouts}>
            Update Payouts
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
