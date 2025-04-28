import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getDb, getAnalyticsService } from "../firebase/config"; // Updated imports
import {
  doc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import { useAuth } from "../contexts/AuthContext";

// MUI imports
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stack,
  List,
  ListItem,
  ListItemText,
  Container,
  styled,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";

// Styled components for polished UI
const ManageContainer = styled(Container)(({ theme }) => ({
  marginTop: theme.spacing(4),
  marginBottom: theme.spacing(4),
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  boxShadow: theme.shadows[2],
  padding: theme.spacing(3),
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

function ManageMatchupsPage() {
  const { poolId } = useParams();
  const { user, isTokenReady } = useAuth();
  const navigate = useNavigate();

  const [poolData, setPoolData] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [filteredMatchups, setFilteredMatchups] = useState([]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingMatchup, setAddingMatchup] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [matchupToDelete, setMatchupToDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPageView = useRef(false);
  const hasLoggedMatchupAdded = useRef(false);
  const hasLoggedMatchupDeleted = useRef(false);
  const hasLoggedRefresh = useRef(false);
  const hasLoggedStatusFilterChange = useRef(false);
  const hasLoggedDeleteDialogOpen = useRef({});
  const hasLoggedDeleteCancel = useRef({});
  const db = getDb(); // Initialize db with accessor

  // For new matchup creation
  const [week, setWeek] = useState(1);
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [startTime, setStartTime] = useState("");

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "manage_matchups_page_viewed", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMatchupsPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [poolId, user?.uid, analytics]); // Added analytics to dependencies

  // Fetch pool data and matchups with real-time updates using onSnapshot
  useEffect(() => {
    if (!poolId || !isTokenReady) {
      if (!isTokenReady) {
        setLoading(true);
        setError("Waiting for authentication...");
      }
      return;
    }

    if (!user) {
      setLoading(false);
      navigate("/login");
      return;
    }

    console.log("ManageMatchupsPage - Setting up live updates for poolId:", poolId);
    const poolRef = doc(db, "pools", poolId);
    const matchupsRef = collection(db, "pools", poolId, "matchups");
    const matchupsQuery = query(matchupsRef, orderBy("startTime", "asc"));
    let unsubscribePool, unsubscribeMatchups;

    const setupListeners = async () => {
      setLoading(true);
      setError("");

      // Log the authentication token to verify it's being sent
      try {
        const token = await user.getIdToken();
        console.log("ManageMatchupsPage - Authentication token:", token);
      } catch (err) {
        console.error("ManageMatchupsPage - Error getting token:", err);
        setError("Failed to retrieve authentication token.");
        setLoading(false);
        return;
      }

      // Listener for pool data
      unsubscribePool = await withRetry("Fetch Pool Data", () =>
        onSnapshot(
          poolRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setPoolData(data);
              setError("");
              console.log("ManageMatchupsPage - Fetched pool data:", data);
            } else {
              setError("Pool not found.");
              console.warn("ManageMatchupsPage - Pool not found:", poolId);
              setLoading(false);
            }
          },
          (err) => {
            console.error("ManageMatchupsPage - Error fetching pool data:", err);
            let userFriendlyError = "Failed to fetch pool data.";
            if (err.code === "permission-denied") {
              userFriendlyError = "You do not have permission to view this pool.";
            } else if (err.code === "unavailable") {
              userFriendlyError = "Firestore is currently unavailable. Please try again later.";
            }
            setError(userFriendlyError);
            setLoading(false);
            if (analytics) {
              logEvent(analytics, "pool_fetch_failed", {
                poolId,
                userId: user?.uid || "anonymous",
                error_message: userFriendlyError,
                timestamp: new Date().toISOString(),
              });
              console.log("ManageMatchupsPage - Pool fetch failure logged to Firebase Analytics");
            }
          }
        )
      );

      // Listener for matchups
      unsubscribeMatchups = await withRetry("Fetch Matchups", () =>
        onSnapshot(
          matchupsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
            setMatchups(data);
            setLoading(false);
            setError("");
            console.log("ManageMatchupsPage - Fetched matchups:", data);
          },
          (err) => {
            console.error("ManageMatchupsPage - Error fetching matchups:", err);
            let userFriendlyError = "Failed to fetch matchups.";
            if (err.code === "permission-denied") {
              userFriendlyError = "You do not have permission to view matchups.";
            } else if (err.code === "unavailable") {
              userFriendlyError = "Firestore is currently unavailable. Please try again later.";
            }
            setError(userFriendlyError);
            setLoading(false);
            if (analytics) {
              logEvent(analytics, "matchups_fetch_failed", {
                poolId,
                userId: user?.uid || "anonymous",
                error_message: userFriendlyError,
                timestamp: new Date().toISOString(),
              });
              console.log("ManageMatchupsPage - Matchups fetch failure logged to Firebase Analytics");
            }
          }
        )
      );
    };

    setupListeners();

    return () => {
      if (unsubscribePool) {
        console.log("ManageMatchupsPage - Unsubscribing from pool live updates for poolId:", poolId);
        unsubscribePool();
      }
      if (unsubscribeMatchups) {
        console.log("ManageMatchupsPage - Unsubscribing from matchups live updates for poolId:", poolId);
        unsubscribeMatchups();
      }
    };
  }, [poolId, isTokenReady, user, navigate, analytics]); // Added analytics to dependencies

  // Filter matchups based on status
  useEffect(() => {
    let filtered = matchups;
    if (statusFilter !== "all") {
      filtered = matchups.filter((matchup) => matchup.status === statusFilter);
    }
    setFilteredMatchups(filtered);
  }, [matchups, statusFilter]);

  const isCommissioner = poolData?.commissionerId === user?.uid;

  // Retry logic for Firebase operations
  const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        if (analytics) {
          logEvent(analytics, "firebase_operation_retry", {
            userId: user?.uid || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`ManageMatchupsPage - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Handle adding a matchup with duplicate check
  async function handleAddMatchup(e) {
    e.preventDefault();
    if (!poolData || !isCommissioner) {
      setError("Not authorized to add matchups.");
      console.warn("handleAddMatchup - User is not authorized:", user?.uid);
      return;
    }

    if (!week || !homeTeam.trim() || !awayTeam.trim() || !startTime) {
      setError("All fields are required to add a matchup.");
      console.warn("handleAddMatchup - Missing required fields");
      return;
    }

    if (homeTeam.trim() === awayTeam.trim()) {
      setError("Home and Away teams cannot be the same.");
      console.warn("handleAddMatchup - Home and Away teams are the same");
      return;
    }

    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime()) || startDate < new Date()) {
      setError("Start time must be a valid future date.");
      console.warn("handleAddMatchup - Invalid start time:", startTime);
      return;
    }

    try {
      setAddingMatchup(true);
      setError("");

      // Check for duplicate matchup
      const matchupsRef = collection(db, "pools", poolId, "matchups");
      const duplicateQuery = query(
        matchupsRef,
        where("week", "==", parseInt(week)),
        where("homeTeam", "==", homeTeam.trim()),
        where("awayTeam", "==", awayTeam.trim()),
        where("startTime", "==", startDate.toISOString())
      );
      const duplicateSnapshot = await getDocs(duplicateQuery);
      if (!duplicateSnapshot.empty) {
        setError("A matchup with the same week, teams, and start time already exists.");
        console.warn("handleAddMatchup - Duplicate matchup detected");
        setAddingMatchup(false);
        return;
      }

      await withRetry("Add Matchup", () =>
        addDoc(matchupsRef, {
          week: parseInt(week),
          homeTeam: homeTeam.trim(),
          awayTeam: awayTeam.trim(),
          startTime: startDate.toISOString(),
          finalScore: { home: null, away: null },
          status: "pending",
          createdAt: serverTimestamp(),
        })
      );

      setSuccessMessage("Matchup added successfully!");
      if (!hasLoggedMatchupAdded.current && analytics) {
        logEvent(analytics, "matchup_added", {
          poolId,
          userId: user.uid,
          week: parseInt(week),
          homeTeam: homeTeam.trim(),
          awayTeam: awayTeam.trim(),
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMatchupsPage - Matchup addition logged to Firebase Analytics");
        hasLoggedMatchupAdded.current = true;
      }

      setHomeTeam("");
      setAwayTeam("");
      setStartTime("");
      console.log("handleAddMatchup - Matchup added successfully");
    } catch (err) {
      console.error("handleAddMatchup - Error:", err);
      let userFriendlyError = "Failed to add matchup.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to add matchups.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "matchup_add_failed", {
          poolId,
          userId: user.uid,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMatchupsPage - Matchup addition failure logged to Firebase Analytics");
      }
    } finally {
      setAddingMatchup(false);
    }
  }

  // Handle deleting a matchup with improved error handling
  async function handleDeleteMatchup(matchupId) {
    if (!poolData || !isCommissioner) {
      setError("Not authorized to delete matchups.");
      console.warn("handleDeleteMatchup - User is not authorized:", user?.uid);
      return;
    }

    try {
      setError("");
      const matchupRef = doc(db, "pools", poolId, "matchups", matchupId);
      await withRetry("Delete Matchup", () => deleteDoc(matchupRef));

      setSuccessMessage("Matchup deleted successfully!");
      setDeleteDialogOpen(false);
      if (!hasLoggedMatchupDeleted.current && analytics) {
        logEvent(analytics, "matchup_deleted", {
          poolId,
          userId: user.uid,
          matchupId,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMatchupsPage - Matchup deletion logged to Firebase Analytics");
        hasLoggedMatchupDeleted.current = true;
      }
    } catch (err) {
      console.error("handleDeleteMatchup - Error:", err);
      let userFriendlyError = "Failed to delete matchup.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to delete matchups.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      } else if (err.code === "not-found") {
        userFriendlyError = "This matchup no longer exists.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "matchup_delete_failed", {
          poolId,
          userId: user.uid,
          matchupId,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMatchupsPage - Matchup deletion failure logged to Firebase Analytics");
      }
    }
  }

  // Handle opening delete dialog
  const handleOpenDeleteDialog = (matchup) => {
    setMatchupToDelete(matchup);
    setDeleteDialogOpen(true);
    if (!hasLoggedDeleteDialogOpen.current[matchup.id] && analytics) {
      logEvent(analytics, "matchup_delete_dialog_opened", {
        poolId,
        userId: user?.uid || "anonymous",
        matchupId: matchup.id,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMatchupsPage - Delete dialog opened logged to Firebase Analytics");
      hasLoggedDeleteDialogOpen.current[matchup.id] = true;
    }
  };

  // Handle canceling delete dialog
  const handleCancelDeleteDialog = () => {
    setDeleteDialogOpen(false);
    if (matchupToDelete && !hasLoggedDeleteCancel.current[matchupToDelete.id] && analytics) {
      logEvent(analytics, "matchup_delete_canceled", {
        poolId,
        userId: user?.uid || "anonymous",
        matchupId: matchupToDelete.id,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMatchupsPage - Delete canceled logged to Firebase Analytics");
      hasLoggedDeleteCancel.current[matchupToDelete.id] = true;
    }
    setMatchupToDelete(null);
  };

  // Handle manual refresh
  const handleRefresh = () => {
    setLoading(true);
    setError("");
    if (!hasLoggedRefresh.current && analytics) {
      logEvent(analytics, "matchups_refreshed", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMatchupsPage - Refresh logged to Firebase Analytics");
      hasLoggedRefresh.current = true;
    }
  };

  // Handle status filter change
  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    if (!hasLoggedStatusFilterChange.current && analytics) {
      logEvent(analytics, "matchup_status_filter_changed", {
        poolId,
        userId: user?.uid || "anonymous",
        statusFilter: e.target.value,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMatchupsPage - Status filter change logged to Firebase Analytics");
      hasLoggedStatusFilterChange.current = true;
    }
  };

  // Reset analytics logging flags when user or poolId changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedMatchupAdded.current = false;
    hasLoggedMatchupDeleted.current = false;
    hasLoggedRefresh.current = false;
    hasLoggedStatusFilterChange.current = false;
    hasLoggedDeleteDialogOpen.current = {};
    hasLoggedDeleteCancel.current = {};
  }, [user?.uid, poolId]);

  if (loading) {
    return (
      <ManageContainer>
        <Typography variant="body1" sx={{ mb: 1, fontFamily: "'Poppins', sans-serif'" }}>
          Loading pool data...
        </Typography>
        <CircularProgress aria-label="Loading pool data" />
      </ManageContainer>
    );
  }

  if (error) {
    return (
      <ManageContainer>
        <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {error}
          <Button
            onClick={handleRefresh}
            sx={{ ml: 2, fontFamily: "'Poppins', sans-serif'" }}
            startIcon={<RefreshIcon />}
            aria-label="Retry loading pool data"
          >
            Retry
          </Button>
        </Alert>
      </ManageContainer>
    );
  }

  if (!poolData) return null;

  return (
    <ManageContainer>
      <Typography
        variant="h5"
        sx={{
          mb: 2,
          fontWeight: 700,
          fontFamily: "'Montserrat', sans-serif'",
        }}
      >
        Manage Matchups: {poolData.poolName}
      </Typography>

      {poolData.format !== "pickem" && (
        <Alert severity="warning" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          This pool is not a Pick'em pool. Format: {poolData.format}
        </Alert>
      )}

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

      {isCommissioner ? (
        <Box>
          <Typography
            variant="h6"
            sx={{
              mb: 2,
              fontWeight: 600,
              fontFamily: "'Montserrat', sans-serif'",
            }}
          >
            Add a New Matchup
          </Typography>
          <Box component="form" onSubmit={handleAddMatchup} sx={{ mb: 4 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                type="number"
                label="Week"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                sx={{ width: { xs: "100%", sm: 80 } }}
                InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "week-label" } }}
                inputProps={{ "aria-label": "Enter week number", "aria-describedby": "week-label", min: 1 }}
                required
                disabled={addingMatchup}
              />
              <TextField
                label="Home Team"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                fullWidth
                InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "home-team-label" } }}
                inputProps={{ "aria-label": "Enter home team name", "aria-describedby": "home-team-label" }}
                required
                disabled={addingMatchup}
              />
              <TextField
                label="Away Team"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                fullWidth
                InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "away-team-label" } }}
                inputProps={{ "aria-label": "Enter away team name", "aria-describedby": "away-team-label" }}
                required
                disabled={addingMatchup}
              />
              <TextField
                type="datetime-local"
                label="Start Time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                sx={{ width: { xs: "100%", sm: 220 } }}
                InputLabelProps={{ shrink: true, sx: { fontFamily: "'Poppins', sans-serif'", id: "start-time-label" } }}
                InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                inputProps={{ "aria-label": "Enter start time", "aria-describedby": "start-time-label" }}
                required
                disabled={addingMatchup}
              />
            </Stack>
            <StyledButton type="submit" variant="contained" disabled={addingMatchup} aria-label="Add new matchup">
              {addingMatchup ? "Adding..." : "Add Matchup"}
            </StyledButton>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                fontFamily: "'Montserrat', sans-serif'",
              }}
            >
              Existing Matchups
            </Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'", id: "status-filter-label" }}>
                  Status
                </InputLabel>
                <Select
                  labelId="status-filter-label"
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                  aria-label="Filter matchups by status"
                  aria-describedby="status-filter-label"
                >
                  <MenuItem value="all" sx={{ fontFamily: "'Poppins', sans-serif'" }}>All</MenuItem>
                  <MenuItem value="pending" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Pending</MenuItem>
                  <MenuItem value="completed" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Completed</MenuItem>
                </Select>
              </FormControl>
              <Button
                onClick={handleRefresh}
                startIcon={<RefreshIcon />}
                sx={{ fontFamily: "'Poppins', sans-serif'" }}
                aria-label="Refresh matchups"
              >
                Refresh
              </Button>
            </Box>
          </Box>
          {filteredMatchups.length === 0 ? (
            <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              No matchups found. Add one above!
            </Typography>
          ) : (
            <List aria-label="List of matchups">
              {filteredMatchups.map((matchup) => {
                const startDate = new Date(matchup.startTime);
                const formattedStartTime = isNaN(startDate.getTime())
                  ? "Invalid Date"
                  : startDate.toLocaleString("en-US", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });
                return (
                  <ListItem
                    key={matchup.id}
                    sx={{ borderBottom: "1px solid #E0E0E0", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    role="listitem"
                    aria-label={`Week ${matchup.week}: ${matchup.awayTeam} at ${matchup.homeTeam}, starting ${formattedStartTime}, status ${matchup.status}`}
                  >
                    <ListItemText
                      primary={`Week ${matchup.week}: ${matchup.awayTeam} @ ${matchup.homeTeam}`}
                      secondary={`Start: ${formattedStartTime} | Status: ${matchup.status}`}
                      primaryTypographyProps={{ fontFamily: "'Poppins', sans-serif'" }}
                      secondaryTypographyProps={{ fontFamily: "'Poppins', sans-serif'" }}
                    />
                    {matchup.status === "pending" && (
                      <IconButton
                        onClick={() => handleOpenDeleteDialog(matchup)}
                        color="error"
                        aria-label={`Delete matchup between ${matchup.awayTeam} and ${matchup.homeTeam}`}
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      ) : (
        <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          Only the commissioner can manage matchups.
        </Alert>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCancelDeleteDialog}
        aria-labelledby="delete-matchup-dialog-title"
        aria-describedby="delete-matchup-dialog-content"
      >
        <DialogTitle id="delete-matchup-dialog-title">Confirm Delete Matchup</DialogTitle>
        <DialogContent id="delete-matchup-dialog-content">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Are you sure you want to delete the matchup between {matchupToDelete?.awayTeam} and {matchupToDelete?.homeTeam}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelDeleteDialog}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel deleting matchup"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteMatchup(matchupToDelete?.id)}
            color="error"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm deleting matchup"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </ManageContainer>
  );
}

export default ManageMatchupsPage;