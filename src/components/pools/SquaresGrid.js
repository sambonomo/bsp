import React, { useState, useEffect, useRef } from "react";
import { getDb, getAnalyticsService } from "../../firebase/config";
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";
import debounce from "lodash/debounce";

// MUI imports
import {
  Box,
  Typography,
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

// Styled components for polished UI
const GridContainer = styled(Box)(({ theme }) => {
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "60px repeat(10, 60px)" : "72px repeat(10, 72px)",
    gridTemplateRows: isMobile ? "60px repeat(10, 60px)" : "72px repeat(10, 72px)",
    gap: "2px",
    backgroundColor: theme.palette.mode === "dark" ? "#1a2b4d" : "#e0e7ff",
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius * 2,
    border: "2px solid",
    borderColor: theme.palette.mode === "dark" ? "#ff9500" : "#3b82f6",
    boxShadow: theme.shadows[4],
    transition: theme.transitions.create("background-color", {
      duration: theme.transitions.duration.standard,
      easing: theme.transitions.easing.easeInOut,
    }),
    margin: "0 auto",
    width: "100%",
    maxWidth: isMobile ? "708px" : "840px",
    boxSizing: "border-box",
  };
});

const AxisLabel = styled(Box)(({ theme }) => {
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return {
    backgroundColor: theme.palette.mode === "dark" ? "#2c3e50" : "#3b82f6",
    color: "#ffffff",
    fontFamily: "'Poppins', sans-serif'",
    fontWeight: 700,
    fontSize: isMobile ? "1.2rem" : "1.32rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid",
    borderColor: theme.palette.mode === "dark" ? "#ff9500" : "#1e40af",
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
  };
});

