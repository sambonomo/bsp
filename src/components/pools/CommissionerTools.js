import React, { useState, useEffect } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getDb, getAnalyticsService } from "../../firebase/config"; // Updated imports
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";
import {
  validateBuyInAmount,
  validatePayoutStructure,
} from "../../utils/validations";
import { assignGridDigits, calculatePayouts } from "../../utils/helpers";
import { calculatePickemScores } from "../../utils/calculatePickemScores";
import ManageMembersModal from "../modals/ManageMembersModal";
import EnterScoresModal from "../modals/EnterScoresModal";

// MUI imports
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  Fade,
  styled,
} from "@mui/material";

// Styled components for polished UI
const ToolsCard = styled(Card)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  mt: 3,
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
  "&:hover": {
    transform: "scale(1.02)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  },
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontFamily: "'Montserrat', sans-serif'",
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#FFFFFF" : "#0B162A",
  mb: 2,
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#FFD700",
  color: "#0B162A",
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  "&:hover": {
    backgroundColor: "#FFEB3B",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

// Main Component: CommissionerTools
function CommissionerTools({ poolId, poolData }) {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const [offlineName, setOfflineName] = useState("");
  const [isScoresModalOpen, setIsScoresModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [scoreCalcLoading, setScoreCalcLoading] = useState(false);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const db = getDb(); // Updated to use accessor

  // Settings state
  const [totalPot, setTotalPot] = useState(poolData?.totalPot || "");
  const [gridAssignmentLoading, setGridAssignmentLoading] = useState(false);

  // Payouts state
  const [payoutQ1, setPayoutQ1] = useState(poolData?.payoutStructure?.q1 || 0.2);
  const [payoutQ2, setPayoutQ2] = useState(poolData?.payoutStructure?.q2 || 0.2);
  const [payoutQ3, setPayoutQ3] = useState(poolData?.payoutStructure?.q3 || 0.2);
  const [payoutFinal, setPayoutFinal] = useState(poolData?.payoutStructure?.final || 0.4);
  const [payoutError, setPayoutError] = useState("");

  // Rules state
  const [winCondition, setWinCondition] = useState(poolData?.rules?.winCondition || "lastDigit"); // For Squares
  const [matchRule, setMatchRule] = useState(poolData?.rules?.matchRule || "sumLastDigit"); // For Strip Cards

  // Quick check if user is commissioner
  const isCommissioner = poolData?.commissionerId === user?.uid;

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
          console.log(`CommissionerTools - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Add Offline User
  const handleAddOfflineUser = async () => {
    if (!isCommissioner) {
      setError("Only the commissioner can add offline users.");
      console.warn("handleAddOfflineUser - User is not commissioner:", user?.uid);
      return;
    }
    if (!offlineName.trim()) {
      setError("Offline user name is required.");
      console.warn("handleAddOfflineUser - Offline name is empty");
      return;
    }

    try {
      setError("");
      const pseudoId = "offline_" + Date.now();
      const poolRef = doc(db, "pools", poolId);
      await withRetry("Add Offline User", () =>
        updateDoc(poolRef, {
          memberIds: arrayUnion(pseudoId),
          offlineUsers: arrayUnion({ id: pseudoId, name: offlineName }),
        })
      );
      console.log("handleAddOfflineUser - Added offline user:", { id: pseudoId, name: offlineName });
      if (analytics) {
        logEvent(analytics, "add_offline_user", {
          userId: user?.uid,
          poolId,
          offlineUserId: pseudoId,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Add offline user logged to Firebase Analytics");
      }
      setOfflineName("");
    } catch (err) {
      console.error("handleAddOfflineUser - Error:", err);
      setError(err.message || "Failed to add offline user.");
      if (analytics) {
        logEvent(analytics, "add_offline_user_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Add offline user failure logged to Firebase Analytics");
      }
    }
  };

  // Compute Pick'em Scores
  const handleComputePickemScores = async () => {
    if (poolData.format !== "pickem") {
      setError("This action is only available for pick'em pools.");
      console.warn("handleComputePickemScores - Invalid pool format:", poolData.format);
      return;
    }
    setScoreCalcLoading(true);
    setError("");
    try {
      await withRetry("Compute Pick'em Scores", () => calculatePickemScores(poolId));
      console.log("handleComputePickemScores - Successfully computed pick'em scores for poolId:", poolId);
      if (analytics) {
        logEvent(analytics, "compute_pickem_scores", {
          userId: user?.uid,
          poolId,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Compute pick'em scores logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleComputePickemScores - Error:", err);
      setError(err.message || "Failed to compute scores.");
      if (analytics) {
        logEvent(analytics, "compute_pickem_scores_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Compute pick'em scores failure logged to Firebase Analytics");
      }
    } finally {
      setScoreCalcLoading(false);
    }
  };

  // Update Total Pot
  const handleUpdateTotalPot = async () => {
    const validationError = validateBuyInAmount(totalPot);
    if (validationError) {
      setError(validationError);
      console.warn("handleUpdateTotalPot - Validation error:", validationError);
      return;
    }

    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);
      const parsedPot = totalPot.toLowerCase() === "donations only" ? "Donations only" : parseFloat(totalPot);
      await withRetry("Update Total Pot", () =>
        updateDoc(poolRef, { totalPot: parsedPot })
      );
      console.log("handleUpdateTotalPot - Updated total pot:", parsedPot);
      if (analytics) {
        logEvent(analytics, "update_total_pot", {
          userId: user?.uid,
          poolId,
          totalPot: parsedPot,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Update total pot logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleUpdateTotalPot - Error:", err);
      setError(err.message || "Failed to update total pot.");
      if (analytics) {
        logEvent(analytics, "update_total_pot_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Update total pot failure logged to Firebase Analytics");
      }
    }
  };

  // Reassign Grid Digits
  const handleReassignGridDigits = async () => {
    if (poolData.format !== "squares") {
      setError("This action is only available for squares pools.");
      console.warn("handleReassignGridDigits - Invalid pool format:", poolData.format);
      return;
    }
    setGridAssignmentLoading(true);
    setError("");
    try {
      const { rowDigits, colDigits } = assignGridDigits();
      const poolRef = doc(db, "pools", poolId);
      await withRetry("Reassign Grid Digits", () =>
        updateDoc(poolRef, {
          axisNumbers: { x: colDigits, y: rowDigits },
        })
      );
      console.log("handleReassignGridDigits - Reassigned grid digits:", { rowDigits, colDigits });
      if (analytics) {
        logEvent(analytics, "reassign_grid_digits", {
          userId: user?.uid,
          poolId,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Reassign grid digits logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleReassignGridDigits - Error:", err);
      setError(err.message || "Failed to reassign grid digits.");
      if (analytics) {
        logEvent(analytics, "reassign_grid_digits_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Reassign grid digits failure logged to Firebase Analytics");
      }
    } finally {
      setGridAssignmentLoading(false);
    }
  };

  // Update Payout Structure
  const handleUpdatePayouts = async () => {
    const structure = {
      q1: parseFloat(payoutQ1),
      q2: parseFloat(payoutQ2),
      q3: parseFloat(payoutQ3),
      final: parseFloat(payoutFinal),
    };
    const validationError = validatePayoutStructure(structure);
    if (validationError) {
      setPayoutError(validationError);
      console.warn("handleUpdatePayouts - Validation error:", validationError);
      return;
    }

    try {
      setPayoutError("");
      setError("");
      const poolRef = doc(db, "pools", poolId);
      await withRetry("Update Payout Structure", () =>
        updateDoc(poolRef, { payoutStructure: structure })
      );
      const payouts = calculatePayouts({ totalPot: poolData.totalPot, payoutStructure: structure });
      console.log("handleUpdatePayouts - Updated payout structure:", structure, "Payouts:", payouts);
      if (analytics) {
        logEvent(analytics, "update_payout_structure", {
          userId: user?.uid,
          poolId,
          payoutStructure: structure,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Update payout structure logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleUpdatePayouts - Error:", err);
      setError(err.message || "Failed to update payout structure.");
      if (analytics) {
        logEvent(analytics, "update_payout_structure_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Update payout structure failure logged to Firebase Analytics");
      }
    }
  };

  // Update Rules
  const handleUpdateRules = async () => {
    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);
      const rules = {
        winCondition,
        matchRule,
      };
      await withRetry("Update Rules", () =>
        updateDoc(poolRef, { rules })
      );
      console.log("handleUpdateRules - Updated rules:", rules);
      if (analytics) {
        logEvent(analytics, "update_rules", {
          userId: user?.uid,
          poolId,
          rules,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Update rules logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleUpdateRules - Error:", err);
      setError(err.message || "Failed to update rules.");
      if (analytics) {
        logEvent(analytics, "update_rules_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerTools - Update rules failure logged to Firebase Analytics");
      }
    }
  };

  // Handle opening Manage Members Modal
  const handleOpenMembersModal = () => {
    setIsMembersModalOpen(true);
    if (analytics) {
      logEvent(analytics, "open_manage_members_modal", {
        userId: user?.uid,
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("CommissionerTools - Open manage members modal logged to Firebase Analytics");
    }
  };

  // Handle opening Enter Scores Modal
  const handleOpenScoresModal = () => {
    setIsScoresModalOpen(true);
    if (analytics) {
      logEvent(analytics, "open_enter_scores_modal", {
        userId: user?.uid,
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("CommissionerTools - Open enter scores modal logged to Firebase Analytics");
    }
  };

  // Hide if auth state is loading, user is not authenticated, or user is not commissioner
  if (authLoading) {
    return null; // App.js handles loading UI
  }

  if (!user || !isCommissioner) {
    return null;
  }

  return (
    <Fade in timeout={1000}>
      <ToolsCard variant="outlined">
        <CardContent>
          <SectionTitle variant="h6">Commissioner Tools</SectionTitle>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} role="alert" aria-live="assertive">
              {error}
            </Alert>
          )}

          {/* Settings: Total Pot and Grid Assignment */}
          <Box sx={{ mb: 3 }}>
            <SectionTitle variant="subtitle1">Pool Settings</SectionTitle>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField
                label="Total Pot"
                value={totalPot}
                onChange={(e) => setTotalPot(e.target.value)}
                placeholder="e.g., 100 or Donations only"
                size="small"
                sx={{ width: 200 }}
                inputProps={{ "aria-label": "Enter total pot amount" }}
              />
              <StyledButton onClick={handleUpdateTotalPot} aria-label="Update total pot">
                Update Pot
              </StyledButton>
            </Stack>
            {poolData.format === "squares" && (
              <StyledButton
                onClick={handleReassignGridDigits}
                disabled={gridAssignmentLoading}
                aria-label={gridAssignmentLoading ? "Reassigning grid digits" : "Reassign grid digits"}
              >
                {gridAssignmentLoading ? "Reassigning..." : "Reassign Grid Digits"}
              </StyledButton>
            )}
          </Box>

          {/* Payouts Configuration */}
          <Box sx={{ mb: 3 }}>
            <SectionTitle variant="subtitle1">Payout Structure</SectionTitle>
            {payoutError && (
              <Alert severity="error" sx={{ mb: 2 }} role="alert" aria-live="assertive">
                {payoutError}
              </Alert>
            )}
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <TextField
                label="Q1 (%)"
                type="number"
                value={payoutQ1}
                onChange={(e) => setPayoutQ1(e.target.value)}
                size="small"
                sx={{ width: 100 }}
                inputProps={{ "aria-label": "Enter payout percentage for Q1" }}
              />
              <TextField
                label="Q2 (%)"
                type="number"
                value={payoutQ2}
                onChange={(e) => setPayoutQ2(e.target.value)}
                size="small"
                sx={{ width: 100 }}
                inputProps={{ "aria-label": "Enter payout percentage for Q2" }}
              />
              <TextField
                label="Q3 (%)"
                type="number"
                value={payoutQ3}
                onChange={(e) => setPayoutQ3(e.target.value)}
                size="small"
                sx={{ width: 100 }}
                inputProps={{ "aria-label": "Enter payout percentage for Q3" }}
              />
              <TextField
                label="Final (%)"
                type="number"
                value={payoutFinal}
                onChange={(e) => setPayoutFinal(e.target.value)}
                size="small"
                sx={{ width: 100 }}
                inputProps={{ "aria-label": "Enter payout percentage for final" }}
              />
            </Stack>
            <StyledButton onClick={handleUpdatePayouts} aria-label="Update payout structure">
              Update Payouts
            </StyledButton>
          </Box>

          {/* Rules Customization */}
          <Box sx={{ mb: 3 }}>
            <SectionTitle variant="subtitle1">Rules Customization</SectionTitle>
            {poolData.format === "squares" && (
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
            )}
            {poolData.format === "strip_cards" && (
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
            )}
            <StyledButton onClick={handleUpdateRules} aria-label="Update pool rules">
              Update Rules
            </StyledButton>
          </Box>

          {/* Tools: Add Offline Users, Compute Scores */}
          <Box sx={{ mb: 3 }}>
            <SectionTitle variant="subtitle1">Tools</SectionTitle>
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="body1"
                sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
              >
                Add Offline User:
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  type="text"
                  value={offlineName}
                  onChange={(e) => setOfflineName(e.target.value)}
                  placeholder="e.g. Bob's Dad"
                  size="small"
                  inputProps={{ "aria-label": "Enter offline user name" }}
                />
                <StyledButton onClick={handleAddOfflineUser} aria-label="Add offline user">
                  Add Offline User
                </StyledButton>
              </Stack>
            </Box>

            <Box sx={{ mb: 2 }}>
              <StyledButton onClick={handleOpenMembersModal} aria-label="Manage members and payments">
                Manage Members & Payments
              </StyledButton>
            </Box>

            <Box sx={{ mb: 2 }}>
              <StyledButton onClick={handleOpenScoresModal} aria-label="Enter scores">
                Enter Scores
              </StyledButton>
            </Box>

            {poolData.format === "pickem" && (
              <Box>
                <StyledButton
                  onClick={handleComputePickemScores}
                  disabled={scoreCalcLoading}
                  aria-label={scoreCalcLoading ? "Computing pick'em scores" : "Compute pick'em scores"}
                >
                  {scoreCalcLoading ? "Computing..." : "Compute Pick'em Scores"}
                </StyledButton>
              </Box>
            )}
          </Box>

          {/* Modal: Manage Members & Payments */}
          <ManageMembersModal
            open={isMembersModalOpen}
            onClose={() => setIsMembersModalOpen(false)}
            poolId={poolId}
          />

          {/* Modal: Enter Scores */}
          <EnterScoresModal
            open={isScoresModalOpen}
            onClose={() => setIsScoresModalOpen(false)}
            poolId={poolId}
            poolData={poolData}
          />
        </CardContent>
      </ToolsCard>
    </Fade>
  );
}

export default CommissionerTools;