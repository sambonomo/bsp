import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useThemeContext } from "../contexts/ThemeContext";
import { getDb, getAnalyticsService } from "../firebase/config"; // Updated imports
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, setDoc } from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  styled,
  InputAdornment,
  IconButton,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

// Styled components for polished UI
const FormContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginTop: theme.spacing(4),
  maxWidth: 500,
  margin: "auto",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  boxShadow: theme.shadows[2],
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#FF6B00",
  color: "#FFFFFF",
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  "&:hover": {
    backgroundColor: "#FF8E33",
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

function JoinPool() {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState("");
  const [poolPassword, setPoolPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [poolDetails, setPoolDetails] = useState(null);
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPageView = useRef(false); // Track if join_pool_page_viewed has been logged
  const hasLoggedPoolJoined = useRef(false); // Track if pool_joined has been logged
  const hasLoggedCancelForm = useRef(false); // Track if join_pool_canceled has been logged
  const hasLoggedCancelDialog = useRef(false); // Track if join_pool_confirm_canceled has been logged
  const db = getDb(); // Initialize db with accessor

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "join_pool_page_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("JoinPool - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, analytics]); // Added analytics to dependencies

  // Reset analytics logging flags when user changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedPoolJoined.current = false;
    hasLoggedCancelForm.current = false;
    hasLoggedCancelDialog.current = false;
  }, [user?.uid]);

  // Retry logic for Firestore operations
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
          console.log(`JoinPool - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Validate invite code format
  const validateInviteCode = (code) => {
    const regex = /^[A-Z0-9]{6}$/;
    return regex.test(code);
  };

  // Handle pool lookup before joining
  async function handleLookupPool(e) {
    e.preventDefault();
    setError("");
    setPoolDetails(null);

    if (!user) {
      setError("You must be logged in to join a pool.");
      return;
    }

    const trimmedCode = inviteCode.trim();
    if (!trimmedCode) {
      setError("Invite code is required.");
      return;
    }

    if (!validateInviteCode(trimmedCode)) {
      setError("Invite code must be a 6-character alphanumeric code (e.g., ABC123).");
      return;
    }

    try {
      setLoading(true);
      const poolsRef = collection(db, "pools");
      const q = query(poolsRef, where("inviteCode", "==", trimmedCode));
      const snapshot = await withRetry("Lookup Pool", () => getDocs(q));

      if (snapshot.empty) {
        setError("Invalid invite code.");
        return;
      }

      const poolDoc = snapshot.docs[0];
      const poolData = poolDoc.data();
      if (poolData.status !== "open") {
        setError("This pool is not open for joining.");
        return;
      }

      if (poolData.memberIds?.includes(user.uid)) {
        setError("You are already a member of this pool.");
        return;
      }

      setPoolDetails({ id: poolDoc.id, ...poolData });
      setConfirmDialogOpen(true);
    } catch (err) {
      let userFriendlyError = "Failed to find pool.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to join this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "pool_lookup_failed", {
          userId: user?.uid || "anonymous",
          inviteCode: trimmedCode,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("JoinPool - Pool lookup failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  }

  // Handle joining the pool
  async function handleJoinPool() {
    if (!poolDetails) {
      setError("No pool selected to join.");
      return;
    }

    if (poolDetails.poolPassword && poolPassword !== poolDetails.poolPassword) {
      setError("Incorrect pool password.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      // Add user to the participants subcollection
      const participantRef = doc(db, "pools", poolDetails.id, "participants", user.uid);
      await withRetry("Join Pool - Add to Participants", () =>
        setDoc(participantRef, {
          joinedAt: new Date().toISOString(),
          displayName: user.displayName || user.email || "Anonymous",
        })
      );

      // Update the pool document with memberIds and membersMeta
      const poolRef = doc(db, "pools", poolDetails.id);
      await withRetry("Join Pool - Update Pool", () =>
        updateDoc(poolRef, {
          memberIds: arrayUnion(user.uid),
          [`membersMeta.${user.uid}`]: { joinedAt: new Date().toISOString() },
        })
      );

      setSuccessMessage("Successfully joined the pool!");
      setConfirmDialogOpen(false);
      // Log pool join (only once)
      if (!hasLoggedPoolJoined.current && analytics) {
        logEvent(analytics, "pool_joined", {
          userId: user.uid,
          poolId: poolDetails.id,
          inviteCode: inviteCode.trim(),
          timestamp: new Date().toISOString(),
        });
        console.log("JoinPool - Pool join logged to Firebase Analytics");
        hasLoggedPoolJoined.current = true;
      }
      setTimeout(() => navigate(`/pool/${poolDetails.id}`), 2000);
    } catch (err) {
      let userFriendlyError = "Failed to join pool.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to join this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "pool_join_failed", {
          userId: user.uid,
          poolId: poolDetails?.id,
          inviteCode: inviteCode.trim(),
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("JoinPool - Pool join failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleCancelJoinPool = () => {
    navigate("/dashboard");
    // Log cancel from form (only once)
    if (!hasLoggedCancelForm.current && analytics) {
      logEvent(analytics, "join_pool_canceled", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("JoinPool - Join pool canceled from form logged to Firebase Analytics");
      hasLoggedCancelForm.current = true;
    }
  };

  const handleCancelConfirmDialog = () => {
    setConfirmDialogOpen(false);
    // Log cancel from dialog (only once)
    if (!hasLoggedCancelDialog.current && analytics) {
      logEvent(analytics, "join_pool_confirm_canceled", {
        userId: user?.uid || "anonymous",
        poolId: poolDetails?.id,
        inviteCode: inviteCode.trim(),
        timestamp: new Date().toISOString(),
      });
      console.log("JoinPool - Join pool canceled from dialog logged to Firebase Analytics");
      hasLoggedCancelDialog.current = true;
    }
  };

  // Show loading UI while auth state is resolving
  if (authLoading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress sx={{ color: "#FF6B00", mb: 2 }} aria-label="Loading authentication state" />
        <Typography
          variant="body1"
          sx={{
            mb: 2,
            fontFamily: "'Poppins', sans-serif'",
            color: isDarkMode ? "#B0BEC5" : "#555555",
          }}
        >
          Loading authentication state...
        </Typography>
      </Container>
    );
  }

  // Show login prompt if user is not authenticated
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}>
            Join a Pool
          </Typography>
          <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            You must be logged in to join a pool. Please{" "}
            <StyledButton component={RouterLink} to="/login" sx={{ px: 1, py: 0, fontSize: "inherit" }} aria-label="Go to login page">
              log in
            </StyledButton>
            .
          </Typography>
        </Paper>
      </Container>
    );
  }

  // Render the join pool form if user is authenticated
  return (
    <Container>
      <FormContainer elevation={3}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}>
          Join a Pool
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}
        <Snackbar
          open={!!successMessage}
          autoHideDuration={3000}
          onClose={() => setSuccessMessage("")}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert
            severity="success"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            role="alert"
            aria-live="assertive"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => navigate(`/pool/${poolDetails?.id}`)}
                aria-label="Go to pool page"
              >
                Go to Pool
              </Button>
            }
          >
            {successMessage}
          </Alert>
        </Snackbar>
        <Box component="form" onSubmit={handleLookupPool} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            fullWidth
            InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            inputProps={{ "aria-label": "Enter invite code" }}
            disabled={loading}
          />
          {poolDetails && (
            <>
              <Box sx={{ p: 2, bgcolor: isDarkMode ? "#2A3B5A" : "#F0F0F0", borderRadius: 2, mb: 2 }}>
                <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                  <strong>Pool Name:</strong> {poolDetails.poolName || "N/A"}
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                  <strong>Sport:</strong> {poolDetails.sport || "N/A"}
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                  <strong>Format:</strong> {poolDetails.format || "N/A"}
                </Typography>
              </Box>
              {poolDetails.poolPassword && (
                <TextField
                  label="Pool Password"
                  type={showPassword ? "text" : "password"}
                  value={poolPassword}
                  onChange={(e) => setPoolPassword(e.target.value)}
                  required
                  fullWidth
                  InputProps={{
                    sx: { fontFamily: "'Poppins', sans-serif'" },
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  inputProps={{ "aria-label": "Enter pool password", "aria-describedby": "pool-password-label" }}
                  disabled={loading}
                />
              )}
            </>
          )}
          <Box sx={{ display: "flex", gap: 2 }}>
            <StyledButton
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ backgroundColor: "#FF6B00", "&:hover": { backgroundColor: "#FF8E33" } }}
              aria-label="Find pool"
            >
              {loading ? "Searching..." : "Find Pool"}
            </StyledButton>
            <StyledButton
              variant="outlined"
              onClick={handleCancelJoinPool}
              disabled={loading}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Cancel and go back to dashboard"
            >
              Cancel
            </StyledButton>
          </Box>
        </Box>
      </FormContainer>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelConfirmDialog}
        aria-labelledby="join-pool-dialog-title"
        aria-describedby="join-pool-dialog-content"
      >
        <DialogTitle id="join-pool-dialog-title">Confirm Join Pool</DialogTitle>
        <DialogContent id="join-pool-dialog-content">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Are you sure you want to join the pool "{poolDetails?.poolName || "N/A"}" ({poolDetails?.sport || "N/A"} / {poolDetails?.format || "N/A"})?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelConfirmDialog}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel joining pool"
          >
            Cancel
          </Button>
          <Button
            onClick={handleJoinPool}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm joining pool"
            disabled={loading}
          >
            {loading ? "Joining..." : "Join"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default JoinPool;