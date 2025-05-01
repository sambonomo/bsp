// /src/components/pools/SquaresGrid.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { getDb, getAnalyticsService } from "../../firebase/config";
import {
  doc,
  // getDoc, // Removed unused import
  onSnapshot,
  updateDoc,
  serverTimestamp,
  // setDoc, // Removed unused import
  // arrayUnion, // Removed unused import
  collection, // Import collection
  query, // Import query
  // writeBatch, // Removed unused import
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";
import debounce from "lodash/debounce";

// MUI imports (assuming these are unchanged)
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

// Styled components (assuming these are unchanged)
const GridContainer = styled(Box)(({ theme }) => {
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "60px repeat(10, 60px)"
      : "72px repeat(10, 72px)",
    gridTemplateRows: isMobile
      ? "60px repeat(10, 60px)"
      : "72px repeat(10, 72px)",
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
  transition: theme.transitions.create(
    ["transform", "box-shadow", "border-color"],
    {
      duration: theme.transitions.duration.standard,
      easing: theme.transitions.easing.easeInOut,
    }
  ),
  "&:hover": {
    transform: "scale(1.1)",
    boxShadow: theme.shadows[3],
  },
  "&:focus-visible": {
    outline: `2px solid ${
      theme.palette.mode === "dark" ? "#ff9500" : "#3b82f6"
    }`,
    outlineOffset: 2,
    boxShadow: `0 0 0 4px rgba(59, 130, 246, 0.3)`,
  },
  "&:disabled": {
    cursor: "not-allowed",
    opacity: 0.7,
  },
}));

