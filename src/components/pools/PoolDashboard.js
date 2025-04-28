import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot, collection, getDocs, getDoc } from "firebase/firestore"; // Added getDoc import
import { getDb, getAnalyticsService } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import sanitizeHtml from "sanitize-html";
import { motion } from "framer-motion";
import SquaresGrid from "./SquaresGrid";
import StripCardList from "./StripCardList";
import PickemBoard from "./PickemBoard";
import { formatCurrency } from "../../utils/helpers";

// MUI imports
import {
  Box,
  Typography,
  Button,
  Paper,
  Fade,
  CircularProgress,
  Alert,
  Snackbar,
  styled,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

// Utility function to log analytics events with deduplication
const logAnalyticsEvent = (analytics, eventName, params, hasLoggedRef) => {
  if (!hasLoggedRef.current && analytics) {
    logEvent(analytics, eventName, params);
    hasLoggedRef.current = true;
  }
};

// Styled components for polished UI
const DashboardContainer = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === "dark"
    ? "linear-gradient(180deg, #1a2b4d 0%, #2c3e50 100%)"
    : "linear-gradient(180deg, #e0e7ff 0%, #f1f5f9 100%)",
  borderRadius: theme.shape.borderRadius * 2,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#ff9500" : "#3b82f6",
  boxShadow: theme.shadows[4],
  padding: theme.spacing({ xs: 2, md: 4 }),
  margin: theme.spacing(2),
  minHeight: "60vh",
  transition: theme.transitions.create("background", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontFamily: "'Montserrat', sans-serif'",
  fontWeight: 700,
  color: theme.palette.mode === "dark" ? theme.palette.text.primary : theme.palette.text.primary,
  marginBottom: theme.spacing(2),
}));

const InfoCard = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#2c3e50" : "#f1f5f9",
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#ff9500" : "#3b82f6",
  boxShadow: theme.shadows[2],
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  transition: theme.transitions.create(["transform", "box-shadow"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    transform: "scale(1.02)",
    boxShadow: theme.shadows[4],
  },
}));

