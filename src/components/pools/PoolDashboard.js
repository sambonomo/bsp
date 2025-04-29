import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection, getDocs, getDoc } from "firebase/firestore";
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
import SurvivorBoard from "./SurvivorBoard";
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsIcon from "@mui/icons-material/Settings";

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
  const [sortBy, setSortBy] = useState("overall"); // State for sorting leaderboard
  const hasLoggedDashboardLoad = useRef(false);
  const hasLoggedSortChange = useRef(false);
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

  // Retry logic for Firebase operations
  const withRetry = useCallback((operation, callback, maxRetries = 5, retryDelayBase = 2000) => {
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
  }, [analytics, user?.uid]);

  // Reset sortBy when pool format changes
  useEffect(() => {
    if (poolData) {
      // Reset sortBy to a default value that matches the pool format
      if (["squares", "strip_cards", "pickem", "survivor"].includes(poolData.format)) {
        setSortBy("overall");
      } else {
        setSortBy(""); // Reset to empty if format doesn't support sorting
      }
    }
  }, [poolData]); // Added poolData to dependencies

  // Fetch pool data with real-time updates and retry logic
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
  }, [poolId, user?.uid, analytics, db, loading, withRetry]); // Added db, loading, and withRetry to dependencies

  // Fetch participant data for display names in rankings
  useEffect(() => {
    if (!poolId || !poolData) return;

    const fetchParticipants = async () => {
      try {
        const participantsRef = collection(db, "pools", poolId, "participants");
        const participantsSnapshot = await getDocs(participantsRef);
        const participantsData = {};
        participantsSnapshot.forEach((doc) => {
          const data = doc.data();
          participantsData[doc.id] = {
            displayName: data.displayName || `User (${doc.id.slice(0, 8)})`,
            picks: data.picks || {}, // For Pick'em and Survivor
            status: data.status || "active", // For Survivor
            weeksSurvived: data.weeksSurvived || 0, // For Survivor
          };
        });
        // Also fetch display names from membersMeta if available
        if (poolData.membersMeta) {
          Object.entries(poolData.membersMeta).forEach(([userId, meta]) => {
            if (meta.displayName) {
              participantsData[userId] = {
                ...participantsData[userId],
                displayName: meta.displayName,
              };
            }
          });
        }
        // Add commissioner's displayName if available
        if (poolData.commissionerId) {
          const userDocRef = doc(db, "users", poolData.commissionerId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists() && userDoc.data().displayName) {
            participantsData[poolData.commissionerId] = {
              ...participantsData[poolData.commissionerId],
              displayName: userDoc.data().displayName,
            };
          } else if (poolData.membersMeta && poolData.membersMeta[poolData.commissionerId]?.displayName) {
            participantsData[poolData.commissionerId] = {
              ...participantsData[poolData.commissionerId],
              displayName: poolData.membersMeta[poolData.commissionerId].displayName,
            };
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
  }, [poolId, poolData, user?.uid, analytics, db]); // Added db to dependencies

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

  // Define getUserDisplayName as a function to avoid initialization issues
  const getUserDisplayName = (userId) => {
    if (!poolData || !participants) return userId ? `User (${userId.slice(0, 8)})` : "Unknown User";
    if (userId && userId.startsWith("offline_")) {
      const offlineUser = (poolData.offlineUsers || []).find((user) => user.id === userId);
      return offlineUser ? offlineUser.name : `Offline User (${userId.slice(8, 12)})`;
    }
    if (userId && participants[userId]?.displayName) {
      return participants[userId].displayName;
    }
    if (userId && poolData.membersMeta && poolData.membersMeta[userId] && poolData.membersMeta[userId].displayName) {
      return poolData.membersMeta[userId].displayName;
    }
    return userId ? `User (${userId.slice(0, 8)})` : "Unknown User";
  };

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

  // Fetch matchups for Pick'em scoring
  const [matchups, setMatchups] = useState([]);
  useEffect(() => {
    if (!poolId || !poolData || poolData.format !== "pickem") return;

    const fetchMatchups = async () => {
      try {
        const matchupsRef = collection(db, "pools", poolId, "matchups");
        const matchupsSnapshot = await getDocs(matchupsRef);
        const matchupsData = matchupsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMatchups(matchupsData);
        console.log("PoolDashboard - Fetched matchups for Pick'em scoring:", matchupsData);
      } catch (err) {
        console.error("PoolDashboard - Error fetching matchups:", err);
        if (analytics) {
          logAnalyticsEvent(analytics, "fetch_matchups_failed", {
            poolId,
            userId: user?.uid || "anonymous",
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          }, new RefObject(true));
          console.log("PoolDashboard - Fetch matchups failure logged to Firebase Analytics");
        }
      }
    };

    fetchMatchups();
  }, [poolId, poolData, user?.uid, analytics, db]); // Added db to dependencies

  // Calculate rankings (including per-period rankings for Squares, and actual data for Pick'em and Survivor)
  const rankingsData = useMemo(() => {
    if (!poolData) return { overall: [], byPeriod: {}, stripClaims: [], pickemResults: [], survivorResults: [] };

    const memberIds = poolData?.memberIds || [];
    const squares = poolData?.format === "squares" ? (poolData?.squares || {}) : {};
    const strips = poolData?.format === "strip_cards" ? (poolData?.strips || {}) : {};

    console.log("PoolDashboard - Calculating rankings with squares:", squares);
    console.log("PoolDashboard - Calculating rankings with strips:", strips);
    console.log("PoolDashboard - Participants map:", participants);
    console.log("PoolDashboard - MembersMeta:", poolData.membersMeta);

    const overallRankings = [];
    const byPeriodRankings = { q1: [], q2: [], q3: [], final: [] }; // For Squares
    const stripClaims = []; // For Strip Cards
    const pickemResults = []; // For Pick'em
    const survivorResults = []; // For Survivor

    // Squares Pool Rankings
    if (poolData?.format === "squares") {
      const winners = poolData.winners || {};
      const totalPot = parseFloat(poolData.totalPot || 0);
      const payoutStructure = poolData.payoutStructure || { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 };
      const payouts = {
        q1: totalPot * payoutStructure.q1,
        q2: totalPot * payoutStructure.q2,
        q3: totalPot * payoutStructure.q3,
        final: totalPot * payoutStructure.final,
      };

      // Calculate wins and winnings per user
      const userWins = {};
      const userWinnings = { q1: {}, q2: {}, q3: {}, final: {} };
      memberIds.forEach((uid) => {
        userWins[uid] = { overall: 0 };
        Object.values(squares).forEach((square) => {
          if (square.userId === uid) {
            const squareNumber = square.row * 10 + square.col + 1;
            const scorePeriods = ["q1", "q2", "q3", "final"];
            scorePeriods.forEach((period) => {
              if (winners[period] === squareNumber) {
                userWins[uid].overall = (userWins[uid].overall || 0) + 1;
                userWinnings[period][uid] = (userWinnings[period][uid] || 0) + (payouts[period] || 0);
              }
            });
          }
        });
      });

      // Overall rankings
      memberIds.forEach((uid) => {
        overallRankings.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          wins: userWins[uid].overall,
        });
      });
      overallRankings.sort((a, b) => b.wins - a.wins);

      // Per-period rankings
      ["q1", "q2", "q3", "final"].forEach((period) => {
        const periodRankings = [];
        memberIds.forEach((uid) => {
          if (userWinnings[period][uid]) {
            periodRankings.push({
              userId: uid,
              displayName: getUserDisplayName(uid),
              winnings: userWinnings[period][uid],
            });
          }
        });
        periodRankings.sort((a, b) => b.winnings - a.winnings);
        byPeriodRankings[period] = periodRankings;
      });
    }

    // Strip Cards Rankings
    else if (poolData?.format === "strip_cards") {
      memberIds.forEach((uid) => {
        let claimed = 0;
        Object.values(strips).forEach((strip) => {
          if (strip.userId === uid) {
            claimed += 1;
            stripClaims.push({
              userId: uid,
              displayName: getUserDisplayName(uid),
              stripNumber: strip.number,
              claimedAt: strip.claimedAt,
            });
          }
        });
        overallRankings.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          claimed,
        });
      });
      overallRankings.sort((a, b) => b.claimed - a.claimed);
      stripClaims.sort((a, b) => (b.claimedAt?.toDate?.() || 0) - (a.claimedAt?.toDate?.() || 0));
    }

    // Pick'em Rankings (Actual scoring)
    else if (poolData?.format === "pickem") {
      memberIds.forEach((uid) => {
        let correctPicks = 0;
        // Calculate correct picks based on matchups
        matchups.forEach((matchup) => {
          const userPick = participants[uid]?.picks?.[matchup.id];
          const actualWinner = matchup.winner; // Assumes winner field exists (e.g., "home" or "away")
          if (userPick && actualWinner && userPick === actualWinner) {
            correctPicks += 1;
          }
        });
        pickemResults.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          correctPicks,
        });
      });
      overallRankings.push(...pickemResults);
      overallRankings.sort((a, b) => b.correctPicks - a.correctPicks);
    }

    // Survivor Rankings (Actual data from participants subcollection)
    else if (poolData?.format === "survivor") {
      memberIds.forEach((uid) => {
        const participant = participants[uid] || {};
        survivorResults.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          status: participant.status || "active",
          weeksSurvived: participant.weeksSurvived || 0,
        });
      });
      survivorResults.sort((a, b) => {
        // Sort by status (active first) and then by weeks survived (descending)
        if (a.status === b.status) {
          return b.weeksSurvived - a.weeksSurvived;
        }
        return a.status === "active" ? -1 : 1;
      });
      overallRankings.push(...survivorResults);
    }

    console.log("PoolDashboard - Calculated rankings:", overallRankings);
    console.log("PoolDashboard - Calculated by-period rankings:", byPeriodRankings);
    console.log("PoolDashboard - Calculated strip claims:", stripClaims);
    console.log("PoolDashboard - Calculated pickem results:", pickemResults);
    console.log("PoolDashboard - Calculated survivor results:", survivorResults);
    if (analytics) {
      logAnalyticsEvent(analytics, "pool_dashboard_rankings_calculated", {
        poolId,
        userId: user?.uid || "anonymous",
        format: poolData?.format,
        rankingCount: overallRankings.length,
        timestamp: new Date().toISOString(),
      }, new RefObject(true));
      console.log("PoolDashboard - Rankings calculation logged to Firebase Analytics");
    }

    return { overall: overallRankings, byPeriod: byPeriodRankings, stripClaims, pickemResults, survivorResults };
  }, [poolData, analytics, user?.uid, poolId, participants, matchups]);

  // Game results for Squares (which square won each period)
  const gameResults = useMemo(() => {
    if (!poolData || poolData.format !== "squares") return [];
    const winners = poolData.winners || {};
    const squares = poolData.squares || {};
    const results = [];

    ["q1", "q2", "q3", "final"].forEach((period) => {
      const winningSquareNumber = winners[period];
      if (winningSquareNumber) {
        const square = Object.values(squares).find(
          (s) => (s.row * 10 + s.col + 1) === winningSquareNumber
        );
        if (square) {
          const userId = square.userId;
          const displayName = getUserDisplayName(userId);
          results.push({
            period: period.toUpperCase(),
            squareNumber: winningSquareNumber,
            winner: displayName,
            payout: payouts[period],
          });
        }
      }
    });

    return results;
  }, [poolData, payouts, getUserDisplayName]); // Added getUserDisplayName to dependencies

  // Select rankings to display based on sortBy
  const displayedRankings = useMemo(() => {
    if (!poolData) return [];
    if (poolData.format === "squares") {
      if (sortBy === "overall") {
        return rankingsData.overall;
      }
      return rankingsData.byPeriod[sortBy] || [];
    } else if (poolData.format === "strip_cards" || poolData.format === "pickem" || poolData.format === "survivor") {
      return rankingsData.overall;
    }
    return [];
  }, [sortBy, rankingsData, poolData]);

  // Handle sort change
  const handleSortChange = (e) => {
    setSortBy(e.target.value);
    if (!hasLoggedSortChange.current && analytics) {
      logAnalyticsEvent(analytics, "pool_dashboard_sort_changed", {
        poolId,
        userId: user?.uid || "anonymous",
        sortBy: e.target.value,
        timestamp: new Date().toISOString(),
      }, new RefObject(true));
      console.log("PoolDashboard - Sort by changed logged to Firebase Analytics");
      hasLoggedSortChange.current = true;
    }
  };

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

  const isCommissioner = user.uid === poolData.commissionerId;

  return (
    <ThemeProvider theme={customTheme}>
      <DashboardContainer>
        <Fade in timeout={1000}>
          <Box>
            {/* Pool Header */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 1 }}>
              <SectionTitle variant="h4">{poolData.poolName}</SectionTitle>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {isCommissioner && (
                  <Button
                    component={Link}
                    to={`/commissioner-settings/${poolId}`}
                    sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: { xs: "0.9rem", md: "1rem" } }}
                    startIcon={<SettingsIcon />}
                    aria-label="Manage pool settings"
                  >
                    Manage Settings
                  </Button>
                )}
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
                {poolData.format === "survivor" && (
                  <Box sx={{ mb: 3 }}>
                    <SectionTitle variant="h5">Survivor Pool</SectionTitle>
                    <SurvivorBoard poolId={poolId} />
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

                {/* Game Results */}
                {poolData.format === "squares" && gameResults.length > 0 && (
                  <InfoCard role="region" aria-label="Game results section">
                    <SectionTitle variant="h6">Game Results</SectionTitle>
                    {gameResults.map((result) => (
                      <Box key={result.period} sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {result.period}: Square {result.squareNumber} won by {result.winner}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'", color: mode === "dark" ? "#34d399" : "#16a34a" }}
                        >
                          Payout: ${result.payout}
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}
                {poolData.format === "strip_cards" && rankingsData.stripClaims.length > 0 && (
                  <InfoCard role="region" aria-label="Strip card claims section">
                    <SectionTitle variant="h6">Strip Card Claims</SectionTitle>
                    {rankingsData.stripClaims.map((claim, index) => (
                      <Box key={index} sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          Strip #{claim.stripNumber} claimed by {claim.displayName}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          Claimed on: {claim.claimedAt?.toDate?.().toLocaleString() || "N/A"}
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}
                {poolData.format === "pickem" && rankingsData.pickemResults.length > 0 && (
                  <InfoCard role="region" aria-label="Pick'em results section">
                    <SectionTitle variant="h6">Pick'em Results</SectionTitle>
                    {rankingsData.pickemResults.map((result, index) => (
                      <Box key={index} sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {result.displayName}: {result.correctPicks} Correct Picks
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}
                {poolData.format === "survivor" && rankingsData.survivorResults.length > 0 && (
                  <InfoCard role="region" aria-label="Survivor results section">
                    <SectionTitle variant="h6">Survivor Results</SectionTitle>
                    {rankingsData.survivorResults.map((result, index) => (
                      <Box key={index} sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {result.displayName}: {result.status}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          Weeks Survived: {result.weeksSurvived}
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}
              </Box>

              {/* Member Rankings Section */}
              <Box sx={{ maxWidth: "1020px", mx: "auto", width: "100%" }}>
                <InfoCard role="region" aria-label="Member rankings section">
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <SectionTitle variant="h6">Member Rankings</SectionTitle>
                    {["squares", "strip_cards", "pickem", "survivor"].includes(poolData.format) && (
                      <FormControl sx={{ minWidth: 120 }}>
                        <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} id="sort-rankings-label">Sort By</InputLabel>
                        <Select
                          labelId="sort-rankings-label"
                          value={sortBy}
                          onChange={handleSortChange}
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                          aria-label="Sort rankings"
                          aria-describedby="sort-rankings-label"
                        >
                          {poolData.format === "squares" && (
                            <>
                              <MenuItem value="overall" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Overall Wins</MenuItem>
                              <MenuItem value="q1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Q1 Wins</MenuItem>
                              <MenuItem value="q2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Q2 Wins</MenuItem>
                              <MenuItem value="q3" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Q3 Wins</MenuItem>
                              <MenuItem value="final" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Final Wins</MenuItem>
                            </>
                          )}
                          {poolData.format === "strip_cards" && (
                            <>
                              <MenuItem value="overall" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Claimed Strips</MenuItem>
                            </>
                          )}
                          {poolData.format === "pickem" && (
                            <>
                              <MenuItem value="overall" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Overall Correct Picks</MenuItem>
                              {/* Add week-based sorting when implemented */}
                            </>
                          )}
                          {poolData.format === "survivor" && (
                            <>
                              <MenuItem value="overall" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Survival Duration</MenuItem>
                              {/* Add round-based sorting when implemented */}
                            </>
                          )}
                        </Select>
                      </FormControl>
                    )}
                  </Box>
                  {displayedRankings.length > 0 ? (
                    <Box role="list" aria-label="Member rankings">
                      {displayedRankings.map((rank, index) => (
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
                              backgroundColor: index === 0 ? (mode === "dark" ? "#ff9500" : "#f97316") : 
                                              index === 1 ? (mode === "dark" ? "#C0C0C0" : "#A9A9A9") : 
                                              index === 2 ? (mode === "dark" ? "#CD7F32" : "#B87333") : "transparent",
                              borderRadius: index <= 2 ? 1 : 0,
                              p: index <= 2 ? 1 : 0,
                              color: index <= 2 ? "#ffffff" : undefined,
                            }}
                            role="listitem"
                            aria-label={`Rank ${index + 1}: ${rank.displayName}`}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "'Poppins', sans-serif'",
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              {index === 0 && "🏆"} 
                              {index === 1 && "🥈"} 
                              {index === 2 && "🥉"} 
                              {index + 1}. {rank.displayName}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "'Poppins', sans-serif'",
                              }}
                            >
                              {poolData.format === "squares" && sortBy === "overall" ? `${rank.wins} Wins` : 
                               poolData.format === "squares" ? `$${rank.winnings.toFixed(2)}` :
                               poolData.format === "strip_cards" ? `${rank.claimed} Claimed` :
                               poolData.format === "pickem" ? `${rank.correctPicks} Correct Picks` :
                               poolData.format === "survivor" ? `${rank.weeksSurvived} Weeks Survived (${rank.status})` : "N/A"}
                            </Typography>
                          </Box>
                        </motion.div>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                      No rankings available yet for {sortBy === "overall" ? "this pool" : `${sortBy.toUpperCase()} period`}.
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