// -----------------------------
// Main Component
// -----------------------------
function SquaresGrid({ poolId, poolData }) { // poolData might still be useful for axis numbers, winners etc.
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [squares, setSquares] = useState([]); // Will store squares from subcollection
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingSquare, setPendingSquare] = useState(null); // Store the full square object
  const [action, setAction] = useState("");
  const [userRole, setUserRole] = useState(null); // Still useful to determine role
  const [analytics, setAnalytics] = useState(null);

  const hasLoggedGridLoad = useRef(false);
  const hasLoggedClaim = useRef(false);
  // const hasLoggedError = useRef(false); // Removed unused ref
  // const hasLoggedJoinPool = useRef(false); // Removed unused ref

  const db = getDb();

  // 1) Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // 2) Determine User Role based on poolData prop (passed from parent)
  useEffect(() => {
    if (!user || !poolData) {
      setUserRole("none");
      return;
    }
    let currentRole = "none"; // Use local var to avoid stale state in console log
    if (poolData.commissionerId === user.uid) {
      currentRole = "commissioner";
    } else if (poolData.memberIds?.includes(user.uid)) {
      currentRole = "participant";
    }
    setUserRole(currentRole);
    console.log("SquaresGrid - User Role:", currentRole, "Pool Status:", poolData?.status); // Debug log
  }, [poolData, user]); // Removed userRole from dependency array

  // 3) Retry helper (Unchanged)
  const withRetry = useCallback(async (
    operation,
    callback,
    maxRetries = 3,
    retryDelayBase = 1000
  ) => {
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
          console.log(
            `SquaresGrid - ${operation} retry attempt ${attempt} logged to Firebase Analytics`
          );
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(
          `${operation} - Attempt ${attempt} failed: ${
            error.message
          }. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [analytics, user?.uid]); // Added dependencies

  // 4) Fetch squares data from SUBCOLLECTION with real-time updates
  useEffect(() => {
    // Early exit if essential data is missing
    if (authLoading || !user || !poolId) {
        setLoading(false); // Stop loading if we can't proceed
        if (!authLoading && !user) setError("Please log in to view squares.");
        if (!poolId) setError("Pool ID is missing.");
        return;
    }

    // Skip fetch if userRole isn't determined yet (prevents potential race condition)
    if (userRole === null) {
        console.log("SquaresGrid - Waiting for userRole determination...");
        return;
    }

    setLoading(true);
    setError("");

    // Reference to the squares SUBCOLLECTION
    const squaresCollectionRef = collection(db, "pools", poolId, "squares");
    const q = query(squaresCollectionRef); // Simple query to get all squares

    console.log(`SquaresGrid - Setting up listener for: pools/${poolId}/squares`); // Debug log

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        console.log(`SquaresGrid - Snapshot received, ${querySnapshot.size} docs.`); // Debug log
        const squaresArray = [];
        querySnapshot.forEach((doc) => {
          // IMPORTANT: Ensure basic structure exists, especially row/col
          const data = doc.data();
          if (typeof data.row === 'number' && typeof data.col === 'number') {
             squaresArray.push({ id: doc.id, ...data });
          } else {
             console.warn(`Square document ${doc.id} is missing row/col, skipping.`);
          }
        });

        // Sort by row then col to ensure consistent order
        squaresArray.sort((a, b) => a.row * 10 + a.col - (b.row * 10 + b.col));

        setSquares(squaresArray);
        setLoading(false);

        // Check if we got 100 squares - might indicate initialization needed
        if (squaresArray.length !== 100 && userRole === 'commissioner') {
           console.warn(
             "SquaresGrid - Expected 100 squares, got:",
             squaresArray.length,
             "Consider adding an initialization button for the commissioner."
           );
           // Optionally setError("Grid might need initialization by commissioner.");
        }

        // Log grid load once
        if (!hasLoggedGridLoad.current && analytics) {
          logEvent(analytics, "squares_grid_loaded", {
            poolId,
            userId: user.uid,
            user_role: userRole || "unknown", // Use determined role
            squareCount: squaresArray.length,
            timestamp: new Date().toISOString(),
          });
          console.log("SquaresGrid - Grid load logged to analytics");
          hasLoggedGridLoad.current = true;
        }
      },
      (snapErr) => {
        console.error("SquaresGrid - Error in onSnapshot:", snapErr);
        // Check for permission errors specifically
        if (snapErr.code === 'permission-denied') {
           setError("Permission Denied: You might not be a member of this pool or the pool data is inaccessible. Please check Firestore rules and your membership status.");
        } else {
           setError(`Failed to retrieve squares data in real-time: ${snapErr.message}`);
        }
        setLoading(false);
      }
    );

    return () => {
        console.log(`SquaresGrid - Cleaning up listener for: pools/${poolId}/squares`); // Debug log
        unsubscribe(); // Cleanup listener on unmount
    }
  }, [poolId, user, db, analytics, authLoading, userRole]); // Added dependencies

  // 5) Manual refresh - Refetch squares (though onSnapshot handles real-time)
  const handleRefresh = useCallback(debounce(() => {
    // Since we use onSnapshot, a manual "refresh" isn't strictly necessary
    // unless we want to force a re-evaluation or clear errors.
    setError("");
    setSuccessMessage(""); // Clear success messages too
    console.log("SquaresGrid - Refresh triggered (cleared messages/errors).");
    if (analytics) {
      logEvent(analytics, "squares_grid_refreshed", {
        poolId,
        userId: user?.uid, // Use optional chaining
        user_role: userRole || "unknown",
        timestamp: new Date().toISOString(),
      });
      console.log("SquaresGrid - Refresh logged to analytics");
    }
  }, 1000), [poolId, user?.uid, userRole, analytics]); // Fixed dependencies

  // 6) handleJoinPool - Removed for clarity

  // 7) handleSquareClick - Opens confirmation dialog
  const handleSquareClick = useCallback((square) => { // Pass the full square object
    console.log("SquaresGrid - handleSquareClick:", square, "User Role:", userRole, "Pool Status:", poolData?.status); // Debug log
    if (!user) {
      setError("You must be logged in to claim squares.");
      return;
    }
    if (poolData?.status !== "open") {
      setError(`This pool is not open for claiming squares (Status: ${poolData?.status || 'Unknown'}).`);
      return;
    }
    if (!square || !square.id) {
      setError(`Invalid square data, please refresh.`);
      return;
    }

    // Determine action based on current owner
    if (square.userId === user.uid) {
      setAction("unclaim");
    } else if (square.userId) {
      // Square is claimed by someone else - regular users cannot take it
      // Commissioners might be allowed via rules, but UI should reflect this
       if (userRole === 'commissioner') {
           // TODO: Optionally allow commissioner to force claim/unclaim via dialog
           setError(`Square ${square.row + 1}-${square.col + 1} is claimed by ${square.displayName || 'another user'}. Commissioner override not implemented.`);
           return; // Prevent opening dialog for now
       } else {
           setError(`Square ${square.row + 1}-${square.col + 1} is already claimed.`);
           return; // Regular users cannot claim owned squares
       }
    } else {
      // Square is unclaimed
      setAction("claim");
    }

    setPendingSquare(square); // Store the full square object
    setConfirmDialogOpen(true);
  }, [user, poolData?.status, userRole]); // Added dependencies

  // 8) Actually claim - Update the specific square DOCUMENT
  const handleClaimSquare = useCallback(async (squareToClaim) => {
    if (!user || !squareToClaim || !squareToClaim.id) {
       setError("Cannot claim square: Missing user or square data.");
       return;
    }
    // Double check if already claimed (race condition)
    const currentSquareData = squares.find(s => s.id === squareToClaim.id); // Get latest from state
    if (currentSquareData?.userId) {
      setError(`Square ${squareToClaim.row + 1}-${squareToClaim.col + 1} was already claimed.`);
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      const displayName = user.displayName || user.email?.split("@")[0] || "Anonymous";
      // Reference to the specific square DOCUMENT in the subcollection
      const squareRef = doc(db, "pools", poolId, "squares", squareToClaim.id);

      const updateData = {
        userId: user.uid,
        displayName: displayName,
        status: "claimed", // Assuming you have a status field
        claimedAt: serverTimestamp(), // Use server timestamp for consistency
        // Only include fields defined in your data model & rules
        // We don't need to send row/col as they shouldn't change
      };

      console.log("Attempting to claim square:", squareToClaim.id, "Ref Path:", squareRef.path, "with data:", updateData); // Debug log

      await withRetry("Claim Square", () =>
        // Use updateDoc, not setDoc unless you want to overwrite entirely
        updateDoc(squareRef, updateData)
      );

      setSuccessMessage(`Square ${squareToClaim.row + 1}-${squareToClaim.col + 1} claimed successfully!`);
      if (!hasLoggedClaim.current && analytics) {
        logEvent(analytics, "square_claimed_success", {
          poolId,
          squareId: squareToClaim.id,
          userId: user.uid,
          timestamp: new Date().toISOString(),
        });
        hasLoggedClaim.current = true; // Log only first success per session
      }
    } catch (err) {
      console.error("SquaresGrid - handleClaimSquare error:", err);
      if (err.code === 'permission-denied') {
         setError("Permission Denied: Failed to claim square. Ensure you are a member, the pool is open, and Firestore rules allow updates.");
      } else {
         setError(`Failed to claim square: ${err.message}`);
      }
      if (analytics) {
        logEvent(analytics, "square_claimed_failure", {
          poolId,
          squareId: squareToClaim?.id || 'unknown',
          userId: user?.uid || 'unknown',
          error_code: err.code,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }, [db, poolId, user, withRetry, analytics, squares]); // Added squares dependency

  // 9) Actually unclaim - Update the specific square DOCUMENT
  const handleUnclaimSquare = useCallback(async (squareToUnclaim) => {
     if (!user || !squareToUnclaim || !squareToUnclaim.id) {
       setError("Cannot unclaim square: Missing user or square data.");
       return;
    }
    // Ensure the user actually owns this square OR is commissioner
    if (squareToUnclaim.userId !== user.uid && userRole !== 'commissioner') {
        setError("You can only unclaim squares that you own.");
        return;
    }
     if (squareToUnclaim.userId !== user.uid && userRole === 'commissioner') {
        console.log("Commissioner unclaiming square owned by", squareToUnclaim.userId); // Log commissioner action
    }


    try {
      setError("");
      setSuccessMessage("");
      // Reference to the specific square DOCUMENT
      const squareRef = doc(db, "pools", poolId, "squares", squareToUnclaim.id);

      const updateData = {
         userId: null,
         displayName: null,
         status: "available", // Assuming you have a status field
         claimedAt: null,
         // Keep existing row/col
      };

      console.log("Attempting to unclaim square:", squareToUnclaim.id, "Ref Path:", squareRef.path, "with data:", updateData); // Debug log

      await withRetry("Unclaim Square", () =>
        updateDoc(squareRef, updateData)
      );

      setSuccessMessage(`Square ${squareToUnclaim.row + 1}-${squareToUnclaim.col + 1} unclaimed successfully!`);
      if (analytics) {
        logEvent(analytics, "square_unclaimed_success", {
          poolId,
          squareId: squareToUnclaim.id,
          userId: user.uid, // Logged-in user performing action
          originalOwner: squareToUnclaim.userId, // Log original owner
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("SquaresGrid - handleUnclaimSquare error:", err);
       if (err.code === 'permission-denied') {
         setError("Permission Denied: Failed to unclaim square. Ensure you are a member/commissioner, the pool is open, and Firestore rules allow updates.");
      } else {
        setError(`Failed to unclaim square: ${err.message}`);
      }
       if (analytics) {
        logEvent(analytics, "square_unclaimed_failure", {
          poolId,
          squareId: squareToUnclaim?.id || 'unknown',
          userId: user?.uid || 'unknown',
          error_code: err.code,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }, [db, poolId, user, userRole, withRetry, analytics]); // Added userRole dependency

  // 10) Confirmation dialog handlers
  const confirmAction = useCallback(async () => {
    if (!pendingSquare) return;

    if (action === "claim") {
      await handleClaimSquare(pendingSquare); // Pass the full square object
    } else if (action === "unclaim") {
      await handleUnclaimSquare(pendingSquare); // Pass the full square object
    }
    setConfirmDialogOpen(false);
    setPendingSquare(null);
    setAction("");
    hasLoggedClaim.current = false; // Reset claim log flag after action attempt
  }, [action, pendingSquare, handleClaimSquare, handleUnclaimSquare]); // Added dependencies

  const handleCancelAction = useCallback(() => {
    setConfirmDialogOpen(false);
    setPendingSquare(null);
    setAction("");
    if (analytics) {
      logEvent(analytics, "square_action_canceled", {
        poolId,
        userId: user?.uid, // Use optional chaining
        timestamp: new Date().toISOString(),
      });
    }
  }, [analytics, poolId, user?.uid]); // Added dependencies

  // 11) Keyboard nav
  const handleKeyDown = useCallback((e, square) => { // Pass the full square object
    if (!square) return;
    // const { id: squareId, userId: ownerId, row, col } = square; // Destructure needed values
    const { row, col } = square; // Only need row/col for navigation

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSquareClick(square); // Pass the full square object
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextCol = (col + 1) % 10;
      const nextSquareEl = document.querySelector(`[data-row="${row}"][data-col="${nextCol}"]`);
      nextSquareEl?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevCol = (col - 1 + 10) % 10;
       const prevSquareEl = document.querySelector(`[data-row="${row}"][data-col="${prevCol}"]`);
      prevSquareEl?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextRow = (row + 1) % 10;
       const nextSquareEl = document.querySelector(`[data-row="${nextRow}"][data-col="${col}"]`);
      nextSquareEl?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevRow = (row - 1 + 10) % 10;
       const prevSquareEl = document.querySelector(`[data-row="${prevRow}"][data-col="${col}"]`);
      prevSquareEl?.focus();
    }
  }, [handleSquareClick]); // Added dependency

  // 12) “loading” or “error” states (Minor adjustments)
  if (authLoading) {
     return (
      <Box sx={{ textAlign: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Checking authentication..." />
      </Box>
    );
  }
   if (loading && squares.length === 0) { // Show loading only if no squares are loaded yet
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading squares grid" />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ textAlign: "center", mt: 2 }}>
        <Alert severity="error" role="alert" aria-live="assertive">
          {error}
          <Box sx={{ mt: 1 }}>
            <Button
              onClick={handleRefresh}
              sx={{ mr: 1 }}
              startIcon={<RefreshIcon />}
              aria-label="Retry loading squares data"
            >
              Retry
            </Button>
            {/* Removed Join Pool button - should be handled elsewhere */}
            <Button
              component="a"
              href="mailto:support@bonomosportspools.com" // Replace with your actual support email
              aria-label="Contact support"
            >
              Contact Support
            </Button>
          </Box>
        </Alert>
      </Box>
    );
  }

  // 13) Prepare grid data (axis numbers from poolData prop)
  // const winners = poolData?.winners || {}; // Removed unused variable
  const xAxis =
    Array.isArray(poolData?.axisNumbers?.x) &&
    poolData.axisNumbers.x.length === 10
      ? poolData.axisNumbers.x
      : Array(10).fill("?");
  const yAxis =
    Array.isArray(poolData?.axisNumbers?.y) &&
    poolData.axisNumbers.y.length === 10
      ? poolData.axisNumbers.y
      : Array(10).fill("?");

  // Create a map for quick lookup, assuming squares array is sorted by row/col
  const squaresMap = squares.reduce((map, sq) => {
      map[`${sq.row}-${sq.col}`] = sq;
      return map;
  }, {});

  // 14) Render the squares grid
  return (
    <Fade in timeout={1000}>
      <Box sx={{ textAlign: "center" }}>
        {/* Header and Refresh Button */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            mb: 3,
          }}
        >
          <Typography variant="h5" sx={{ mr: 2, fontWeight: 700 }}>
            Squares Grid (10x10)
          </Typography>
          <Button
            onClick={handleRefresh}
            startIcon={<RefreshIcon />}
            aria-label="Refresh squares grid data"
          >
            Refresh
          </Button>
        </Box>

        {/* Grid Container */}
        <GridContainer role="grid" aria-label="Squares grid">
          {/* Top-left corner */}
          <Box sx={{ backgroundColor: "transparent" }} />

          {/* X-axis labels */}
          {xAxis.map((digit, i) => (
            <AxisLabel
              key={`x-${i}`}
              role="columnheader"
              aria-label={`Column ${i + 1} digit: ${
                digit !== "?" ? digit : "Unknown"
              }`}
            >
              {digit}
            </AxisLabel>
          ))}

          {/* Grid rows */}
          {Array.from({ length: 10 }).map((_, row) => (
            <React.Fragment key={`row-${row}`}>
              {/* Y-axis label */}
              <AxisLabel
                 key={`y-${row}`}
                 role="rowheader"
                 aria-label={`Row ${row + 1} digit: ${
                   yAxis[row] !== "?" ? yAxis[row] : "Unknown"
                 }`}
               >
                 {yAxis[row]}
               </AxisLabel>
               {/* Square cells */}
               {Array.from({ length: 10 }).map((_, col) => {
                  // Calculate square number (1-100)
                  const squareNumber = row * 10 + col + 1;
                  const square = squaresMap[`${row}-${col}`] || { id: `missing-${row}-${col}`, row, col, userId: null, status: 'missing' }; // Fallback for missing squares

                  const isClaimed = square.status === "claimed" && square.userId;
                  // Determine winner status based on poolData prop
                  const isQ1Winner = poolData?.winners?.q1 === square.id;
                  const isQ2Winner = poolData?.winners?.q2 === square.id;
                  const isQ3Winner = poolData?.winners?.q3 === square.id;
                  const isFinalWinner = poolData?.winners?.final === square.id;


                  const tooltipTitle = isClaimed
                    ? `Claimed by: ${square.displayName || `User ${square.userId?.slice(0, 8)}`}`
                    : square.status === 'missing'
                    ? 'Square data missing'
                    : `Square ${squareNumber} - Click to claim`; // Updated tooltip

                  const ariaLabel = isClaimed
                    ? `Square ${squareNumber}, claimed by ${
                        square.displayName || `User ${square.userId?.slice(0, 8)}`
                      }, ${
                        isFinalWinner
                          ? "Final Winner"
                          : isQ1Winner
                          ? "Q1 Winner"
                          : isQ2Winner
                          ? "Q2 Winner"
                          : isQ3Winner
                          ? "Q3 Winner"
                          : "No winner" // Added fallback
                      }`
                    : `Square ${squareNumber}, unclaimed`; // Updated aria-label

                   const squareBg = isFinalWinner
                    ? mode === "dark"
                      ? "#ff9500" // Orange-ish
                      : "#f97316" // Brighter Orange
                    : isQ1Winner || isQ2Winner || isQ3Winner
                    ? mode === "dark"
                      ? "#6b7280" // Gray
                      : "#9ca3af" // Lighter Gray
                    : isClaimed
                    ? "#facc15" // Yellow
                    : square.status === 'missing'
                    ? '#f87171' // Red for missing
                    : mode === "dark"
                    ? "#d1d5db" // Light Gray (Dark Mode Unclaimed)
                    : "#ffffff"; // White (Light Mode Unclaimed)

                  const textColor =
                    isFinalWinner || isQ1Winner || isQ3Winner || isQ2Winner
                      ? "#ffffff" // White text for winners
                      : isClaimed
                      ? "#1e40af" // Blue text for claimed
                      : square.status === 'missing'
                      ? '#ffffff' // White text for missing
                      : theme.palette.text.primary; // Default text color

                  // Determine if the button should be disabled
                  const isDisabled =
                     poolData?.status !== 'open' || // Pool not open
                     (square.userId && square.userId !== user?.uid && userRole !== 'commissioner') || // Claimed by someone else (allow commissioner override later if needed)
                     square.status === 'missing' || // Missing square data
                     userRole === 'none'; // User is not a member/commissioner

                  return (
                     <Tooltip key={square.id || `sq-${row}-${col}`} title={tooltipTitle} arrow>
                       {/* Use a span for Tooltip if disabled, otherwise Button */}
                       <span style={{ display: 'contents' }}>
                         <Square
                           onClick={() => handleSquareClick(square)}
                           onKeyDown={(e) => handleKeyDown(e, square)}
                           sx={{
                             minWidth: isMobile ? "60px" : "72px",
                             minHeight: isMobile ? "60px" : "72px",
                             backgroundColor: squareBg,
                             color: textColor,
                             fontSize: isMobile ? "0.9rem" : "1rem", // Adjusted font size
                             lineHeight: 1.2, // Improve text wrapping
                             wordBreak: 'break-word', // Allow breaking long names
                             borderColor: mode === "dark" ? "#ff9500" : "#3b82f6",
                             "&:hover": {
                               borderColor: mode === "dark" ? "#f97316" : "#1e40af",
                               backgroundColor: isDisabled ? squareBg : ( // Don't change bg on hover if disabled
                                 isFinalWinner
                                 ? "#fb923c"
                                 : isQ1Winner || isQ2Winner || isQ3Winner
                                 ? mode === "dark"
                                   ? "#9ca3af"
                                   : "#d1d5db"
                                 : isClaimed
                                 ? "#fef08a"
                                 : theme.palette.grey[300]
                               )
                             },
                           }}
                           aria-label={ariaLabel}
                           data-row={row} // Add data attributes for keyboard nav
                           data-col={col}
                           tabIndex={0} // Make it focusable
                           disabled={isDisabled} // Disable based on conditions
                         >
                           {/* Display Logic: Winner > Claimed > Number > Missing */}
                           {isFinalWinner
                             ? "🏆"
                             : isQ1Winner || isQ2Winner || isQ3Winner
                             ? "⭐"
                             : isClaimed
                             ? square.displayName || "Claimed"
                             : square.status === 'missing'
                             ? 'X' // Indicate missing
                             : squareNumber } {/* Display number if available and not claimed/winner */}
                         </Square>
                       </span>
                     </Tooltip>
                  );
               })}
            </React.Fragment>
          ))}
        </GridContainer>

        {/* Legend */}
        <Box
          sx={{
            mt: 3,
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
          role="region"
          aria-label="Squares grid legend"
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Final Winner">
            <Box sx={{ width: 24, height: 24, bgcolor: mode === "dark" ? "#ff9500" : "#f97316", borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontSize: "1rem" }}>Final Winner</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Q1/Q2/Q3 Winner">
            <Box sx={{ width: 24, height: 24, bgcolor: mode === "dark" ? "#6b7280" : "#9ca3af", borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontSize: "1rem" }}>Q1/Q2/Q3 Winner</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Claimed">
            <Box sx={{ width: 24, height: 24, bgcolor: "#facc15", borderRadius: 2 }} />
            <Typography variant="body2" sx={{ fontSize: "1rem" }}>Claimed</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} role="presentation" aria-label="Unclaimed">
            <Box sx={{ width: 24, height: 24, bgcolor: mode === "dark" ? "#d1d5db" : "#ffffff", borderRadius: 2, border: '1px solid grey' }} />
            <Typography variant="body2" sx={{ fontSize: "1rem" }}>Unclaimed</Typography>
          </Box>
        </Box>

        {/* Confirmation dialog */}
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
            <Typography>
              {action === "unclaim"
                ? `Are you sure you want to unclaim Square ${pendingSquare?.row * 10 + pendingSquare?.col + 1}?` // Show number
                : `Are you sure you want to claim Square ${pendingSquare?.row * 10 + pendingSquare?.col + 1}?`} {/* Show number */}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCancelAction} aria-label="Cancel claim/unclaim">
              Cancel
            </Button>
            <Button onClick={confirmAction} aria-label="Confirm claim/unclaim">
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
          <Alert severity="success" role="alert" aria-live="assertive">
            {successMessage}
          </Alert>
        </Snackbar>
      </Box>
    </Fade>
  );
}

export default SquaresGrid;
