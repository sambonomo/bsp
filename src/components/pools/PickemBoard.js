import React, { useState, useEffect, useRef, useCallback } from "react";
import { getDb, getAnalyticsService } from "../../firebase/config";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  runTransaction,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";

// MUI imports
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Fade,
  CircularProgress,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  styled,
} from "@mui/material";

// Styled components for polished UI
const StyledPaper = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  marginBottom: theme.spacing(2),
  padding: theme.spacing(2),
  transition: theme.transitions.create(["transform", "box-shadow"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    transform: "scale(1.01)",
    boxShadow: theme.shadows[2],
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  fontFamily: "'Poppins', sans-serif",
  fontWeight: 500,
  padding: theme.spacing(1, 2),
  transition: theme.transitions.create(["background-color", "transform"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    transform: "scale(1.05)",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[200],
    color: theme.palette.text.disabled,
  },
}));

function PickemBoard({ poolId }) {
  const { user, authLoading } = useAuth();
  const { theme } = useThemeContext(); // Removed unused 'mode'
  const [matchups, setMatchups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedBoardLoad = useRef(false);
  const db = getDb();

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Retry logic for Firebase operations
  const withRetry = useCallback(async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        if (analytics) {
          logEvent(analytics, "firestore_operation_retry", {
            userId: user?.uid || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`PickemBoard - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [analytics, user?.uid]);

  useEffect(() => {
    if (!poolId) return;

    const fetchMatchups = async () => {
      setLoading(true);
      setError("");
      const matchupsRef = collection(db, "pools", poolId, "matchups");
      const q = query(matchupsRef, orderBy("startTime", "asc"));

      const unsubscribe = await withRetry("Fetch Matchups", () =>
        onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
            setMatchups(data);
            setLoading(false);
            console.log("PickemBoard - Fetched matchups:", data);

            // Log board load (only once)
            if (!hasLoggedBoardLoad.current && analytics) {
              logEvent(analytics, "pickem_board_loaded", {
                poolId,
                userId: user?.uid || "anonymous",
                matchupCount: data.length,
                timestamp: new Date().toISOString(),
              });
              console.log("PickemBoard - Board load logged to Firebase Analytics");
              hasLoggedBoardLoad.current = true;
            }
          },
          (err) => {
            console.error("PickemBoard - Error fetching matchups:", err);
            let userFriendlyError = "Failed to load matchups.";
            if (err.code === "permission-denied") {
              userFriendlyError = "You do not have permission to view matchups for this pool.";
            } else if (err.code === "unavailable") {
              userFriendlyError = "Firestore is currently unavailable. Please try again later.";
            }
            setError(userFriendlyError);
            setLoading(false);
            if (analytics) {
              logEvent(analytics, "fetch_matchups_failed", {
                poolId,
                userId: user?.uid || "anonymous",
                error_message: userFriendlyError,
                timestamp: new Date().toISOString(),
              });
              console.log("PickemBoard - Fetch matchups failure logged to Firebase Analytics");
            }
          }
        )
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
          console.log("PickemBoard - Unsubscribed from matchups updates for poolId:", poolId);
        }
      };
    };

    fetchMatchups();

    // Reset logging flags when poolId or user changes
    hasLoggedBoardLoad.current = false;
  }, [poolId, user?.uid, analytics, db, withRetry]); // Added db and withRetry to dependencies

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading matchups" />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'", mb: 2 }} role="alert" aria-live="assertive">
        {error}
      </Alert>
    );
  }

  if (matchups.length === 0) {
    return (
      <Typography sx={{ fontFamily: "'Poppins', sans-serif'", textAlign: "center" }}>
        No matchups added yet. Please ask your pool commissioner to add matchups.
      </Typography>
    );
  }

  return (
    <Fade in timeout={1000}>
      <Box>
        <Typography
          variant="h5"
          sx={{ fontFamily: "'Montserrat', sans-serif'", fontWeight: 600, mb: 2 }}
        >
          Pick'em Matchups
        </Typography>

        <Box role="list" aria-label="List of pick'em matchups">
          {matchups.map((matchup) => (
            <MatchupItem
              key={matchup.id}
              poolId={poolId}
              matchup={matchup}
              currentUserId={user?.uid}
            />
          ))}
        </Box>
      </Box>
    </Fade>
  );
}

/** Single matchup row */
function MatchupItem({ poolId, matchup, currentUserId }) {
  const [userPick, setUserPick] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingPick, setPendingPick] = useState(null);
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedPick = useRef(false);
  const hasLoggedPickChangeConfirmed = useRef(false);
  const hasLoggedPickChangeCanceled = useRef(false);
  const db = getDb();

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Retry logic for Firebase operations
  const withRetry = useCallback(async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        if (analytics) {
          logEvent(analytics, "firestore_operation_retry", {
            userId: currentUserId || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`MatchupItem - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [analytics, currentUserId]);

  useEffect(() => {
    if (matchup.picks && matchup.picks[currentUserId]) {
      setUserPick(matchup.picks[currentUserId]);
    } else {
      setUserPick("");
    }
    hasLoggedPick.current = false;
    hasLoggedPickChangeConfirmed.current = false;
    hasLoggedPickChangeCanceled.current = false;
  }, [matchup, currentUserId]);

  // Check if the matchup has started
  const startTime = matchup.startTime?.seconds
    ? new Date(matchup.startTime.seconds * 1000)
    : null;
  const hasStarted = startTime ? startTime < new Date() : false;

  const handlePick = async (choice) => {
    if (!currentUserId) {
      setError("Must be logged in to make a pick!");
      return;
    }

    if (hasStarted) {
      setError("This matchup has already started. Picks are locked.");
      return;
    }

    if (userPick && userPick !== choice) {
      setPendingPick(choice);
      setConfirmDialogOpen(true);
      return;
    }

    await savePick(choice);
  };

  const savePick = async (choice) => {
    setSaving(true);
    setError("");

    try {
      const matchupRef = doc(db, "pools", poolId, "matchups", matchup.id);

      // Use a transaction to ensure atomic updates to the picks object
      await withRetry("Save Pick Transaction", () =>
        runTransaction(db, async (transaction) => {
          const matchupDoc = await transaction.get(matchupRef);
          if (!matchupDoc.exists()) {
            throw new Error("Matchup does not exist.");
          }

          const matchupData = matchupDoc.data();
          const picksObj = matchupData.picks || {};
          picksObj[currentUserId] = choice;

          transaction.update(matchupRef, {
            picks: picksObj,
          });
        })
      );

      setUserPick(choice);
      setSuccessMessage(`Successfully picked ${choice === "home" ? matchup.homeTeam : matchup.awayTeam}!`);
      console.log("MatchupItem - Updated pick:", { matchupId: matchup.id, userId: currentUserId, choice });

      // Log pick (only once per save)
      if (!hasLoggedPick.current && analytics) {
        logEvent(analytics, "pickem_pick_made", {
          poolId,
          matchupId: matchup.id,
          userId: currentUserId,
          pick: choice,
          teamPicked: choice === "home" ? matchup.homeTeam : matchup.awayTeam,
          timestamp: new Date().toISOString(),
        });
        console.log("MatchupItem - Pick logged to Firebase Analytics");
        hasLoggedPick.current = true;
      }
    } catch (err) {
      console.error("MatchupItem - Error updating pick:", err);
      let userFriendlyError = err.message || "Failed to save your pick.";
      if (err.message.includes("Matchup does not exist")) {
        userFriendlyError = "This matchup no longer exists.";
      } else if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to make picks in this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "pickem_pick_failed", {
          poolId,
          matchupId: matchup.id,
          userId: currentUserId,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("MatchupItem - Pick failure logged to Firebase Analytics");
      }
    } finally {
      setSaving(false);
      setPendingPick(null);
      setConfirmDialogOpen(false);
    }
  };

  const handleConfirmPickChange = () => {
    if (pendingPick) {
      savePick(pendingPick);
      if (analytics && !hasLoggedPickChangeConfirmed.current) {
        logEvent(analytics, "pickem_pick_change_confirmed", {
          poolId,
          matchupId: matchup.id,
          userId: currentUserId,
          oldPick: userPick,
          newPick: pendingPick,
          timestamp: new Date().toISOString(),
        });
        console.log("MatchupItem - Pick change confirmed logged to Firebase Analytics");
        hasLoggedPickChangeConfirmed.current = true;
      }
    }
  };

  const handleCancelPickChange = () => {
    setConfirmDialogOpen(false);
    setPendingPick(null);
    if (analytics && !hasLoggedPickChangeCanceled.current) {
      logEvent(analytics, "pickem_pick_change_canceled", {
        poolId,
        matchupId: matchup.id,
        userId: currentUserId,
        oldPick: userPick,
        newPick: pendingPick,
        timestamp: new Date().toISOString(),
      });
      console.log("MatchupItem - Pick change canceled logged to Firebase Analytics");
      hasLoggedPickChangeCanceled.current = true;
    }
  };

  // Format match date/time with timezone
  const startTimeFormatted = startTime
    ? startTime.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "TBD";

  return (
    <>
      <StyledPaper variant="outlined" role="listitem">
        <Typography
          sx={{ fontFamily: "'Poppins', sans-serif'", fontWeight: 500, mb: 0.5 }}
        >
          <strong>Week {matchup.week}</strong> – {matchup.awayTeam} @ {matchup.homeTeam}
        </Typography>

        <Typography
          variant="caption"
          display="block"
          sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
        >
          Starts: {startTimeFormatted}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 1, display: "flex", gap: 2 }}>
          <StyledButton
            variant="contained"
            sx={{
              backgroundColor: userPick === "away" ? (theme) => theme.palette.warning.light : (theme) => theme.palette.grey[300],
              color: userPick === "away" ? (theme) => theme.palette.text.primary : (theme) => theme.palette.text.secondary,
              "&:hover": {
                backgroundColor: userPick === "away" ? (theme) => theme.palette.warning.main : (theme) => theme.palette.grey[400],
              },
            }}
            onClick={() => handlePick("away")}
            disabled={hasStarted || saving}
            aria-label={`Pick ${matchup.awayTeam} to win`}
            aria-pressed={userPick === "away"}
          >
            Pick {matchup.awayTeam}
          </StyledButton>

          <StyledButton
            variant="contained"
            sx={{
              backgroundColor: userPick === "home" ? (theme) => theme.palette.warning.light : (theme) => theme.palette.grey[300],
              color: userPick === "home" ? (theme) => theme.palette.text.primary : (theme) => theme.palette.text.secondary,
              "&:hover": {
                backgroundColor: userPick === "home" ? (theme) => theme.palette.warning.main : (theme) => theme.palette.grey[400],
              },
            }}
            onClick={() => handlePick("home")}
            disabled={hasStarted || saving}
            aria-label={`Pick ${matchup.homeTeam} to win`}
            aria-pressed={userPick === "home"}
          >
            Pick {matchup.homeTeam}
          </StyledButton>
        </Box>
      </StyledPaper>

      {/* Confirmation Dialog for Changing Picks */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelPickChange}
        aria-labelledby="confirm-pick-change-title"
        aria-describedby="confirm-pick-change-content"
      >
        <DialogTitle id="confirm-pick-change-title">
          Confirm Pick Change
        </DialogTitle>
        <DialogContent id="confirm-pick-change-content">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            You have already picked {userPick === "home" ? matchup.homeTeam : matchup.awayTeam}. Are you sure you want to change your pick to {pendingPick === "home" ? matchup.homeTeam : matchup.awayTeam}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelPickChange}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel pick change"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmPickChange}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm pick change"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage("")}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="success" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {successMessage}
        </Alert>
      </Snackbar>
    </>
  );
}

export default PickemBoard;