const Square = styled(Button)(({ theme }) => ({
  padding: 0,
  fontFamily: "'Poppins', sans-serif'",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid",
  borderRadius: theme.shape.borderRadius,
  cursor: "pointer",
  transition: theme.transitions.create(["transform", "box-shadow", "border-color"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    transform: "scale(1.1)",
    boxShadow: theme.shadows[3],
  },
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.mode === "dark" ? "#ff9500" : "#3b82f6"}`,
    outlineOffset: 2,
    boxShadow: `0 0 0 4px rgba(59, 130, 246, 0.3)`,
  },
  "&:disabled": {
    cursor: "not-allowed",
    opacity: 0.7,
  },
}));

function SquaresGrid({ poolId, poolData }) {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [squares, setSquares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingSquare, setPendingSquare] = useState(null);
  const [action, setAction] = useState("");
  const [userRole, setUserRole] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedGridLoad = useRef(false);
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
          console.log(`SquaresGrid - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Fetch squares data with live updates
  useEffect(() => {
    if (!poolId || !poolData || !user) {
      setError("Pool ID, pool data, or user authentication is missing.");
      console.error("SquaresGrid - Missing required data:", { poolId, poolData, user });
      setLoading(false);
      if (analytics && !hasLoggedError.current) {
        logEvent(analytics, "fetch_squares_failed", {
          poolId: poolId || "missing",
          userId: user?.uid || "anonymous",
          user_role: userRole || "unknown",
          error_message: "Pool ID, pool data, or user authentication is missing.",
          timestamp: new Date().toISOString(),
        });
        console.log("SquaresGrid - Fetch squares failure logged to Firebase Analytics");
        hasLoggedError.current = true;
      }
      return;
    }

    const fetchSquares = async () => {
      setLoading(true);
      setError("");

      // Fetch the pool document from Firestore to verify commissionerId and get squares
      const poolRef = doc(db, "pools", poolId);
      let poolDoc;
      try {
        poolDoc = await getDoc(poolRef);
      } catch (err) {
        console.error("SquaresGrid - Error fetching pool document:", err);
        setError("Failed to fetch pool data. Please try again.");
        setLoading(false);
        return;
      }

      if (!poolDoc.exists()) {
        console.error("SquaresGrid - Pool does not exist:", poolId);
        setError("This pool does not exist.");
        setLoading(false);
        return;
      }

      const poolDataFromFirestore = poolDoc.data();
      console.log("SquaresGrid - Firestore pool data:", poolDataFromFirestore);

      // Determine user role and commissioner status
      let role = "none";
      if (!poolDataFromFirestore.commissionerId) {
        console.error("SquaresGrid - Pool missing commissionerId:", poolId);
        setError("Pool configuration error: Missing commissioner ID.");
        setLoading(false);
        return;
      }

      if (user.uid === poolDataFromFirestore.commissionerId) {
        role = "commissioner";
      } else {
        const participantDocRef = doc(db, "pools", poolId, "participants", user.uid);
        const participantDoc = await getDoc(participantDocRef);
        if (participantDoc.exists() || poolDataFromFirestore.memberIds?.includes(user.uid)) {
          role = "participant";
        }
      }
      setUserRole(role);
      console.log("SquaresGrid - User role:", role);
      console.log("SquaresGrid - User UID:", user.uid);
      console.log("SquaresGrid - Pool commissionerId (Firestore):", poolDataFromFirestore.commissionerId);
      console.log("SquaresGrid - Pool commissionerId (poolData prop):", poolData.commissionerId);
      console.log("SquaresGrid - User in participants:", role === "participant");
      console.log("SquaresGrid - User in memberIds:", poolDataFromFirestore.memberIds?.includes(user.uid));

      // Fetch squares from the pool document's 'squares' field (not a subcollection)
      const unsubscribe = onSnapshot(poolRef, (docSnap) => {
        if (!docSnap.exists()) {
          setError("Pool no longer exists.");
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        const squaresData = data.squares || {};

        // Convert squares object to array format expected by the grid
        const squaresArray = Object.entries(squaresData).map(([id, square]) => ({
          id,
          ...square,
        }));
        setSquares(squaresArray);
        setLoading(false);
        console.log("SquaresGrid - Fetched squares:", squaresArray);

        // Validate squares data
        if (squaresArray.length !== 100) {
          console.warn("SquaresGrid - Expected 100 squares for a 10x10 grid, got:", squaresArray.length);
        }

        // Log grid load (only once)
        if (!hasLoggedGridLoad.current && analytics) {
          logEvent(analytics, "squares_grid_loaded", {
            poolId,
            userId: user.uid,
            user_role: role,
            squareCount: squaresArray.length,
            timestamp: new Date().toISOString(),
          });
          console.log("SquaresGrid - Grid load logged to Firebase Analytics");
          hasLoggedGridLoad.current = true;
        }
      }, (err) => {
        console.error("SquaresGrid - Error fetching squares:", err);
        let userFriendlyError = "Failed to fetch squares data.";
        if (err.code === "permission-denied") {
          userFriendlyError = `You do not have permission to view squares for this pool (Role: ${role}). Please contact support.`;
        } else if (err.code === "unavailable") {
          userFriendlyError = "Firestore is currently unavailable. Please try again later.";
        }
        setError(userFriendlyError);
        setLoading(false);
        if (analytics && !hasLoggedError.current) {
          logEvent(analytics, "fetch_squares_failed", {
            poolId,
            userId: user.uid,
            user_role: role,
            pool_commissioner_id: poolDataFromFirestore.commissionerId,
            user_in_participants: role === "participant",
            user_in_member_ids: poolDataFromFirestore.memberIds?.includes(user.uid),
            squares_count: squares.length,
            axis_numbers_x: poolDataFromFirestore.axisNumbers?.x?.length || "missing",
            axis_numbers_y: poolDataFromFirestore.axisNumbers?.y?.length || "missing",
            error_message: userFriendlyError,
            timestamp: new Date().toISOString(),
          });
          console.log("SquaresGrid - Fetch squares failure logged to Firebase Analytics");
          hasLoggedError.current = true;
        }
      });

      return () => {
        unsubscribe();
        console.log("SquaresGrid - Unsubscribed from live updates for poolId:", poolId);
      };
    };

    fetchSquares();

    // Reset logging flags when poolId or user changes
    hasLoggedGridLoad.current = false;
    hasLoggedError.current = false;
    hasLoggedJoinPool.current = false;
  }, [poolId, user, poolData, analytics]);

  // Debounced handleRefresh to prevent rapid successive calls
  const handleRefresh = debounce(() => {
    setLoading(true);
    setError("");
    console.log("SquaresGrid - Manual refresh triggered for poolId:", poolId);
    if (analytics) {
      logEvent(analytics, "squares_grid_refreshed", {
        poolId,
        userId: user?.uid || "anonymous",
        user_role: userRole || "unknown",
        timestamp: new Date().toISOString(),
      });
      console.log("SquaresGrid - Refresh logged to Firebase Analytics");
    }
  }, 1000);

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
      // Ensure displayName is fetched from Firebase Auth user profile
      const displayName = user.displayName || user.email?.split("@")[0] || "Anonymous";
      const participantRef = doc(db, "pools", poolId, "participants", user.uid);
      await setDoc(participantRef, {
        joinedAt: new Date().toISOString(),
        displayName: displayName,
      });
      console.log("SquaresGrid - User added to participants:", user.uid, "with displayName:", displayName);

      // Update poolData.memberIds
      const poolRef = doc(db, "pools", poolId);
      await updateDoc(poolRef, {
        memberIds: arrayUnion(user.uid),
        [`membersMeta.${user.uid}`]: { joinedAt: new Date().toISOString(), displayName: displayName },
      });

      // Log join pool action (only once)
      if (analytics && !hasLoggedJoinPool.current) {
        logEvent(analytics, "join_pool_from_squares_grid", {
          poolId,
          userId: user.uid,
          user_role: userRole || "unknown",
          timestamp: new Date().toISOString(),
        });
        console.log("SquaresGrid - Join pool action logged to Firebase Analytics");
        hasLoggedJoinPool.current = true;
      }

      // Retry fetching squares after joining
      setLoading(true);
      setError("");
    } catch (err) {
      console.error("SquaresGrid - Error joining pool:", err);
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
        console.log("SquaresGrid - Join pool failure logged to Firebase Analytics");
      }
    }
  };

  // Handle square click (claim or unclaim)
  const handleSquareClick = (squareId, ownerId) => {
    if (!user) {
      setError("Please log in to interact with squares.");
      console.warn("handleSquareClick - User not logged in");
      return;
    }
    if (poolData.status !== "open") {
      setError("Pool is not open for claiming squares.");
      console.warn("handleSquareClick - Pool not open:", poolData.status);
      return;
    }

    const square = squares.find(s => s.id === squareId);
    if (!square) {
      setError(`Square ${squareId} not found. Please refresh and try again.`);
      console.warn("handleSquareClick - Square not found:", squareId);
      return;
    }

    if (ownerId === user.uid) {
      // User owns the square, prompt to unclaim
      setAction("unclaim");
      setPendingSquare({ squareId, ownerId });
      setConfirmDialogOpen(true);
    } else if (ownerId) {
      // Square is claimed by someone else, prompt to reassign
      setAction("claim");
      setPendingSquare({ squareId, ownerId });
      setConfirmDialogOpen(true);
    } else {
      // Square is available, claim it
      setAction("claim");
      setPendingSquare({ squareId, ownerId });
      setConfirmDialogOpen(true);
    }
  };

  // Handle claiming a square
  const handleClaimSquare = async (squareId, ownerId) => {
    if (ownerId) {
      // Should be handled by dialog, but double-check
      setError("Square already claimed!");
      console.warn("handleClaimSquare - Square already claimed:", squareId);
      return;
    }

    try {
      setError("");
      // Ensure displayName is fetched from Firebase Auth user profile
      const displayName = user.displayName || user.email?.split("@")[0] || "Anonymous";
      const poolRef = doc(db, "pools", poolId);
      const squareData = squares.find(s => s.id === squareId);
      if (!squareData) {
        throw new Error("Square not found in state.");
      }

      // Update the squares object in the pool document
      await withRetry("Claim Square", () =>
        updateDoc(poolRef, {
          [`squares.${squareId}`]: {
            ...squareData,
            userId: user.uid,
            displayName: displayName,
            status: "claimed",
            claimedAt: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          },
        })
      );

      setSuccessMessage("Square claimed successfully!");
      console.log("handleClaimSquare - Claimed square:", squareId, "by user:", user.uid, "with displayName:", displayName);

      // Log square claim (only once)
      if (!hasLoggedClaim.current && analytics) {
        logEvent(analytics, "square_claimed_success", {
          poolId,
          squareId,
          userId: user.uid,
          user_role: userRole || "unknown",
          timestamp: new Date().toISOString(),
        });
        console.log("SquaresGrid - Square claim logged to Firebase Analytics");
        hasLoggedClaim.current = true;
      }
    } catch (err) {
      console.error("handleClaimSquare - Error:", err);
      let userFriendlyError = "Failed to claim square.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to claim squares in this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "square_claimed_failure", {
          poolId,
          squareId,
          userId: user?.uid || "anonymous",
          user_role: userRole || "unknown",
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("SquaresGrid - Square claim failure logged to Firebase Analytics");
      }
    }
  };

  // Handle unclaiming a square
  const handleUnclaimSquare = async (squareId) => {
    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);
      const squareData = squares.find(s => s.id === squareId);
      if (!squareData) {
        throw new Error("Square not found in state.");
      }

      await withRetry("Unclaim Square", () =>
        updateDoc(poolRef, {
          [`squares.${squareId}`]: {
            ...squareData,
            userId: null,
            displayName: null,
            status: "available",
            claimedAt: null,
            updatedAt: serverTimestamp(),
          },
        })
      );

      setSuccessMessage("Square unclaimed successfully!");
      console.log("handleUnclaimSquare - Unclaimed square:", squareId, "by user:", user.uid);

      if (analytics) {
        logEvent(analytics, "square_unclaimed_success", {
          poolId,
          squareId,
          userId: user.uid,
          user_role: userRole || "unknown",
          timestamp: new Date().toISOString(),
        });
        console.log("SquaresGrid - Square unclaim logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleUnclaimSquare - Error:", err);
      let userFriendlyError = "Failed to unclaim square.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to unclaim squares in this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "square_unclaimed_failure", {
          poolId,
          squareId,
          userId: user?.uid || "anonymous",
          user_role: userRole || "unknown",
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("SquaresGrid - Square unclaim failure logged to Firebase Analytics");
      }
    }
  };

  const confirmAction = async () => {
    if (!pendingSquare) return;

    const { squareId, ownerId } = pendingSquare;
    if (action === "claim") {
      await handleClaimSquare(squareId, ownerId);
    } else if (action === "unclaim") {
      await handleUnclaimSquare(squareId);
    }
    setConfirmDialogOpen(false);
    setPendingSquare(null);
    setAction("");
    hasLoggedClaim.current = false; // Reset for next claim
  };

  const handleCancelAction = () => {
    setConfirmDialogOpen(false);
    setPendingSquare(null);
    setAction("");
    if (analytics) {
      logEvent(analytics, "square_action_canceled", {
        poolId,
        squareId: pendingSquare?.squareId,
        userId: user?.uid || "anonymous",
        user_role: userRole || "unknown",
        action,
        timestamp: new Date().toISOString(),
      });
      console.log("SquaresGrid - Square action canceled logged to Firebase Analytics");
    }
  };

  // Keyboard navigation handler for squares
  const handleKeyDown = (event, squareId, ownerId, row, col) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSquareClick(squareId, ownerId);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      const nextCol = (col + 1) % 10;
      const nextIndex = row * 10 + nextCol;
      const nextSquare = document.querySelector(`[data-square-index="${nextIndex}"]`);
      if (nextSquare) nextSquare.focus();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prevCol = (col - 1 + 10) % 10;
      const prevIndex = row * 10 + prevCol;
      const prevSquare = document.querySelector(`[data-square-index="${prevIndex}"]`);
      if (prevSquare) prevSquare.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextRow = (row + 1) % 10;
      const nextIndex = nextRow * 10 + col;
      const nextSquare = document.querySelector(`[data-square-index="${nextIndex}"]`);
      if (nextSquare) nextSquare.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevRow = (row - 1 + 10) % 10;
      const prevIndex = prevRow * 10 + col;
      const prevSquare = document.querySelector(`[data-square-index="${prevIndex}"]`);
      if (prevSquare) prevSquare.focus();
    }
  };

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null;
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading squares grid" />
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
              aria-label="Retry loading squares data"
            >
              Retry
            </Button>
            {userRole === "none" && (
              <Button
                onClick={handleJoinPool}
                sx={{ fontFamily: "'Poppins', sans-serif'", mr: 1 }}
                aria-label="Join this pool to participate"
              >
                Join Pool
              </Button>
            )}
            <Button
              component="a"
              href="mailto:support@bonomosportspools.com"
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Contact support for squares grid access issue"
            >
              Contact Support
            </Button>
          </Box>
        </Alert>
      </Box>
    );
  }

  // For winner highlighting
  const winners = poolData?.winners || {};
  console.log("SquaresGrid - Winners:", winners);

  // Axis digits from poolData with validation
  const xAxis = (Array.isArray(poolData.axisNumbers?.x) && poolData.axisNumbers.x.length === 10)
    ? poolData.axisNumbers.x
    : Array(10).fill("?");
  const yAxis = (Array.isArray(poolData.axisNumbers?.y) && poolData.axisNumbers.y.length === 10)
    ? poolData.axisNumbers.y
    : Array(10).fill("?");
  console.log("SquaresGrid - xAxis:", xAxis);
  console.log("SquaresGrid - yAxis:", yAxis);

  // Ensure squares array has 100 elements (10x10 grid)
  const expectedSquares = Array.from({ length: 100 }, (_, i) => ({
    id: `square-${i + 1}`,
    userId: null,
    displayName: null,
    claimedAt: null,
    status: "available",
    row: Math.floor(i / 10),
    col: i % 10,
  }));

  // Map squares to their correct positions (square-1 to square-100)
  const sortedSquares = expectedSquares.map((defaultSquare) => {
    const foundSquare = squares.find(s => s.id === defaultSquare.id);
    return foundSquare || defaultSquare;
  });

  return (
    <Fade in timeout={1000}>
      <Box sx={{ textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", mb: 3 }}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: "'Montserrat', sans-serif'",
              fontWeight: 700,
              color: mode === "dark" ? (theme) => theme.palette.text.primary : (theme) => theme.palette.text.primary,
              mr: 2,
            }}
          >
            Squares Grid (10x10)
          </Typography>
          <Button
            onClick={handleRefresh}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            startIcon={<RefreshIcon />}
            aria-label="Refresh squares grid data"
          >
            Refresh
          </Button>
        </Box>

        <GridContainer role="grid" aria-label="Squares grid">
          {/* Top-left corner (empty) */}
          <Box sx={{ backgroundColor: "transparent" }} />

          {/* X-axis labels (top row) */}
          {xAxis.map((digit, index) => (
            <AxisLabel
              key={`x-${index}`}
              role="columnheader"
              aria-label={`Column ${index + 1} digit: ${digit !== "?" ? digit : "Unknown"}`}
            >
              {digit}
            </AxisLabel>
          ))}

          {/* Y-axis labels and squares */}
          {sortedSquares.map((sq, index) => {
            const row = sq.row;
            const col = sq.col;

            // If this is the first square in a row, add the Y-axis label
            const yLabel = col === 0 ? (
              <AxisLabel
                key={`y-${row}`}
                role="rowheader"
                aria-label={`Row ${row + 1} digit: ${yAxis[row] !== "?" ? yAxis[row] : "Unknown"}`}
              >
                {yAxis[row]}
              </AxisLabel>
            ) : null;

            const isClaimed = sq.status === "claimed" && !!sq.userId;
            const isQ1Winner = sq.id === `square-${winners.q1}`;
            const isQ2Winner = sq.id === `square-${winners.q2}`;
            const isQ3Winner = sq.id === `square-${winners.q3}`;
            const isFinalWinner = sq.id === `square-${winners.final}`;

            // Tooltip content
            const tooltipTitle = isClaimed
              ? `Claimed by: ${sq.displayName || "User " + sq.userId?.slice(0, 8) || "Unknown"}`
              : `Click to claim`;

            const ariaLabel = isClaimed
              ? `Square ${index + 1}, claimed by ${sq.displayName || "User " + sq.userId?.slice(0, 8) || "Unknown"}, ${
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
              : `Square ${index + 1}, unclaimed, press to claim`;

            return [
              yLabel,
              <Tooltip key={sq.id} title={tooltipTitle} arrow>
                <Square
                  onClick={() => handleSquareClick(sq.id, sq.userId)}
                  onKeyDown={(e) => handleKeyDown(e, sq.id, sq.userId, row, col)}
                  sx={{
                    minWidth: isMobile ? "60px" : "72px",
                    minHeight: isMobile ? "60px" : "72px",
                    backgroundColor: isFinalWinner
                      ? mode === "dark" ? "#ff9500" : "#f97316"
                      : isQ1Winner || isQ2Winner || isQ3Winner
                      ? mode === "dark" ? "#6b7280" : "#9ca3af"
                      : isClaimed
                      ? "#facc15"
                      : mode === "dark" ? "#d1d5db" : "#ffffff",
                    color: isFinalWinner || isQ1Winner || isQ2Winner || isQ3Winner
                      ? "#ffffff"
                      : isClaimed
                      ? "#1e40af"
                      : theme.palette.text.primary,
                    fontSize: isMobile ? "1.08rem" : "1.2rem",
                    borderColor: mode === "dark" ? "#ff9500" : "#3b82f6",
                    "&:hover": {
                      borderColor: mode === "dark" ? "#f97316" : "#1e40af",
                      backgroundColor: isFinalWinner
                        ? mode === "dark" ? "#fb923c" : "#fb923c"
                        : isQ1Winner || isQ2Winner || isQ3Winner
                        ? mode === "dark" ? "#9ca3af" : "#d1d5db"
                        : isClaimed
                        ? "#fef08a"
                        : theme.palette.grey[300],
                    },
                  }}
                  aria-label={ariaLabel}
                  data-square-index={index}
                  tabIndex={0}
                >
                  {isFinalWinner ? "🏆" : isQ1Winner || isQ2Winner || isQ3Winner ? "⭐" : isClaimed ? (sq.displayName || "Claimed") : "Empty"}
                </Square>
              </Tooltip>,
            ].filter(Boolean);
          }).flat()}
        </GridContainer>

        {/* Legend */}
        <Box
          sx={{ mt: 3, display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}
          role="region"
          aria-label="Squares grid legend"
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Final Winner">
            <Box sx={{ width: 24, height: 24, bgcolor: (theme) => theme.palette.mode === "dark" ? "#ff9500" : "#f97316", borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: "1rem" }}>
              Final Winner
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Q1/Q2/Q3 Winner">
            <Box
              sx={{
                width: 24,
                height: 24,
                bgcolor: mode === "dark" ? (theme) => "#6b7280" : (theme) => "#9ca3af",
                borderRadius: 2,
              }}
            />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: "1rem" }}>
              Q1/Q2/Q3 Winner
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Claimed">
            <Box
              sx={{
                width: 24,
                height: 24,
                bgcolor: "#facc15",
                borderRadius: 2,
              }}
            />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: "1rem" }}>
              Claimed
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Legend item: Unclaimed">
            <Box sx={{ width: 24, height: 24, bgcolor: mode === "dark" ? "#d1d5db" : "#ffffff", borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: "1rem" }}>
              Unclaimed
            </Typography>
          </Box>
        </Box>

        {/* Confirmation Dialog for Claiming/Unclaiming Square */}
        <Dialog
          open={confirmDialogOpen}
          onClose={handleCancelAction}
          aria-labelledby="confirm-action-title"
          aria-describedby="confirm-action-content"
        >
          <DialogTitle id="confirm-action-title">
            {action === "unclaim" ? "Unclaim Square" : "Claim Square"}
          </DialogTitle>
          <DialogContent id="confirm-action-content">
            <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              {action === "unclaim"
                ? `Are you sure you want to unclaim Square ${pendingSquare?.squareId}?`
                : pendingSquare?.ownerId
                ? `This square is already claimed by ${pendingSquare?.ownerId === user.uid ? "you" : "another user"}. Do you want to reassign it to yourself?`
                : `Are you sure you want to claim Square ${pendingSquare?.squareId}?`}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={handleCancelAction}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label={action === "unclaim" ? "Cancel unclaim square" : "Cancel claim square"}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label={action === "unclaim" ? "Confirm unclaim square" : "Confirm claim square"}
            >
              {action === "unclaim" ? "Unclaim" : "Claim"}
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

export default SquaresGrid;