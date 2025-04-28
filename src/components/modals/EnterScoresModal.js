import React, { useState, useEffect, useRef } from "react";
import { doc, updateDoc, onSnapshot, runTransaction } from "firebase/firestore";
import { getDb, getAnalyticsService } from "../../firebase/config"; // Updated imports
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { useNavigate } from "react-router-dom";
import { validateScoreInput } from "../../utils/validations";
import { logEvent } from "firebase/analytics";

// MUI imports
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Fade,
  styled,
  CircularProgress,
  Snackbar,
} from "@mui/material";

// Styled components for polished UI
const StyledDialogTitle = styled(DialogTitle)(({ theme }) => ({
  fontFamily: "'Montserrat', sans-serif'",
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? theme.palette.text.primary : theme.palette.text.primary,
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.background.default : theme.palette.grey[50],
  borderBottom: `1px solid ${theme.palette.divider}`,
  transition: theme.transitions.create("background-color", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.background.default : theme.palette.grey[50],
  color: theme.palette.mode === "dark" ? theme.palette.text.primary : theme.palette.text.primary,
  padding: theme.spacing(3),
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.secondary.main,
  color: theme.palette.secondary.contrastText,
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  padding: theme.spacing(1, 2),
  transition: theme.transitions.create(["background-color", "transform"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    backgroundColor: theme.palette.secondary.light,
    transform: "scale(1.05)",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

const ResetButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.error.main,
  color: theme.palette.error.contrastText,
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  padding: theme.spacing(1, 2),
  transition: theme.transitions.create(["background-color", "transform"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    backgroundColor: theme.palette.error.light,
    transform: "scale(1.05)",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.error.main}`,
    outlineOffset: 2,
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

const WinnerPreview = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[100],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  padding: theme.spacing(2),
  marginTop: theme.spacing(2),
  boxShadow: theme.shadows[2],
  transition: theme.transitions.create("box-shadow", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const StyledTextField = styled(TextField)(({ theme }) => ({
  "& .MuiInputBase-root": {
    fontFamily: "'Poppins', sans-serif'",
  },
  "& .MuiInputLabel-root": {
    fontFamily: "'Poppins', sans-serif'",
  },
  "&:focus-within": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

function EnterScoresModal({ open, onClose, poolId, poolData }) {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localPoolData, setLocalPoolData] = useState(null);
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedModalOpen = useRef(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const hasLoggedResetOpen = useRef(false);
  const hasLoggedConfirmReset = useRef(false);
  const hasLoggedCancelReset = useRef(false);
  const db = getDb(); // Updated to use accessor

  // Local states for scores and team names
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [q1TeamA, setQ1TeamA] = useState("");
  const [q1TeamB, setQ1TeamB] = useState("");
  const [q2TeamA, setQ2TeamA] = useState("");
  const [q2TeamB, setQ2TeamB] = useState("");
  const [q3TeamA, setQ3TeamA] = useState("");
  const [q3TeamB, setQ3TeamB] = useState("");
  const [finalTeamA, setFinalTeamA] = useState("");
  const [finalTeamB, setFinalTeamB] = useState("");
  const [customWinner, setCustomWinner] = useState("");

  // Input validation errors
  const [scoreErrors, setScoreErrors] = useState({
    q1TeamA: "",
    q1TeamB: "",
    q2TeamA: "",
    q2TeamB: "",
    q3TeamA: "",
    q3TeamB: "",
    finalTeamA: "",
    finalTeamB: "",
  });

  // Real-time winner preview states
  const [previewWinners, setPreviewWinners] = useState({});

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Retry logic for Firebase operations
  const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
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
          console.log(`EnterScoresModal - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  // Fetch pool data with real-time updates using onSnapshot
  useEffect(() => {
    if (!poolId || !open) return;

    const setupListener = async () => {
      setLoading(true);
      setError("");
      const poolRef = doc(db, "pools", poolId);

      const unsubscribe = await withRetry("Fetch Pool Data", () =>
        onSnapshot(
          poolRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setLocalPoolData(data);

              // Pre-fill team names if they exist
              setTeamAName(data.teamAName || "");
              setTeamBName(data.teamBName || "");

              // Pre-fill scores if they exist
              if (data.scores) {
                setQ1TeamA(data.scores.q1?.teamA?.toString() ?? "");
                setQ1TeamB(data.scores.q1?.teamB?.toString() ?? "");
                setQ2TeamA(data.scores.q2?.teamA?.toString() ?? "");
                setQ2TeamB(data.scores.q2?.teamB?.toString() ?? "");
                setQ3TeamA(data.scores.q3?.teamA?.toString() ?? "");
                setQ3TeamB(data.scores.q3?.teamB?.toString() ?? "");
                setFinalTeamA(data.scores.final?.teamA?.toString() ?? "");
                setFinalTeamB(data.scores.final?.teamB?.toString() ?? "");
              }

              // Pre-fill custom winner if it exists
              if (data.format === "custom_pool" && data.winners?.final) {
                setCustomWinner(data.winners.final);
              }

              console.log("EnterScoresModal - Live pool data updated:", data);
              setLoading(false);
            } else {
              setError("Pool not found.");
              console.warn("EnterScoresModal - Pool not found:", poolId);
              setLoading(false);
            }
          },
          (err) => {
            console.error("EnterScoresModal - Error fetching pool data:", err);
            setError(err.message || "Failed to fetch pool data.");
            setLoading(false);
            if (analytics) {
              logEvent(analytics, "fetch_pool_data_failed", {
                poolId,
                userId: user?.uid || "anonymous",
                error_message: err.message || "Unknown error",
                timestamp: new Date().toISOString(),
              });
              console.log("EnterScoresModal - Fetch pool data failure logged to Firebase Analytics");
            }
          }
        )
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
          console.log("EnterScoresModal - Unsubscribed from pool data updates");
        }
      };
    };

    setupListener();

    // Log modal open (only once)
    if (open && !hasLoggedModalOpen.current && analytics) {
      logEvent(analytics, "enter_scores_modal_opened", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("EnterScoresModal - Modal open logged to Firebase Analytics");
      hasLoggedModalOpen.current = true;
    }

    // Reset modal open tracking when modal closes
    if (!open) {
      hasLoggedModalOpen.current = false;
    }
  }, [poolId, open, user?.uid, analytics]); // Added user?.uid and analytics

  // Validate scores on change and update preview winners
  useEffect(() => {
    if (!localPoolData || loading) return;

    const newScoreErrors = {
      q1TeamA: q1TeamA !== "" ? validateScoreInput(q1TeamA) || "" : "",
      q1TeamB: q1TeamB !== "" ? validateScoreInput(q1TeamB) || "" : "",
      q2TeamA: q2TeamA !== "" ? validateScoreInput(q2TeamA) || "" : "",
      q2TeamB: q2TeamB !== "" ? validateScoreInput(q2TeamB) || "" : "",
      q3TeamA: q3TeamA !== "" ? validateScoreInput(q3TeamA) || "" : "",
      q3TeamB: q3TeamB !== "" ? validateScoreInput(q3TeamB) || "" : "",
      finalTeamA: finalTeamA !== "" ? validateScoreInput(finalTeamA) || "" : "",
      finalTeamB: finalTeamB !== "" ? validateScoreInput(finalTeamB) || "" : "",
    };
    setScoreErrors(newScoreErrors);

    const updatedWinners = {
      q1: q1TeamA !== "" && q1TeamB !== "" ? getWinnerForFormat(localPoolData, parseInt(q1TeamA) || 0, parseInt(q1TeamB) || 0) : null,
      q2: q2TeamA !== "" && q2TeamB !== "" ? getWinnerForFormat(localPoolData, parseInt(q2TeamA) || 0, parseInt(q2TeamB) || 0) : null,
      q3: q3TeamA !== "" && q3TeamB !== "" ? getWinnerForFormat(localPoolData, parseInt(q3TeamA) || 0, parseInt(q3TeamB) || 0) : null,
      final: finalTeamA !== "" && finalTeamB !== "" ? getWinnerForFormat(localPoolData, parseInt(finalTeamA) || 0, parseInt(finalTeamB) || 0) : null,
    };

    setPreviewWinners(updatedWinners);
    console.log("EnterScoresModal - Updated preview winners:", updatedWinners);
  }, [q1TeamA, q1TeamB, q2TeamA, q2TeamB, q3TeamA, q3TeamB, finalTeamA, finalTeamB, localPoolData, loading, poolId]); // Added poolId

  // Handle custom winner selection
  const handleCustomWinnerChange = (e) => {
    setCustomWinner(e.target.value);
    if (analytics) {
      logEvent(analytics, "custom_winner_selected", {
        poolId,
        userId: user?.uid || "anonymous",
        winner: e.target.value,
        timestamp: new Date().toISOString(),
      });
      console.log("EnterScoresModal - Custom winner selection logged to Firebase Analytics");
    }
  };

  // Check if user is commissioner
  const isCommissioner = localPoolData?.commissionerId === user?.uid;

  // Open confirmation dialog for resetting scores
  const handleOpenResetDialog = () => {
    setConfirmResetOpen(true);
    if (!hasLoggedResetOpen.current && analytics) {
      logEvent(analytics, "reset_scores_dialog_opened", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("EnterScoresModal - Reset scores dialog opened logged to Firebase Analytics");
      hasLoggedResetOpen.current = true;
    }
  };

  // Handle resetting scores
  const handleConfirmReset = async () => {
    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);

      await withRetry("Reset Scores Transaction", () =>
        runTransaction(db, async (transaction) => {
          const poolDoc = await transaction.get(poolRef);
          if (!poolDoc.exists()) {
            throw new Error("Pool does not exist.");
          }

          const poolData = poolDoc.data();

          // Reset scores and winners
          transaction.update(poolRef, {
            scores: {
              q1: { teamA: null, teamB: null },
              q2: { teamA: null, teamB: null },
              q3: { teamA: null, teamB: null },
              final: { teamA: null, teamB: null },
            },
            winners: poolData.format === "custom_pool" ? {} : { q1: null, q2: null, q3: null, final: null },
          });
        })
      );

      // Reset local state
      setQ1TeamA("");
      setQ1TeamB("");
      setQ2TeamA("");
      setQ2TeamB("");
      setQ3TeamA("");
      setQ3TeamB("");
      setFinalTeamA("");
      setFinalTeamB("");
      setCustomWinner("");
      setPreviewWinners({});

      console.log("EnterScoresModal - Scores and winners reset");
      if (analytics) {
        logEvent(analytics, "reset_scores_success", {
          userId: user?.uid,
          poolId,
          timestamp: new Date().toISOString(),
        });
        console.log("EnterScoresModal - Reset scores success logged to Firebase Analytics");
      }

      setConfirmResetOpen(false);
      if (!hasLoggedConfirmReset.current && analytics) {
        logEvent(analytics, "confirm_reset_scores", {
          userId: user?.uid || "anonymous",
          poolId,
          timestamp: new Date().toISOString(),
        });
        console.log("EnterScoresModal - Confirm reset scores logged to Firebase Analytics");
        hasLoggedConfirmReset.current = true;
      }
    } catch (err) {
      console.error("EnterScoresModal - Error resetting scores:", err);
      let userFriendlyError = err.message || "Failed to reset scores.";
      if (err.message.includes("Pool does not exist")) {
        userFriendlyError = "This pool no longer exists.";
      } else if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to reset scores for this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      } else if (err.code === "not-found") {
        userFriendlyError = "This pool no longer exists.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "reset_scores_failure", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("EnterScoresModal - Reset scores failure logged to Firebase Analytics");
      }
      setConfirmResetOpen(false);
    }
  };

  // Handle canceling the reset
  const handleCancelReset = () => {
    setConfirmResetOpen(false);
    if (!hasLoggedCancelReset.current && analytics) {
      logEvent(analytics, "cancel_reset_scores", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("EnterScoresModal - Cancel reset scores logged to Firebase Analytics");
      hasLoggedCancelReset.current = true;
    }
  };

  // Reset analytics logging flags when modal closes or user/poolId changes
  useEffect(() => {
    if (!open) {
      hasLoggedResetOpen.current = false;
      hasLoggedConfirmReset.current = false;
      hasLoggedCancelReset.current = false;
    }
  }, [open, user?.uid, poolId]);

  async function handleSaveScores() {
    if (!localPoolData) {
      setError("Pool data not available.");
      console.warn("handleSaveScores - Missing pool data");
      return;
    }
    if (!isCommissioner) {
      setError("Only the commissioner can update scores.");
      console.warn("handleSaveScores - User is not commissioner:", user?.uid);
      return;
    }

    // Validate entered scores
    const scoresToValidate = [
      { value: q1TeamA, key: "q1TeamA" },
      { value: q1TeamB, key: "q1TeamB" },
      { value: q2TeamA, key: "q2TeamA" },
      { value: q2TeamB, key: "q2TeamB" },
      { value: q3TeamA, key: "q3TeamA" },
      { value: q3TeamB, key: "q3TeamB" },
      { value: finalTeamA, key: "finalTeamA" },
      { value: finalTeamB, key: "finalTeamB" },
    ];
    const newScoreErrors = { ...scoreErrors };
    let hasValidationError = false;

    scoresToValidate.forEach(({ value, key }) => {
      if (value !== "") {
        const validationError = validateScoreInput(value);
        newScoreErrors[key] = validationError || "";
        if (validationError) hasValidationError = true;
      } else {
        newScoreErrors[key] = "";
      }
    });

    // For "squares" and "strip_cards", ensure final scores are entered
    if (localPoolData.format === "squares" || localPoolData.format === "strip_cards") {
      if (finalTeamA === "" || finalTeamB === "") {
        setError("Final scores are required for this pool format.");
        if (finalTeamA === "") newScoreErrors.finalTeamA = "Final score is required.";
        if (finalTeamB === "") newScoreErrors.finalTeamB = "Final score is required.";
        setScoreErrors(newScoreErrors);
        console.warn("handleSaveScores - Missing final scores:", { finalTeamA, finalTeamB });
        return;
      }
    }

    setScoreErrors(newScoreErrors);
    if (hasValidationError) {
      setError("Please correct the score input errors.");
      console.warn("handleSaveScores - Validation errors:", newScoreErrors);
      return;
    }

    // Validate team names
    if (!teamAName.trim() || !teamBName.trim()) {
      setError("Team names are required.");
      console.warn("handleSaveScores - Missing team names:", { teamAName, teamBName });
      return;
    }

    try {
      setError("");
      setSaving(true);
      const poolRef = doc(db, "pools", poolId);

      await withRetry("Save Scores Transaction", () =>
        runTransaction(db, async (transaction) => {
          const poolDoc = await transaction.get(poolRef);
          if (!poolDoc.exists()) {
            throw new Error("Pool does not exist.");
          }

          const poolData = poolDoc.data();

          // Build updated scores, preserving null for quarters not updated
          const updatedScores = {
            q1: {
              teamA: q1TeamA !== "" ? parseInt(q1TeamA, 10) : poolData.scores?.q1?.teamA ?? null,
              teamB: q1TeamB !== "" ? parseInt(q1TeamB, 10) : poolData.scores?.q1?.teamB ?? null,
            },
            q2: {
              teamA: q2TeamA !== "" ? parseInt(q2TeamA, 10) : poolData.scores?.q2?.teamA ?? null,
              teamB: q2TeamB !== "" ? parseInt(q2TeamB, 10) : poolData.scores?.q2?.teamB ?? null,
            },
            q3: {
              teamA: q3TeamA !== "" ? parseInt(q3TeamA, 10) : poolData.scores?.q3?.teamA ?? null,
              teamB: q3TeamB !== "" ? parseInt(q3TeamB, 10) : poolData.scores?.q3?.teamB ?? null,
            },
            final: {
              teamA: finalTeamA !== "" ? parseInt(finalTeamA, 10) : poolData.scores?.final?.teamA ?? null,
              teamB: finalTeamB !== "" ? parseInt(finalTeamB, 10) : poolData.scores?.final?.teamB ?? null,
            },
          };

          // Build or update winners
          let updatedWinners = { ...(poolData.winners || {}) };

          if (poolData.format === "squares" || poolData.format === "strip_cards") {
            updatedWinners.q1 = updatedScores.q1.teamA != null && updatedScores.q1.teamB != null
              ? getWinnerForFormat(poolData, updatedScores.q1.teamA, updatedScores.q1.teamB)
              : updatedWinners.q1 ?? null;
            updatedWinners.q2 = updatedScores.q2.teamA != null && updatedScores.q2.teamB != null
              ? getWinnerForFormat(poolData, updatedScores.q2.teamA, updatedScores.q2.teamB)
              : updatedWinners.q2 ?? null;
            updatedWinners.q3 = updatedScores.q3.teamA != null && updatedScores.q3.teamB != null
              ? getWinnerForFormat(poolData, updatedScores.q3.teamA, updatedScores.q3.teamB)
              : updatedWinners.q3 ?? null;
            updatedWinners.final = updatedScores.final.teamA != null && updatedScores.final.teamB != null
              ? getWinnerForFormat(poolData, updatedScores.final.teamA, updatedScores.final.teamB)
              : updatedWinners.final ?? null;
          } else if (poolData.format === "custom_pool") {
            if (!customWinner) {
              throw new Error("Please select a winner for the custom pool.");
            }
            updatedWinners.final = customWinner;
          }

          // Update the document with the new scores, team names, and winners
          transaction.update(poolRef, {
            teamAName,
            teamBName,
            scores: updatedScores,
            winners: updatedWinners,
          });
        })
      );

      console.log("handleSaveScores - Scores and winners updated:", {
        teamAName,
        teamBName,
        scores: {
          q1: { teamA: q1TeamA ? parseInt(q1TeamA, 10) : null, teamB: q1TeamB ? parseInt(q1TeamB, 10) : null },
          q2: { teamA: q2TeamA ? parseInt(q2TeamA, 10) : null, teamB: q2TeamB ? parseInt(q2TeamB, 10) : null },
          q3: { teamA: q3TeamA ? parseInt(q3TeamA, 10) : null, teamB: q3TeamB ? parseInt(q3TeamB, 10) : null },
          final: { teamA: finalTeamA ? parseInt(finalTeamA, 10) : null, teamB: finalTeamB ? parseInt(finalTeamB, 10) : null },
        },
        winners: localPoolData.winners,
      });

      if (analytics) {
        logEvent(analytics, "enter_scores_save_success", {
          poolId,
          userId: user?.uid || "anonymous",
          format: localPoolData.format,
          timestamp: new Date().toISOString(),
        });
        console.log("EnterScoresModal - Save scores success logged to Firebase Analytics");
      }

      setSuccessMessage("Scores saved successfully!");
      onClose();
    } catch (err) {
      console.error("handleSaveScores - Error:", err);
      let userFriendlyError = err.message || "Failed to save scores.";
      if (err.message.includes("Pool does not exist")) {
        userFriendlyError = "This pool no longer exists.";
      } else if (err.message.includes("Please select a winner")) {
        userFriendlyError = err.message;
      } else if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to update scores for this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "enter_scores_save_failure", {
          poolId,
          userId: user?.uid || "anonymous",
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("EnterScoresModal - Save scores failure logged to Firebase Analytics");
      }
    } finally {
      setSaving(false);
    }
  }

  // Handle cancel action
  const handleCancel = () => {
    if (analytics) {
      logEvent(analytics, "enter_scores_modal_canceled", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("EnterScoresModal - Modal cancel logged to Firebase Analytics");
    }
    onClose();
  };

  // Get participant name for winner preview
  const getParticipantForWinner = (winner, format) => {
    if (!winner || !localPoolData) return null;
    if (format === "squares" && localPoolData.assignments) {
      const squareAssignments = localPoolData.assignments;
      const participant = squareAssignments[winner];
      return participant || `Square #${winner}`;
    } else if (format === "strip_cards" && localPoolData.participants) {
      const participant = localPoolData.participants[winner - 1];
      return participant || `Strip #${winner}`;
    }
    return `Winner #${winner}`;
  };

  // Redirect if user is not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  // Hide if auth state is loading
  if (authLoading) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={handleCancel}
        fullWidth
        maxWidth="sm"
        aria-labelledby="enter-scores-modal-title"
        aria-describedby="enter-scores-modal-content"
      >
        <StyledDialogTitle id="enter-scores-modal-title">Enter Scores</StyledDialogTitle>

        <StyledDialogContent id="enter-scores-modal-content">
          <Fade in timeout={500}>
            <Box>
              {error && (
                <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
                  {error}
                </Alert>
              )}
              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} aria-label="Loading pool data" />
                </Box>
              ) : !localPoolData ? (
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "'Poppins', sans-serif'", textAlign: "center" }}
                >
                  No pool data found.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                  {/* Team Names */}
                  <Box>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                    >
                      Team Names
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <StyledTextField
                        label="Team A"
                        value={teamAName}
                        onChange={(e) => setTeamAName(e.target.value)}
                        size="small"
                        sx={{ width: 150 }}
                        inputProps={{ "aria-label": "Team A name" }}
                      />
                      <StyledTextField
                        label="Team B"
                        value={teamBName}
                        onChange={(e) => setTeamBName(e.target.value)}
                        size="small"
                        sx={{ width: 150 }}
                        inputProps={{ "aria-label": "Team B name" }}
                      />
                    </Stack>
                  </Box>

                  {/* Scores for Squares or Strip Cards */}
                  {(localPoolData.format === "squares" || localPoolData.format === "strip_cards") && (
                    <>
                      {/* Q1 */}
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                        >
                          Q1
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamAName || "Team A"} Score`}
                              value={q1TeamA}
                              onChange={(e) => setQ1TeamA(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.q1TeamA}
                              inputProps={{
                                "aria-label": `${teamAName || "Team A"} Q1 score`,
                                "aria-describedby": scoreErrors.q1TeamA ? "q1TeamA-error" : undefined,
                              }}
                            />
                            {scoreErrors.q1TeamA && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="q1TeamA-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.q1TeamA}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamBName || "Team B"} Score`}
                              value={q1TeamB}
                              onChange={(e) => setQ1TeamB(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.q1TeamB}
                              inputProps={{
                                "aria-label": `${teamBName || "Team B"} Q1 score`,
                                "aria-describedby": scoreErrors.q1TeamB ? "q1TeamB-error" : undefined,
                              }}
                            />
                            {scoreErrors.q1TeamB && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="q1TeamB-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.q1TeamB}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </Box>

                      {/* Q2 */}
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                        >
                          Q2
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamAName || "Team A"} Score`}
                              value={q2TeamA}
                              onChange={(e) => setQ2TeamA(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.q2TeamA}
                              inputProps={{
                                "aria-label": `${teamAName || "Team A"} Q2 score`,
                                "aria-describedby": scoreErrors.q2TeamA ? "q2TeamA-error" : undefined,
                              }}
                            />
                            {scoreErrors.q2TeamA && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="q2TeamA-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.q2TeamA}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamBName || "Team B"} Score`}
                              value={q2TeamB}
                              onChange={(e) => setQ2TeamB(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.q2TeamB}
                              inputProps={{
                                "aria-label": `${teamBName || "Team B"} Q2 score`,
                                "aria-describedby": scoreErrors.q2TeamB ? "q2TeamB-error" : undefined,
                              }}
                            />
                            {scoreErrors.q2TeamB && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="q2TeamB-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.q2TeamB}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </Box>

                      {/* Q3 */}
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                        >
                          Q3
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamAName || "Team A"} Score`}
                              value={q3TeamA}
                              onChange={(e) => setQ3TeamA(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.q3TeamA}
                              inputProps={{
                                "aria-label": `${teamAName || "Team A"} Q3 score`,
                                "aria-describedby": scoreErrors.q3TeamA ? "q3TeamA-error" : undefined,
                              }}
                            />
                            {scoreErrors.q3TeamA && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="q3TeamA-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.q3TeamA}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamBName || "Team B"} Score`}
                              value={q3TeamB}
                              onChange={(e) => setQ3TeamB(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.q3TeamB}
                              inputProps={{
                                "aria-label": `${teamBName || "Team B"} Q3 score`,
                                "aria-describedby": scoreErrors.q3TeamB ? "q3TeamB-error" : undefined,
                              }}
                            />
                            {scoreErrors.q3TeamB && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="q3TeamB-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.q3TeamB}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </Box>

                      {/* Final */}
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                        >
                          Final
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamAName || "Team A"} Score`}
                              value={finalTeamA}
                              onChange={(e) => setFinalTeamA(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.finalTeamA}
                              inputProps={{
                                "aria-label": `${teamAName || "Team A"} final score`,
                                "aria-describedby": scoreErrors.finalTeamA ? "finalTeamA-error" : undefined,
                              }}
                            />
                            {scoreErrors.finalTeamA && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="finalTeamA-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.finalTeamA}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            <StyledTextField
                              type="number"
                              label={`${teamBName || "Team B"} Score`}
                              value={finalTeamB}
                              onChange={(e) => setFinalTeamB(e.target.value)}
                              size="small"
                              sx={{ width: 120 }}
                              error={!!scoreErrors.finalTeamB}
                              inputProps={{
                                "aria-label": `${teamBName || "Team B"} final score`,
                                "aria-describedby": scoreErrors.finalTeamB ? "finalTeamB-error" : undefined,
                              }}
                            />
                            {scoreErrors.finalTeamB && (
                              <Typography
                                variant="caption"
                                color="error"
                                id="finalTeamB-error"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}
                                aria-live="assertive"
                              >
                                {scoreErrors.finalTeamB}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </Box>

                      {/* Real-time Winner Preview */}
                      {(previewWinners.q1 || previewWinners.q2 || previewWinners.q3 || previewWinners.final) && (
                        <WinnerPreview aria-live="polite">
                          <Typography
                            variant="subtitle1"
                            sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                          >
                            Winner Preview
                          </Typography>
                          {["q1", "q2", "q3", "final"].map((period) => (
                            previewWinners[period] && (
                              <Typography
                                key={period}
                                variant="body2"
                                sx={{ fontFamily: "'Poppins', sans-serif'", mb: 0.5 }}
                              >
                                {period.toUpperCase()} Winner: {getParticipantForWinner(previewWinners[period], localPoolData.format)}
                              </Typography>
                            )
                          ))}
                        </WinnerPreview>
                      )}
                    </>
                  )}

                  {/* Custom Pool Winner Selection */}
                  {localPoolData?.format === "custom_pool" && localPoolData?.participants && (
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
                      >
                        Select Custom Pool Winner
                      </Typography>
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                          Choose Participant
                        </InputLabel>
                        <Select
                          label="Choose Participant"
                          value={customWinner}
                          onChange={handleCustomWinnerChange}
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                          aria-label="Select custom pool winner"
                        >
                          <MenuItem value="">
                            <em>-- None --</em>
                          </MenuItem>
                          {localPoolData.participants.map((p, idx) => (
                            <MenuItem key={idx} value={p} sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                              {p}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Fade>
        </StyledDialogContent>

        <DialogActions sx={{ backgroundColor: mode === "dark" ? (theme) => theme.palette.background.default : (theme) => theme.palette.grey[50], p: 2 }}>
          <Button
            onClick={handleCancel}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            disabled={saving}
            aria-label="Cancel score entry"
          >
            Cancel
          </Button>
          {isCommissioner && (
            <>
              <ResetButton
                onClick={handleOpenResetDialog}
                disabled={saving || loading || !localPoolData}
                aria-label="Reset scores"
              >
                Reset Scores
              </ResetButton>
              <StyledButton
                onClick={handleSaveScores}
                disabled={saving || loading || !localPoolData}
                aria-label="Save scores"
              >
                {saving ? <CircularProgress size={24} color="inherit" /> : "Save"}
              </StyledButton>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Resetting Scores */}
      <Dialog
        open={confirmResetOpen}
        onClose={handleCancelReset}
        aria-labelledby="confirm-reset-scores-title"
        aria-describedby="confirm-reset-scores-description"
      >
        <StyledDialogTitle id="confirm-reset-scores-title">Confirm Reset Scores</StyledDialogTitle>
        <StyledDialogContent>
          <Typography
            id="confirm-reset-scores-description"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
          >
            Are you sure you want to reset all scores and winners for this pool? This action cannot be undone.
          </Typography>
        </StyledDialogContent>
        <DialogActions sx={{ backgroundColor: mode === "dark" ? (theme) => theme.palette.background.default : (theme) => theme.palette.grey[50] }}>
          <Button
            onClick={handleCancelReset}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel reset scores"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmReset}
            color="error"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm reset scores"
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

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

// Helper Functions
function getWinnerForFormat(poolData, scoreA, scoreB) {
  if (isNaN(scoreA) || isNaN(scoreB)) return null;
  if (poolData.format === "squares") {
    return findSquaresWinner(poolData, scoreA, scoreB);
  } else if (poolData.format === "strip_cards") {
    return findStripsWinner(poolData, scoreA, scoreB);
  }
  return null;
}

function findSquaresWinner(poolData, teamAScore, teamBScore) {
  const xArr = poolData.axisNumbers?.x || [];
  const yArr = poolData.axisNumbers?.y || [];
  if (!xArr.length || !yArr.length) {
    console.warn("findSquaresWinner - Missing axis numbers:", { xArr, yArr });
    return null;
  }

  const lastDigitA = teamAScore % 10;
  const lastDigitB = teamBScore % 10;

  const colIndex = xArr.indexOf(lastDigitA);
  const rowIndex = yArr.indexOf(lastDigitB);
  if (colIndex === -1 || rowIndex === -1) {
    console.warn("findSquaresWinner - Invalid digits:", { lastDigitA, lastDigitB });
    return null;
  }

  const squareNumber = rowIndex * 10 + colIndex + 1;
  console.log("findSquaresWinner - Winner square:", squareNumber);
  return squareNumber;
}

function findStripsWinner(poolData, teamAScore, teamBScore) {
  const stripNums = poolData.stripNumbers || [];
  if (stripNums.length < 10) {
    console.warn("findStripsWinner - Insufficient strip numbers:", stripNums);
    return null;
  }

  const sum = teamAScore + teamBScore;
  const digit = sum % 10;
  const index = stripNums.indexOf(digit);
  if (index === -1) {
    console.warn("findStripsWinner - Digit not found:", digit);
    return null;
  }

  const stripNumber = index + 1;
  console.log("findStripsWinner - Winner strip:", stripNumber);
  return stripNumber;
}

export default EnterScoresModal;