function PoolDashboard() {
  const { poolId } = useParams();
  const { user, authLoading } = useAuth();
  const { mode, theme: globalTheme } = useThemeContext();
  const [poolData, setPoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [participants, setParticipants] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedDashboardLoad = useRef(false);
  const retryCount = useRef(0);
  const maxRetries = 5;
  const retryDelayBase = 2000; // 2 seconds
  const db = getDb();

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Custom theme based on pool data
  const customTheme = useMemo(() => {
    if (!poolData?.theme) {
      return createTheme(globalTheme);
    }
    return createTheme({
      ...globalTheme,
      palette: {
        ...globalTheme.palette,
        primary: { main: poolData.theme.primaryColor || globalTheme.palette.primary.main },
        secondary: { main: poolData.theme.secondaryColor || globalTheme.palette.secondary.main },
      },
    });
  }, [poolData, globalTheme]);

  // Retry logic for Firestore operations
  const withRetry = (operation, callback, maxRetries = 5, retryDelayBase = 2000) => {
    return new Promise((resolve, reject) => {
      let attempt = 0;

      const tryOperation = () => {
        callback((snapshot) => resolve(snapshot), (err) => {
          attempt++;
          if (analytics) {
            logAnalyticsEvent(analytics, "firestore_operation_retry", {
              userId: user?.uid || "anonymous",
              operation,
              attempt,
              error_message: err.message,
              timestamp: new Date().toISOString(),
            }, new RefObject(true));
            console.log(`PoolDashboard - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
          }

          if (attempt >= maxRetries) {
            reject(err);
            return;
          }

          const delay = Math.pow(2, attempt - 1) * retryDelayBase;
          console.log(`${operation} - Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
          setTimeout(tryOperation, delay);
        });
      };

      tryOperation();
    });
  };

  // Fetch pool data with real-time updates and retry logic
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!poolId) {
      console.error("PoolDashboard - Missing poolId:", poolId);
      setError("Pool ID is required.");
      setLoading(false);
      return;
    }

    const fetchPoolData = () => {
      setLoading(true);
      setError("");
      const poolDocRef = doc(db, "pools", poolId);

      let unsubscribe;
      withRetry("Fetch Pool Data", (onSuccess, onError) => {
        unsubscribe = onSnapshot(
          poolDocRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setPoolData(data);
              setError(null);
              setLoading(false);
              retryCount.current = 0;
              console.log("PoolDashboard - Live pool data updated:", data);

              // Log dashboard load (only once)
              logAnalyticsEvent(analytics, "pool_dashboard_loaded", {
                poolId,
                userId: user?.uid || "anonymous",
                format: data.format,
                timestamp: new Date().toISOString(),
              }, hasLoggedDashboardLoad);
              console.log("PoolDashboard - Dashboard load logged to Firebase Analytics");
              onSuccess(snapshot);
            } else {
              setError("Pool not found.");
              console.log("PoolDashboard - Pool not found:", poolId);
              setLoading(false);
              onSuccess(null);
            }
          },
          (err) => {
            console.error("PoolDashboard - Error fetching live pool data:", err);
            let userFriendlyError = "Failed to fetch pool data.";
            if (err.code === "permission-denied") {
              userFriendlyError = "You do not have permission to view this pool.";
              setLoading(false);
            } else if (err.code === "unavailable") {
              userFriendlyError = "Firestore is currently unavailable. Retrying...";
            } else {
              setLoading(false);
            }
            setError(userFriendlyError);
            if (analytics) {
              logAnalyticsEvent(analytics, "fetch_pool_data_failed", {
                poolId,
                userId: user?.uid || "anonymous",
                error_message: err.message || "Unknown error",
                timestamp: new Date().toISOString(),
              }, new RefObject(true));
              console.log("PoolDashboard - Fetch pool data failure logged to Firebase Analytics");
            }
            onError(err);
          }
        );
      }, maxRetries, retryDelayBase)
        .catch((err) => {
          console.error("PoolDashboard - All retries failed:", err);
          setError("Loading pool data timed out. Please try refreshing.");
          setLoading(false);
        });

      // Timeout for pool data loading (increased to 60 seconds)
      const timeout = setTimeout(() => {
        if (loading) {
          setError("Loading pool data timed out. Please try refreshing.");
          setLoading(false);
        }
      }, 60000);

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
        clearTimeout(timeout);
      };
    };

    fetchPoolData();

    // Reset dashboard load tracking when poolId changes
    hasLoggedDashboardLoad.current = false;
  }, [poolId, user?.uid, analytics]);

  // Fetch participant data for display names in rankings
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!poolId || !poolData) return;

    const fetchParticipants = async () => {
      try {
        const participantsRef = collection(db, "pools", poolId, "participants");
        const participantsSnapshot = await getDocs(participantsRef);
        const participantsData = {};
        participantsSnapshot.forEach((doc) => {
          participantsData[doc.id] = doc.data().displayName || `User (${doc.id.slice(0, 8)})`;
        });
        // Also fetch display names from membersMeta if available
        if (poolData.membersMeta) {
          Object.entries(poolData.membersMeta).forEach(([userId, meta]) => {
            if (meta.displayName) {
              participantsData[userId] = meta.displayName;
            }
          });
        }
        // Add commissioner's displayName if available
        if (poolData.commissionerId) {
          const userDocRef = doc(db, "users", poolData.commissionerId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists() && userDoc.data().displayName) {
            participantsData[poolData.commissionerId] = userDoc.data().displayName;
          } else if (poolData.membersMeta && poolData.membersMeta[poolData.commissionerId]?.displayName) {
            participantsData[poolData.commissionerId] = poolData.membersMeta[poolData.commissionerId].displayName;
          }
        }
        setParticipants(participantsData);
        console.log("PoolDashboard - Fetched participants:", participantsData);
      } catch (err) {
        console.error("PoolDashboard - Error fetching participants:", err);
        if (analytics) {
          logAnalyticsEvent(analytics, "fetch_participants_failed", {
            poolId,
            userId: user?.uid || "anonymous",
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          }, new RefObject(true));
          console.log("PoolDashboard - Fetch participants failure logged to Firebase Analytics");
        }
      }
    };

    fetchParticipants();
  }, [poolId, poolData, user?.uid, analytics]);

  // Handle manual refresh
  const handleRefresh = () => {
    setLoading(true);
    setError("");
    retryCount.current = 0;
    console.log("PoolDashboard - Manual refresh triggered for poolId:", poolId);
    if (analytics) {
      logAnalyticsEvent(analytics, "pool_dashboard_refreshed", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      }, new RefObject(true));
      console.log("PoolDashboard - Refresh logged to Firebase Analytics");
    }
  };

  // Calculate member rankings (e.g., based on wins or claimed items)
  const rankings = useMemo(() => {
    if (!poolData) return [];

    const rankings = [];
    const memberIds = poolData?.memberIds || [];
    const offlineUsers = poolData?.offlineUsers || [];
    const squares = poolData?.format === "squares" ? (poolData?.squares || {}) : {};
    const strips = poolData?.format === "strip_cards" ? (poolData?.strips || {}) : {};

    const getUserDisplayName = (userId) => {
      if (userId.startsWith("offline_")) {
        const offlineUser = offlineUsers.find((user) => user.id === userId);
        return offlineUser ? offlineUser.name : `Offline User (${userId.slice(8, 12)})`;
      }
      // Prefer displayName from participants subcollection
      if (participants[userId]) {
        return participants[userId];
      }
      // Fallback to membersMeta if available
      if (poolData.membersMeta && poolData.membersMeta[userId] && poolData.membersMeta[userId].displayName) {
        return poolData.membersMeta[userId].displayName;
      }
      // Fallback to userId if no display name is found
      return `User (${userId.slice(0, 8)})`;
    };

    console.log("PoolDashboard - Calculating rankings with squares:", squares);
    console.log("PoolDashboard - Calculating rankings with strips:", strips);
    console.log("PoolDashboard - Participants map:", participants);
    console.log("PoolDashboard - MembersMeta:", poolData.membersMeta);

    if (poolData?.format === "squares") {
      const winners = poolData.winners || {};
      memberIds.forEach((uid) => {
        let wins = 0;
        Object.values(squares).forEach((square) => {
          if (square.userId === uid) {
            const squareNumber = square.row * 10 + square.col + 1;
            const scorePeriods = ["q1", "q2", "q3", "final"];
            scorePeriods.forEach((period) => {
              if (winners[period] === squareNumber) {
                wins += 1;
              }
            });
          }
        });
        rankings.push({ userId: uid, displayName: getUserDisplayName(uid), wins });
      });
    } else if (poolData?.format === "strip_cards") {
      memberIds.forEach((uid) => {
        let claimed = 0;
        Object.values(strips).forEach((strip) => {
          if (strip.userId === uid) {
            claimed += 1;
          }
        });
        rankings.push({ userId: uid, displayName: getUserDisplayName(uid), claimed });
      });
    }

    // Sort rankings
    if (poolData?.format === "squares") {
      rankings.sort((a, b) => b.wins - a.wins);
    } else if (poolData?.format === "strip_cards") {
      rankings.sort((a, b) => b.claimed - a.claimed);
    }

    console.log("PoolDashboard - Calculated rankings:", rankings);
    if (analytics) {
      logAnalyticsEvent(analytics, "pool_dashboard_rankings_calculated", {
        poolId,
        userId: user?.uid || "anonymous",
        format: poolData?.format,
        rankingCount: rankings.length,
        timestamp: new Date().toISOString(),
      }, new RefObject(true));
      console.log("PoolDashboard - Rankings calculation logged to Firebase Analytics");
    }

    return rankings;
  }, [poolData, analytics, user?.uid, poolId, participants]);

  // Calculate payouts for display
  const payouts = useMemo(() => {
    if (!poolData?.totalPot || poolData.totalPot === "Donations only") return {};
    const structure = poolData.payoutStructure || { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 };
    const totalPotValue = parseFloat(poolData.totalPot);
    return {
      q1: (totalPotValue * structure.q1).toFixed(2),
      q2: (totalPotValue * structure.q2).toFixed(2),
      q3: (totalPotValue * structure.q3).toFixed(2),
      final: (totalPotValue * structure.final).toFixed(2),
    };
  }, [poolData]);

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  if (loading) {
    return (
      <Box sx={{ m: 2, textAlign: "center" }}>
        <CircularProgress size={24} aria-label="Loading pool data" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ m: 2, textAlign: "center" }}>
        <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {error}
          <Box sx={{ mt: 2, display: "flex", gap: 1, justifyContent: "center" }}>
            <Button
              onClick={handleRefresh}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              startIcon={<RefreshIcon />}
              aria-label="Retry loading pool data"
            >
              Retry
            </Button>
            <Button
              component="a"
              href="mailto:support@bonomosportspools.com"
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Contact support for pool data issue"
            >
              Contact Support
            </Button>
          </Box>
        </Alert>
      </Box>
    );
  }

  if (!poolData) {
    return (
      <Box sx={{ m: 2, textAlign: "center" }}>
        <Alert severity="info" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          Pool not found.
        </Alert>
      </Box>
    );
  }

  return (
    <ThemeProvider theme={customTheme}>
      <DashboardContainer>
        <Fade in timeout={1000}>
          <Box>
            {/* Pool Header */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <SectionTitle variant="h4">{poolData.poolName}</SectionTitle>
              <Button
                onClick={handleRefresh}
                sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: { xs: "0.9rem", md: "1rem" } }}
                startIcon={<RefreshIcon />}
                aria-label="Refresh pool data"
                disabled={loading}
              >
                Refresh
              </Button>
            </Box>
            {poolData.theme?.logoURL && (
              <Box sx={{ mb: 2, textAlign: "center" }}>
                <Box
                  component="img"
                  src={sanitizeHtml(poolData.theme.logoURL, { allowedTags: [], allowedAttributes: {} })}
                  alt="Pool Logo"
                  sx={{ maxHeight: 80, objectFit: "contain", display: "block", mx: "auto" }}
                  onError={() => console.error("PoolDashboard - Invalid logo URL:", poolData.theme.logoURL)}
                />
              </Box>
            )}
            <Box sx={{ mb: 3, textAlign: "center" }}>
              <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                Sport: {poolData.sport}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                Format: {poolData.formatName || poolData.format}
              </Typography>
              {poolData.totalPot && (
                <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                  Total Pot: {formatCurrency(poolData.totalPot)}
                </Typography>
              )}
            </Box>

            {/* Main Content */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Grid/List and Scores Section */}
              <Box sx={{ maxWidth: "1020px", mx: "auto", width: "100%" }}>
                {/* Grid or List */}
                {poolData.format === "squares" && (
                  <Box sx={{ mb: 3 }}>
                    <SectionTitle variant="h5">Squares Grid</SectionTitle>
                    <SquaresGrid poolId={poolId} poolData={poolData} />
                  </Box>
                )}
                {poolData.format === "strip_cards" && (
                  <Box sx={{ mb: 3 }}>
                    <SectionTitle variant="h5">Strip Cards</SectionTitle>
                    <StripCardList poolId={poolId} poolData={poolData} />
                  </Box>
                )}
                {poolData.format === "pickem" && (
                  <Box sx={{ mb: 3 }}>
                    <SectionTitle variant="h5">Pick'em Board</SectionTitle>
                    <PickemBoard poolId={poolId} />
                  </Box>
                )}

                {/* Current Scores */}
                {poolData.scores && (
                  <InfoCard role="region" aria-label="Current scores section">
                    <SectionTitle variant="h6">Current Scores</SectionTitle>
                    {["q1", "q2", "q3", "final"].map((period) =>
                      poolData.scores[period] ? (
                        <Box key={period} sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "'Poppins', sans-serif'" }}
                          >
                            {period.toUpperCase()}: {poolData.scores[period].teamA} - {poolData.scores[period].teamB}
                          </Typography>
                          {payouts[period] && (
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: "'Poppins', sans-serif'", color: mode === "dark" ? "#34d399" : "#16a34a" }}
                            >
                              Payout: ${payouts[period]}
                            </Typography>
                          )}
                        </Box>
                      ) : null
                    )}
                  </InfoCard>
                )}
              </Box>

              {/* Member Rankings Section - Moved Below Grid */}
              <Box sx={{ maxWidth: "1020px", mx: "auto", width: "100%" }}>
                <InfoCard role="region" aria-label="Member rankings section">
                  <SectionTitle variant="h6">Member Rankings</SectionTitle>
                  {rankings.length > 0 ? (
                    <Box role="list" aria-label="Member rankings">
                      {rankings.map((rank, index) => (
                        <motion.div
                          key={rank.userId}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mb: 1,
                              alignItems: "center",
                              backgroundColor: index === 0 ? (mode === "dark" ? "#ff9500" : "#f97316") : "transparent",
                              borderRadius: index === 0 ? 1 : 0,
                              p: index === 0 ? 1 : 0,
                            }}
                            role="listitem"
                            aria-label={`Rank ${index + 1}: ${rank.displayName}`}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "'Poppins', sans-serif'",
                                color: index === 0 ? "#ffffff" : (mode === "dark" ? "#e5e7eb" : "inherit"),
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              {index === 0 && "🏆"} {index + 1}. {rank.displayName}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "'Poppins', sans-serif'",
                                color: index === 0 ? "#ffffff" : (mode === "dark" ? "#e5e7eb" : "inherit"),
                              }}
                            >
                              {poolData.format === "squares" ? `${rank.wins} Wins` : `${rank.claimed} Claimed`}
                            </Typography>
                          </Box>
                        </motion.div>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                      No rankings available yet.
                    </Typography>
                  )}
                </InfoCard>
              </Box>
            </Box>
          </Box>
        </Fade>

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
      </DashboardContainer>
    </ThemeProvider>
  );
}

// Utility to create a dummy RefObject for analytics logging
function RefObject(initialValue) {
  return { current: initialValue };
}

export default PoolDashboard;