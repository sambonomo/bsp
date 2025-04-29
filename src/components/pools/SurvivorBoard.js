import React, { useState, useEffect, useRef, useCallback } from "react";
import { getDb, getAnalyticsService } from "../../firebase/config";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  runTransaction,
  getDoc,
  serverTimestamp, // Added import
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
    boxShadow: theme.shadows(2),
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

function SurvivorBoard({ poolId }) {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const [weeks, setWeeks] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [userStatus, setUserStatus] = useState("active"); // active, eliminated
  const [availableTeams, setAvailableTeams] = useState([]);
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
          console.log(`SurvivorBoard - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Fetch weeks, participants, and user status
  useEffect(() => {
    if (!poolId || !user) return;

    const fetchData = async () => {
      setLoading(true);
      setError("");

      let weeksUnsubscribe, participantsUnsubscribe; // Declare variables here

      try {
        // Fetch weeks (subcollection: pools/{poolId}/weeks)
        const weeksRef = collection(db, "pools", poolId, "weeks");
        const weeksQuery = query(weeksRef, orderBy("weekNumber", "asc"));
        weeksUnsubscribe = await withRetry("Fetch Weeks", () =>
          onSnapshot(
            weeksQuery,
            (snapshot) => {
              const data = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }));
              setWeeks(data);
              console.log("SurvivorBoard - Fetched weeks:", data);

              // Determine current week (first week that hasn't ended)
              const now = new Date();
              const activeWeek = data.find((week) => {
                const endTime = week.endTime?.seconds
                  ? new Date(week.endTime.seconds * 1000)
                  : null;
                return !endTime || endTime > now;
              });
              setCurrentWeek(activeWeek || data[data.length - 1] || null);
            },
            (err) => {
              throw err;
            }
          )
        );

        // Fetch participants (subcollection: pools/{poolId}/participants)
        const participantsRef = collection(db, "pools", poolId, "participants");
        participantsUnsubscribe = await withRetry("Fetch Participants", () =>
          onSnapshot(
            participantsRef,
            (snapshot) => {
              const data = snapshot.docs.map((docSnap) => ({
                userId: docSnap.id,
                ...docSnap.data(),
              }));
              setParticipants(data);
              console.log("SurvivorBoard - Fetched participants:", data);

              // Determine user status
              const userParticipant = data.find((p) => p.userId === user.uid);
              setUserStatus(userParticipant?.status || "active");
            },
            (err) => {
              throw err;
            }
          )
        );

        // Fetch available teams (assuming a field in the pool document: availableTeams)
        const poolRef = doc(db, "pools", poolId);
        const poolDoc = await getDoc(poolRef);
        if (poolDoc.exists()) {
          const poolData = poolDoc.data();
          setAvailableTeams(poolData.availableTeams || []);
          console.log("SurvivorBoard - Fetched available teams:", poolData.availableTeams);
        }

        setLoading(false);

        // Log board load (only once)
        if (!hasLoggedBoardLoad.current && analytics) {
          logEvent(analytics, "survivor_board_loaded", {
            poolId,
            userId: user?.uid || "anonymous",
            weekCount: weeks.length,
            participantCount: participants.length,
            timestamp: new Date().toISOString(),
          });
          console.log("SurvivorBoard - Board load logged to Firebase Analytics");
          hasLoggedBoardLoad.current = true;
        }
      } catch (err) {
        console.error("SurvivorBoard - Error fetching data:", err);
        let userFriendlyError = "Failed to load Survivor pool data.";
        if (err.code === "permission-denied") {
          userFriendlyError = "You do not have permission to view this Survivor pool.";
        } else if (err.code === "unavailable") {
          userFriendlyError = "Firestore is currently unavailable. Please try again later.";
        }
        setError(userFriendlyError);
        setLoading(false);
        if (analytics) {
          logEvent(analytics, "survivor_board_failed", {
            poolId,
            userId: user?.uid || "anonymous",
            error_message: userFriendlyError,
            timestamp: new Date().toISOString(),
          });
          console.log("SurvivorBoard - Board load failure logged to Firebase Analytics");
        }
      }

      return () => {
        if (weeksUnsubscribe) weeksUnsubscribe();
        if (participantsUnsubscribe) participantsUnsubscribe();
      };
    };

    fetchData();

    // Reset logging flags when poolId or user changes
    hasLoggedBoardLoad.current = false;
  }, [poolId, user?.uid, analytics]);

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading Survivor pool data" />
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

  if (weeks.length === 0) {
    return (
      <Typography sx={{ fontFamily: "'Poppins', sans-serif'", textAlign: "center" }}>
        No weeks added yet. Please ask your pool commissioner to add weeks.
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
          Survivor Pool
        </Typography>

        {/* User Status */}
        <StyledPaper variant="outlined">
          <Typography
            variant="h6"
            sx={{ fontFamily: "'Poppins', sans-serif'", fontWeight: 500, mb: 1 }}
          >
            Your Status: {userStatus === "active" ? "Active" : "Eliminated"}
          </Typography>
          {userStatus === "active" && currentWeek ? (
            <Typography
              variant="body1"
              sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
            >
              Current Week: {currentWeek.weekNumber}
            </Typography>
          ) : userStatus === "eliminated" ? (
            <Typography
              variant="body1"
              sx={{ fontFamily: "'Poppins', sans-serif'", color: "error.main" }}
            >
              You have been eliminated from the pool.
            </Typography>
          ) : null}
        </StyledPaper>

        {/* Make a Pick for Current Week */}
        {userStatus === "active" && currentWeek && (
          <PickSection
            poolId={poolId}
            week={currentWeek}
            availableTeams={availableTeams}
            userId={user?.uid}
            participants={participants}
          />
        )}

        {/* Past Picks and Results */}
        <StyledPaper variant="outlined">
          <Typography
            variant="h6"
            sx={{ fontFamily: "'Poppins', sans-serif'", fontWeight: 500, mb: 1 }}
          >
            Your Picks
          </Typography>
          <TableContainer>
            <Table aria-label="Survivor pool picks table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Week</TableCell>
                  <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Picked Team</TableCell>
                  <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {weeks.map((week) => {
                  const userParticipant = participants.find((p) => p.userId === user?.uid);
                  const pick = userParticipant?.picks?.[week.weekNumber];
                  const result = pick?.result || "Pending";
                  return (
                    <TableRow key={week.id}>
                      <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                        Week {week.weekNumber}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                        {pick?.team || "No pick"}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "'Poppins', sans-serif'", color: result === "Win" ? "success.main" : result === "Loss" ? "error.main" : "text.secondary" }}>
                        {result}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </StyledPaper>

        {/* Leaderboard */}
        <StyledPaper variant="outlined">
          <Typography
            variant="h6"
            sx={{ fontFamily: "'Poppins', sans-serif'", fontWeight: 500, mb: 1 }}
          >
            Leaderboard
          </Typography>
          <TableContainer>
            <Table aria-label="Survivor pool leaderboard table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Participant</TableCell>
                  <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Status</TableCell>
                  <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Weeks Survived</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {participants.map((participant) => (
                  <TableRow key={participant.userId}>
                    <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                      {participant.displayName || `User (${participant.userId.slice(0, 8)})`}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "'Poppins', sans-serif'", color: participant.status === "active" ? "success.main" : "error.main" }}>
                      {participant.status === "active" ? "Active" : "Eliminated"}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                      {participant.weeksSurvived || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </StyledPaper>
      </Box>
    </Fade>
  );
}

/** Section for making a pick for the current week */
function PickSection({ poolId, week, availableTeams, userId, participants }) {
  const [selectedTeam, setSelectedTeam] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedPick = useRef(false);
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
            userId: userId || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`PickSection - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [analytics, userId]);

  // Check user's current pick for this week
  const userParticipant = participants.find((p) => p.userId === userId);
  const currentPick = userParticipant?.picks?.[week.weekNumber]?.team || "";
  const hasPicked = !!currentPick;

  // Check if the week has ended
  const endTime = week.endTime?.seconds
    ? new Date(week.endTime.seconds * 1000)
    : null;
  const hasEnded = endTime ? endTime < new Date() : false;

  const handlePick = () => {
    if (!selectedTeam) {
      setError("Please select a team to pick.");
      return;
    }

    if (hasPicked) {
      setConfirmDialogOpen(true);
      return;
    }

    savePick();
  };

  const savePick = async () => {
    setSaving(true);
    setError("");

    try {
      const participantRef = doc(db, "pools", poolId, "participants", userId);

      // Use a transaction to ensure atomic updates to the participant's picks
      await withRetry("Save Survivor Pick Transaction", () =>
        runTransaction(db, async (transaction) => {
          const participantDoc = await transaction.get(participantRef);
          if (!participantDoc.exists()) {
            throw new Error("Participant does not exist.");
          }

          const participantData = participantDoc.data();
          const picksObj = participantData.picks || {};
          picksObj[week.weekNumber] = {
            team: selectedTeam,
            pickedAt: serverTimestamp(),
            result: "Pending",
          };

          transaction.update(participantRef, {
            picks: picksObj,
          });
        })
      );

      setSuccessMessage(`Successfully picked ${selectedTeam} for Week ${week.weekNumber}!`);
      console.log("PickSection - Updated pick:", { weekNumber: week.weekNumber, userId, team: selectedTeam });

      // Log pick (only once per save)
      if (!hasLoggedPick.current && analytics) {
        logEvent(analytics, "survivor_pick_made", {
          poolId,
          weekNumber: week.weekNumber,
          userId,
          teamPicked: selectedTeam,
          timestamp: new Date().toISOString(),
        });
        console.log("PickSection - Pick logged to Firebase Analytics");
        hasLoggedPick.current = true;
      }
    } catch (err) {
      console.error("PickSection - Error updating pick:", err);
      let userFriendlyError = err.message || "Failed to save your pick.";
      if (err.message.includes("Participant does not exist")) {
        userFriendlyError = "You are not a participant in this pool.";
      } else if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to make picks in this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "survivor_pick_failed", {
          poolId,
          weekNumber: week.weekNumber,
          userId,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("PickSection - Pick failure logged to Firebase Analytics");
      }
    } finally {
      setSaving(false);
      setConfirmDialogOpen(false);
    }
  };

  const handleConfirmPickChange = () => {
    if (selectedTeam) {
      savePick();
      if (analytics) {
        logEvent(analytics, "survivor_pick_change_confirmed", {
          poolId,
          weekNumber: week.weekNumber,
          userId,
          oldPick: currentPick,
          newPick: selectedTeam,
          timestamp: new Date().toISOString(),
        });
        console.log("PickSection - Pick change confirmed logged to Firebase Analytics");
      }
    }
  };

  const handleCancelPickChange = () => {
    setConfirmDialogOpen(false);
    setSelectedTeam("");
    if (analytics) {
      logEvent(analytics, "survivor_pick_change_canceled", {
        poolId,
        weekNumber: week.weekNumber,
        userId,
        oldPick: currentPick,
        newPick: selectedTeam,
        timestamp: new Date().toISOString(),
      });
      console.log("PickSection - Pick change canceled logged to Firebase Analytics");
    }
  };

  return (
    <>
      <StyledPaper variant="outlined">
        <Typography
          variant="h6"
          sx={{ fontFamily: "'Poppins', sans-serif'", fontWeight: 500, mb: 1 }}
        >
          Make Your Pick for Week {week.weekNumber}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}

        {hasPicked ? (
          <Typography
            sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
          >
            Your pick: <strong>{currentPick}</strong>
          </Typography>
        ) : hasEnded ? (
          <Typography
            sx={{ fontFamily: "'Poppins', sans-serif'", color: "error.main" }}
          >
            This week has ended. You cannot make a pick.
          </Typography>
        ) : (
          <>
            <Typography
              sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}
            >
              Select a team to survive this week:
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              {availableTeams.map((team) => (
                <StyledButton
                  key={team}
                  variant="contained"
                  sx={{
                    backgroundColor: selectedTeam === team ? (theme) => theme.palette.warning.light : (theme) => theme.palette.grey[300],
                    color: selectedTeam === team ? (theme) => theme.palette.text.primary : (theme) => theme.palette.text.secondary,
                    "&:hover": {
                      backgroundColor: selectedTeam === team ? (theme) => theme.palette.warning.main : (theme) => theme.palette.grey[400],
                    },
                  }}
                  onClick={() => setSelectedTeam(team)}
                  disabled={saving || userParticipant?.pickedTeams?.includes(team)}
                  aria-label={`Pick ${team} for Week ${week.weekNumber}`}
                  aria-pressed={selectedTeam === team}
                >
                  {team}
                  {userParticipant?.pickedTeams?.includes(team) && " (Already Picked)"}
                </StyledButton>
              ))}
            </Box>
            <StyledButton
              variant="contained"
              color="primary"
              onClick={handlePick}
              disabled={saving || !selectedTeam}
              aria-label={`Confirm pick for Week ${week.weekNumber}`}
            >
              {saving ? "Saving..." : "Confirm Pick"}
            </StyledButton>
          </>
        )}
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
            You have already picked {currentPick}. Are you sure you want to change your pick to {selectedTeam}?
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

export default SurvivorBoard;