import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Box,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

import { getDb } from "../../../firebase/config";
import { logEvent } from "firebase/analytics";

// Helper function if you need to shuffle digits again
import { shuffleArray } from "../../../utils/helpers";

/**
 * CommissionerExtraToolsSection
 * 
 * Combines three features in one card:
 * 1. Offline user management
 * 2. Lock pool
 * 3. Special logic (start date or grid size)
 *
 * Props:
 * - user: the current logged-in user
 * - poolId: Firestore doc ID
 * - poolData: object containing format, status, etc.
 * - analytics: optional analytics instance
 */
export default function CommissionerExtraToolsSection({ user, poolId, poolData, analytics }) {
  // 1) Declare all Hooks at top level.
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [offlineName, setOfflineName] = useState("");
  const [addingOffline, setAddingOffline] = useState(false);

  // For locking the pool
  const [locking, setLocking] = useState(false);

  // Example: special logic for “start date” or “grid size”
  const [startDate, setStartDate] = useState(poolData?.startDate || "");
  const [gridSize, setGridSize] = useState(poolData?.gridSize || 100);
  const [savingSpecial, setSavingSpecial] = useState(false);

  // Access Firestore
  const db = getDb();

  // Reset messages when the pool changes
  useEffect(() => {
    setError("");
    setSuccessMessage("");
  }, [poolId]);

  // 2) Check if user is commissioner (AFTER we have defined hooks).
  const isCommissioner = poolData?.commissionerId === user?.uid;
  if (!isCommissioner) {
    return null;
  }

  /**
   * handleAddOfflineUser:
   * Adds a "pseudo" user ID to `memberIds` and maybe an `offlineUsers` array. 
   */
  const handleAddOfflineUser = async () => {
    if (!offlineName.trim()) {
      setError("Offline user name is required.");
      return;
    }
    setError("");
    setSuccessMessage("");
    setAddingOffline(true);

    try {
      // Make up an ID
      const pseudoId = "offline_" + Date.now();

      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, {
        memberIds: arrayUnion(pseudoId),
        offlineUsers: arrayUnion({ id: pseudoId, name: offlineName.trim() }),
      });
      setSuccessMessage(`Offline user "${offlineName}" added successfully!`);
      setOfflineName("");

      if (analytics) {
        logEvent(analytics, "add_offline_user", {
          userId: user.uid,
          poolId,
          offlineUserId: pseudoId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleAddOfflineUser - Error:", err);
      setError(err.message || "Failed to add offline user.");
      if (analytics) {
        logEvent(analytics, "add_offline_user_failed", {
          userId: user.uid,
          poolId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setAddingOffline(false);
    }
  };

  /**
   * handleLockPool:
   *  - Sets poolData.status = "locked".
   *  - Optionally reassign digits if squares, or do final strip assignments, etc.
   */
  const handleLockPool = async () => {
    if (poolData.status === "locked") {
      setError("Pool is already locked.");
      return;
    }
    setError("");
    setSuccessMessage("");
    setLocking(true);

    try {
      const poolRef = doc(db, "pools", poolId);
      const updates = { status: "locked" };

      // Example: if squares and digits not assigned, do it now
      if (poolData.format === "squares" && !poolData.axisNumbers) {
        const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        updates.axisNumbers = {
          x: shuffleArray(digits.slice()),
          y: shuffleArray(digits.slice()),
        };
      }

      // Example: if strip_cards and numbers not assigned, do it now
      if (poolData.format === "strip_cards" && !poolData.stripNumbers) {
        const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        updates.stripNumbers = shuffleArray(digits);
      }

      await updateDoc(poolRef, updates);
      setSuccessMessage("Pool locked successfully!");
      if (analytics) {
        logEvent(analytics, "lock_pool", {
          userId: user.uid,
          poolId,
          format: poolData.format,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleLockPool - Error:", err);
      setError(err.message || "Failed to lock pool.");
      if (analytics) {
        logEvent(analytics, "lock_pool_failed", {
          userId: user.uid,
          poolId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setLocking(false);
    }
  };

  /**
   * handleSaveSpecial:
   * For an example “start date” or “grid size” setting.
   */
  const handleSaveSpecial = async () => {
    setError("");
    setSuccessMessage("");
    setSavingSpecial(true);

    try {
      const poolRef = doc(db, "pools", poolId);
      const updates = {};

      // If you want to store startDate as a string or a Firestore Timestamp
      // For demonstration, let’s store as string:
      updates.startDate = startDate || "";

      // gridSize is an integer for squares or something
      updates.gridSize = parseInt(gridSize, 10);

      await updateDoc(poolRef, updates);
      setSuccessMessage("Special settings updated successfully!");

      if (analytics) {
        logEvent(analytics, "update_special_settings", {
          userId: user.uid,
          poolId,
          startDate,
          gridSize,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleSaveSpecial - Error:", err);
      setError(err.message || "Failed to update special settings.");
    } finally {
      setSavingSpecial(false);
    }
  };

  return (
    <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Extra Commissioner Tools
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

        {/* --- Offline User Management --- */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
            Add Offline User
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              label="Offline User Name"
              placeholder='e.g. "Bob’s Dad"'
              value={offlineName}
              onChange={(e) => setOfflineName(e.target.value)}
              size="small"
            />
            <Button
              variant="contained"
              onClick={handleAddOfflineUser}
              disabled={addingOffline}
              aria-label="Add offline user"
            >
              {addingOffline ? "Adding..." : "Add Offline User"}
            </Button>
          </Stack>
        </Box>

        {/* --- Lock Pool --- */}
        {poolData.status !== "locked" ? (
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
              Lock Pool
            </Typography>
            <Button
              variant="contained"
              onClick={handleLockPool}
              disabled={locking}
              aria-label="Lock this pool"
            >
              {locking ? "Locking..." : "Lock Pool & Reveal"}
            </Button>
          </Box>
        ) : (
          <Alert severity="info" sx={{ mb: 4 }}>
            Pool is already locked.
          </Alert>
        )}

        {/* --- Special "Start Date" or "Grid Size" example --- */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
            Special Settings
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
            <TextField
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              size="small"
              sx={{ minWidth: 200 }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Grid Size"
              type="number"
              value={gridSize}
              onChange={(e) => setGridSize(e.target.value)}
              size="small"
              sx={{ minWidth: 120 }}
            />
            <Button
              variant="contained"
              onClick={handleSaveSpecial}
              disabled={savingSpecial}
              aria-label="Save special settings"
            >
              {savingSpecial ? "Saving..." : "Save Settings"}
            </Button>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
