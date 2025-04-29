import React, { useState, useEffect, useRef, useCallback } from "react";
import { getDb, getAnalyticsService } from "../../firebase/config";
import {
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  arrayUnion,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";

// MUI imports
import {
  Box,
  Typography,
  List,
  ListItem,
  Tooltip,
  Fade,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  styled,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

// Styled components for polished UI
const ListContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  boxShadow: theme.shadows[2],
  padding: theme.spacing(2),
  marginTop: theme.spacing(2),
  transition: theme.transitions.create("background-color", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  overflowX: "auto", // Ensure horizontal scrolling if needed
}));

const StripItem = styled(ListItem)(({ theme }) => ({
  marginBottom: theme.spacing(1),
  padding: theme.spacing(1),
  border: "1px solid",
  borderRadius: theme.shape.borderRadius / 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  transition: theme.transitions.create(["transform", "box-shadow", "border-color"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

function StripCardList({ poolId, poolData }) {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const [strips, setStrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userRole, setUserRole] = useState(null); // Track user role (commissioner, participant, or none)
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingStrip, setPendingStrip] = useState(null);
  const hasLoggedListLoad = useRef(false);
  const hasLoggedClaim = useRef(false);
  const hasLoggedError = useRef(false);
  const hasLoggedJoinPool = useRef(false);
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
          console.log(`StripCardList - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Fetch user role and strips data
  useEffect(() => {
    if (!poolId || !poolData || !user) {
      setError("Pool ID, pool data, or user authentication is missing.");
      console.error("StripCardList - Missing required data:", { poolId, poolData, user });
      setLoading(false);
      if (analytics && !hasLoggedError.current) {
        logEvent(analytics, "fetch_strips_failed", {
          poolId: poolId || "missing",
          userId: user?.uid || "anonymous",
          user_role: userRole || "unknown",
          error_message: "Pool ID, pool data, or user authentication is missing.",
          timestamp: new Date().toISOString(),
        });
        console.log("StripCardList - Fetch strips failure logged to Firebase Analytics");
        hasLoggedError.current = true;
      }
      return;
    }

    const fetchStrips = async () => {
      setLoading(true);
      setError("");

      // Determine user role
      let role = "none";
      if (user.uid === poolData.commissionerId) {
        role = "commissioner";
      } else {
        const participantDocRef = doc(db, "pools", poolId, "participants", user.uid);
        const participantDoc = await getDoc(participantDocRef);
        if (participantDoc.exists() || poolData.memberIds?.includes(user.uid)) {
          role = "participant";
        }
      }
      setUserRole(role);
      console.log("StripCardList - User role:", role);

      // Since strips are a field in poolData (not a subcollection), use poolData.strips
      const stripsData = poolData.strips || [];
      // Sort strips by stripNumber
      const sortedStrips = [...stripsData].sort((a, b) => a.number - b.number);
      setStrips(sortedStrips);
      setLoading(false);
      console.log("StripCardList - Fetched strips:", sortedStrips);

      // Validate strips data
      if (sortedStrips.length < 10) {
        console.warn("StripCardList - Expected at least 10 strips, got:", sortedStrips.length);
      }

      // Log strip card list load (only once)
      if (!hasLoggedListLoad.current && analytics) {
        logEvent(analytics, "strip_card_list_loaded", {
          poolId,
          userId: user.uid,
          user_role: role,
          stripCount: sortedStrips.length,
          timestamp: new Date().toISOString(),
        });
        console.log("StripCardList - List load logged to Firebase Analytics");
        hasLoggedListLoad.current = true;
      }
    };

    fetchStrips();

    // Reset logging flags when poolId or user changes
    hasLoggedListLoad.current = false;
    hasLoggedError.current = false;
    hasLoggedJoinPool.current = false;
  }, [poolId, poolData, user, userRole, analytics, db]); // Added db, user, and userRole to dependencies

  // Handle manual refresh
  const handleRefresh = () => {
    setLoading(true);
    setError("");
    console.log("StripCardList - Manual refresh triggered for poolId:", poolId);
    if (analytics) {
      logEvent(analytics, "strip_card_list_refreshed", {
        poolId,
        userId: user?.uid || "anonymous",
        user_role: userRole || "unknown",
        timestamp: new Date().toISOString(),
      });
      console.log("StripCardList - Refresh logged to Firebase Analytics");
    }
  };

  // Handle joining the pool
  const handleJoinPool = async () => {
    if (!user) {
      setError("Please log in to join the pool.");
      console.warn("handleJoinPool - User not logged in");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const participantRef = doc(db, "pools", poolId, "participants", user.uid);
      await setDoc(participantRef, {
        joinedAt: serverTimestamp(),
        displayName: user.displayName || user.email || "Anonymous",
      });
      console.log("StripCardList - User added to participants:", user.uid);

      // Update poolData.memberIds
      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, {
        memberIds: arrayUnion(user.uid),
        [`membersMeta.${user.uid}`]: { joinedAt: serverTimestamp() },
      });

      // Log join pool action (only once)
      if (analytics && !hasLoggedJoinPool.current) {
        logEvent(analytics, "join_pool_from_strip_card_list", {
          poolId,
          userId: user.uid,
          user_role: userRole || "unknown",
          timestamp: new Date().toISOString(),
        });
        console.log("StripCardList - Join pool action logged to Firebase Analytics");
        hasLoggedJoinPool.current = true;
      }

      // Retry fetching strips after joining
      setLoading(true);
      setError("");
    } catch (err) {
      console.error("StripCardList - Error joining pool:", err);
      let userFriendlyError = "Failed to join the pool.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to join this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      setLoading(false);
      if (analytics) {
        logEvent(analytics, "join_pool_failed", {
          poolId,
          userId: user?.uid || "anonymous",
          user_role: userRole || "unknown",
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("StripCardList - Join pool failure logged to Firebase Analytics");
      }
    }
  };

  // Handle claiming a strip card
  const handleClaimStrip = async (stripNumber, ownerId) => {
    if (!user) {
      setError("Please log in to claim a strip card.");
      console.warn("handleClaimStrip - User not logged in");
      return;
    }
    if (ownerId) {
      setError("Strip card already claimed!");
      console.warn("handleClaimStrip - Strip already claimed:", stripNumber);
      return;
    }
    if (poolData.status !== "open") {
      setError("Pool is not open for claiming strip cards.");
      console.warn("handleClaimStrip - Pool not open:", poolData.status);
      return;
    }

    setPendingStrip({ stripNumber, ownerId });
    setConfirmDialogOpen(true);
  };

  const confirmClaimStrip = async () => {
    if (!pendingStrip) return;

    const { stripNumber } = pendingStrip;

    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);

      // Use a transaction to ensure atomicity and prevent race conditions
      await withRetry("Claim Strip Transaction", () =>
        runTransaction(db, async (transaction) => {
          const poolDoc = await transaction.get(poolRef);
          if (!poolDoc.exists()) {
            throw new Error("Pool does not exist.");
          }

          const poolData = poolDoc.data();
          const stripIndex = poolData.strips.findIndex(strip => strip.number === stripNumber);
          if (stripIndex === -1) {
            throw new Error("Strip card does not exist.");
          }

          if (poolData.strips[stripIndex].userId) {
            throw new Error("Strip card has already been claimed by another user.");
          }

          const updatedStrips = [...poolData.strips];
          updatedStrips[stripIndex] = {
            ...updatedStrips[stripIndex],
            userId: user.uid,
            displayName: user.displayName || user.email || "Anonymous",
            claimedAt: serverTimestamp(),
          };

          transaction.update(poolRef, { strips: updatedStrips });
        })
      );

      setSuccessMessage("Strip card claimed successfully!");
      console.log("handleClaimStrip - Claimed strip:", stripNumber, "by user:", user.uid);

      // Log strip claim (only once)
      if (!hasLoggedClaim.current && analytics) {
        logEvent(analytics, "strip_card_claimed_success", {
          poolId,
          stripNumber,
          userId: user.uid,
          user_role: userRole || "unknown",
          timestamp: new Date().toISOString(),
        });
        console.log("StripCardList - Strip claim logged to Firebase Analytics");
        hasLoggedClaim.current = true;
      }
    } catch (err) {
      console.error("handleClaimStrip - Error:", err);
      let userFriendlyError = err.message || "Failed to claim strip card.";
      if (err.message.includes("already been claimed")) {
        userFriendlyError = "Strip card was claimed by another user. Please try another strip.";
      } else if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to claim strip cards in this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "strip_card_claimed_failure", {
          poolId,
          stripNumber,
          userId: user?.uid || "anonymous",
          user_role: userRole || "unknown",
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("StripCardList - Strip claim failure logged to Firebase Analytics");
      }
    } finally {
      setConfirmDialogOpen(false);
      setPendingStrip(null);
      hasLoggedClaim.current = false; // Reset for next claim
    }
  };

  const handleCancelClaim = () => {
    setConfirmDialogOpen(false);
    setPendingStrip(null);
    if (analytics) {
      logEvent(analytics, "strip_card_claim_canceled", {
        poolId,
        stripNumber: pendingStrip?.stripNumber,
        userId: user?.uid || "anonymous",
        user_role: userRole || "unknown",
        timestamp: new Date().toISOString(),
      });
      console.log("StripCardList - Strip claim canceled logged to Firebase Analytics");
    }
  };

  // Keyboard navigation handler for strips
  const handleKeyDown = (event, stripNumber, ownerId, index) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClaimStrip(stripNumber, ownerId);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (index + 1) % strips.length;
      const nextStrip = document.querySelector(`[data-strip-index="${nextIndex}"]`);
      if (nextStrip) nextStrip.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = (index - 1 + strips.length) % strips.length;
      const prevStrip = document.querySelector(`[data-strip-index="${prevIndex}"]`);
      if (prevStrip) prevStrip.focus();
    }
  };

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading strip cards" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: "center", mt: 2 }}>
        <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {error}
          <Box sx={{ mt: 1 }}>
            <Button
              onClick={handleRefresh}
              sx={{ fontFamily: "'Poppins', sans-serif'", mr: 1 }}
              startIcon={<RefreshIcon />}
              aria-label="Retry loading strip cards data"
            >
              Retry
            </Button>
            {userRole === "none" && (
              <Button
                onClick={handleJoinPool}
                sx={{ fontFamily: "'Poppins', sans-serif'", mr: 1 }}
                aria-label="Join this pool to view strip cards"
              >
                Join Pool
              </Button>
            )}
            <Button
              component="a"
              href="mailto:support@bonomosportspools.com"
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Contact support for strip cards access issue"
            >
              Contact Support
            </Button>
          </Box>
        </Alert>
      </Box>
    );
  }

  // Winners from parent poolData
  const winners = poolData?.winners || {};
  console.log("StripCardList - Winners:", winners);

  // Strip digits from poolData with validation
  const stripDigits = (Array.isArray(poolData.stripNumbers) && poolData.stripNumbers.length >= strips.length)
    ? poolData.stripNumbers
    : Array(strips.length).fill("?");

  return (
    <Fade in timeout={1000}>
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography
            variant="h6"
            sx={{
              fontFamily: "'Montserrat', sans-serif'",
              fontWeight: 700,
              color: mode === "dark" ? (theme) => theme.palette.text.primary : (theme) => theme.palette.text.primary,
            }}
          >
            Strip Cards
          </Typography>
          <Button
            onClick={handleRefresh}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            startIcon={<RefreshIcon />}
            aria-label="Refresh strip cards data"
          >
            Refresh
          </Button>
        </Box>

        <ListContainer>
          <List sx={{ p: 0 }} role="list" aria-label="List of strip cards">
            {strips.map((strip, index) => {
              const digit = stripDigits[index] !== undefined ? stripDigits[index] : "?";
              const isClaimed = !!strip.userId;
              const isQ1Winner = strip.number === winners.q1;
              const isQ2Winner = strip.number === winners.q2;
              const isQ3Winner = strip.number === winners.q3;
              const isFinalWinner = strip.number === winners.final;

              // Tooltip content
              const tooltipTitle = isClaimed
                ? `Claimed by: ${strip.displayName || "User " + strip.userId?.slice(0, 8)}\nStrip: ${strip.number} (Digit: ${digit})`
                : `Strip: ${strip.number} (Digit: ${digit})\nClick to claim`;

              const ariaLabel = isClaimed
                ? `Strip ${strip.number}, digit ${digit}, claimed by ${strip.displayName || "User " + strip.userId?.slice(0, 8)}, ${
                    isFinalWinner
                      ? "Final Winner"
                      : isQ1Winner
                      ? "Q1 Winner"
                      : isQ2Winner
                      ? "Q2 Winner"
                      : isQ3Winner
                      ? "Q3 Winner"
                      : "No winner"
                  }`
                : `Strip ${strip.number}, digit ${digit}, unclaimed, press to claim`;

              return (
                <Tooltip key={strip.number} title={tooltipTitle} arrow>
                  <StripItem
                    onClick={() => handleClaimStrip(strip.number, strip.userId)}
                    onKeyDown={(e) => handleKeyDown(e, strip.number, strip.userId, index)}
                    sx={{
                      backgroundColor: isFinalWinner
                        ? (theme) => theme.palette.secondary.main
                        : isQ1Winner || isQ2Winner || isQ3Winner
                        ? mode === "dark"
                          ? (theme) => theme.palette.grey[600]
                          : (theme) => theme.palette.grey[200]
                        : isClaimed
                        ? mode === "dark"
                          ? (theme) => theme.palette.grey[900]
                          : (theme) => theme.palette.grey[500]
                        : (theme) => theme.palette.grey[300],
                      color: isFinalWinner || isQ1Winner || isQ2Winner || isQ3Winner
                        ? (theme) => theme.palette.text.primary
                        : (theme) => theme.palette.text.contrastText,
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: "0.9rem",
                      borderColor: (theme) => theme.palette.divider,
                      cursor: isClaimed ? "not-allowed" : "pointer",
                      "&:hover": {
                        transform: !isClaimed ? "scale(1.02)" : "none",
                        boxShadow: !isClaimed ? (theme) => theme.shadows[2] : "none",
                        borderColor: !isClaimed ? (theme) => theme.palette.secondary.main : undefined,
                      },
                    }}
                    tabIndex={isClaimed ? -1 : 0}
                    role="listitem"
                    aria-label={ariaLabel}
                    data-strip-index={index} // For keyboard navigation
                  >
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 500, fontFamily: "'Poppins', sans-serif'" }}
                    >
                      Strip #{strip.number} (Digit: {digit})
                    </Typography>
                    {isClaimed && (
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "'Poppins', sans-serif'",
                          color: mode === "dark" ? (theme) => theme.palette.text.secondary : (theme) => theme.palette.grey[700],
                        }}
                      >
                        Claimed by {strip.displayName || "User " + strip.userId?.slice(0, 8)}
                      </Typography>
                    )}
                  </StripItem>
                </Tooltip>
              );
            })}
          </List>
        </ListContainer>

        {/* Legend */}
        <Box
          sx={{ mt: 2, display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}
          role="region"
          aria-label="Strip cards legend"
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Final Winner">
            <Box sx={{ width: 20, height: 20, bgcolor: (theme) => theme.palette.secondary.main, borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Final Winner
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Q1/Q2/Q3 Winner">
            <Box
              sx={{
                width: 20,
                height: 20,
                bgcolor: mode === "dark" ? (theme) => theme.palette.grey[600] : (theme) => theme.palette.grey[200],
                borderRadius: 2,
              }}
            />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Q1/Q2/Q3 Winner
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Claimed">
            <Box
              sx={{
                width: 20,
                height: 20,
                bgcolor: mode === "dark" ? (theme) => theme.palette.grey[900] : (theme) => theme.palette.grey[500],
                borderRadius: 2,
              }}
            />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Claimed
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Unclaimed">
            <Box sx={{ width: 20, height: 20, bgcolor: "grey.300", borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Unclaimed
            </Typography>
          </Box>
        </Box>

        {/* Confirmation Dialog for Claiming Strip Card */}
        <Dialog
          open={confirmDialogOpen}
          onClose={handleCancelClaim}
          aria-labelledby="confirm-claim-title"
          aria-describedby="confirm-claim-content"
        >
          <DialogTitle id="confirm-claim-title">
            Confirm Strip Card Claim
          </DialogTitle>
          <DialogContent id="confirm-claim-content">
            <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Are you sure you want to claim Strip Card #{pendingStrip?.stripNumber}?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={handleCancelClaim}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Cancel strip card claim"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmClaimStrip}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Confirm strip card claim"
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
      </Box>
    </Fade>
  );
}

export default StripCardList;