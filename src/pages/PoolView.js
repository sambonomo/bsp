// /src/pages/PoolView.js
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  collection,
  getDocs,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { logEvent } from "firebase/analytics";

import { useAuth } from "../contexts/AuthContext";
import { useThemeContext } from "../contexts/ThemeContext";

import { getDb, getAnalyticsService } from "../firebase/config";

// Renamed to fetchSchedule:
import { fetchSchedule } from "../utils/sportsRadar";

import {
  Container,
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Fade,
  Snackbar,
  styled,
  Grid,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";

import ManageMembersModal from "../components/modals/ManageMembersModal";
import EnterScoresModal from "../components/modals/EnterScoresModal";
import SquaresGrid from "../components/pools/SquaresGrid";
import StripCardList from "../components/pools/StripCardList";
import PickemBoard from "../components/pools/PickemBoard";
import SurvivorBoard from "../components/pools/SurvivorBoard";

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { motion } from "framer-motion";

// ---------------------------------------------------------
// Styled components
// ---------------------------------------------------------
const PoolViewContainer = styled(Box)(({ theme }) => ({
  background:
    theme.palette.mode === "dark"
      ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
      : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
  minHeight: "100vh",
  py: { xs: 6, md: 8 },
  px: { xs: 2, md: 4 },
}));

const DetailCard = styled(Card)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius * 2,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
  "&:hover": {
    transform: "scale(1.03)",
    boxShadow: theme.shadows[6],
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#FFD700",
  color: "#0B162A",
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  "&:hover": {
    backgroundColor: "#FFEB3B",
    boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontFamily: "'Montserrat', sans-serif'",
  fontWeight: 700,
  color: theme.palette.mode === "dark" ? "#FFFFFF" : "#0B162A",
  marginBottom: theme.spacing(2),
}));

const InfoCard = styled(Card)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
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

// Only log an analytics event once
function logAnalyticsEvent(analytics, eventName, params, loggedRef) {
  if (!loggedRef.current && analytics) {
    logEvent(analytics, eventName, params);
    loggedRef.current = true;
  }
}

export default function PoolView() {
  const { poolId } = useParams();
  const navigate = useNavigate();

  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";

  const db = getDb();
  const [analytics, setAnalytics] = useState(null);

  const [poolData, setPoolData] = useState(null);
  const [participants, setParticipants] = useState({});
  const [matchups, setMatchups] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveScores, setLiveScores] = useState([]);
  const [scoreError, setScoreError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // For manage/scores modals
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [enterScoresOpen, setEnterScoresOpen] = useState(false);

  // Sorting states
  const [sortBy, setSortBy] = useState("overall");
  const [payouts, setPayouts] = useState({});
  const [rankingsData, setRankingsData] = useState({
    overall: [],
    byPeriod: { q1: [], q2: [], q3: [], final: [] },
    stripClaims: [],
    pickemResults: [],
    survivorResults: [],
  });

  // Analytics log flags
  const hasLoggedPageView = useRef(false);
  const hasLoggedBackClick = useRef(false);
  const hasLoggedManageMembersClick = useRef(false);
  const hasLoggedEnterScoresClick = useRef(false);
  const hasLoggedRefreshClick = useRef(false);
  const hasLoggedSortChange = useRef(false);

  // 1) Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // 2) Reset flags
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedBackClick.current = false;
    hasLoggedManageMembersClick.current = false;
    hasLoggedEnterScoresClick.current = false;
    hasLoggedRefreshClick.current = false;
    hasLoggedSortChange.current = false;
  }, [user?.uid, poolId]);

  // 3) Log page view
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "pool_view_page_viewed", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("PoolView - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [analytics, user?.uid, poolId]);

  // 4) Listen for pool doc changes in real time
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      navigate("/login");
      return;
    }
    if (!poolId) {
      setError("Invalid pool ID.");
      setLoading(false);
      return;
    }

    const poolRef = doc(db, "pools", poolId);
    const unsubscribe = onSnapshot(
      poolRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Pool not found.");
          setLoading(false);
          return;
        }
        const data = snapshot.data();
        setPoolData({ ...data, id: snapshot.id });
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("PoolView - Error fetching pool data:", err);
        let userFriendlyError = "Failed to load pool data. Please try again.";
        if (err.code === "permission-denied") {
          userFriendlyError = "You do not have permission to view this pool.";
        } else if (err.code === "unavailable") {
          userFriendlyError = "Firestore is currently unavailable.";
        }
        setError(userFriendlyError);
        setLoading(false);

        if (analytics) {
          logEvent(analytics, "pool_fetch_failed", {
            userId: user?.uid || "anonymous",
            poolId,
            error_message: userFriendlyError,
            timestamp: new Date().toISOString(),
          });
        }
      }
    );

    return () => unsubscribe();
  }, [authLoading, user, poolId, navigate, db, analytics]);

  // 5) If pickem => fetch matchups sub-collection
  useEffect(() => {
    if (!poolId || !poolData) return;
    const formatLower = (poolData.format || "").toLowerCase();
    if (formatLower !== "pickem") return;

    (async () => {
      try {
        const matchupsRef = collection(db, "pools", poolId, "matchups");
        const snap = await getDocs(matchupsRef);
        const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setMatchups(data);
      } catch (err) {
        console.error("PoolView - Error fetching pickem matchups:", err);
        if (analytics) {
          logEvent(analytics, "fetch_matchups_failed", {
            userId: user?.uid || "anonymous",
            poolId,
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
        }
      }
    })();
  }, [poolData, poolId, analytics, db]);

  // 6) If participants => fetch them
  useEffect(() => {
    if (!poolId || !poolData) return;

    (async () => {
      try {
        const partRef = collection(db, "pools", poolId, "participants");
        const snap = await getDocs(partRef);
        const partMap = {};
        snap.forEach((dsnap) => {
          const d = dsnap.data();
          partMap[dsnap.id] = {
            displayName: d.displayName || `User (${dsnap.id.slice(0, 8)})`,
            picks: d.picks || {},
            status: d.status || "active",
            weeksSurvived: d.weeksSurvived || 0,
          };
        });

        // Merge in membersMeta
        if (poolData.membersMeta) {
          Object.entries(poolData.membersMeta).forEach(([uid, meta]) => {
            if (!partMap[uid]) {
              partMap[uid] = {};
            }
            if (meta.displayName) {
              partMap[uid].displayName = meta.displayName;
            }
          });
        }
        // offlineUsers
        if (poolData.offlineUsers?.length) {
          poolData.offlineUsers.forEach((oUser) => {
            partMap[oUser.id] = { displayName: oUser.name };
          });
        }

        setParticipants(partMap);
      } catch (err) {
        console.error("PoolView - Error fetching participants:", err);
        if (analytics) {
          logEvent(analytics, "fetch_participants_failed", {
            userId: user?.uid || "anonymous",
            poolId,
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
        }
      }
    })();
  }, [poolData, poolId, analytics, db]);

  // 7) Live scores => using fetchSchedule
  useEffect(() => {
    if (!poolData || !poolData.sport || !poolData.eventDate) return;

    const fetchLiveScores = async () => {
      setScoreError("");
      try {
        const eventDate = poolData.eventDate.toDate().toISOString().split("T")[0];
        const scoreDocRef = doc(
          db,
          "scores",
          `${poolData.sport}_${poolData.id}_${eventDate}`
        );
        const docSnap = await getDoc(scoreDocRef);

        const now = Date.now();
        const fiveMin = 5 * 60 * 1000;
        if (docSnap.exists()) {
          const { events, lastUpdated } = docSnap.data();
          if (now - new Date(lastUpdated).getTime() < fiveMin) {
            setLiveScores(events);
            return;
          }
        }

        // fetch fresh from sportsRadar
        const events = await fetchSchedule(poolData.sport, eventDate);
        if (!events.length) {
          setScoreError("No live scores available for this event.");
        } else {
          const { teamAName, teamBName } = poolData;
          const filtered = teamAName && teamBName
            ? events.filter(
                (ev) =>
                  (ev.strHomeTeam === teamAName && ev.strAwayTeam === teamBName) ||
                  (ev.strHomeTeam === teamBName && ev.strAwayTeam === teamAName)
              )
            : events;
          if (!filtered.length) {
            setScoreError("No matching game found for this pool.");
          } else {
            setLiveScores(filtered);
            await setDoc(scoreDocRef, {
              events: filtered,
              lastUpdated: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error("PoolView - Error fetching live scores:", err);
        setScoreError("Failed to fetch live scores. Please try again later.");
        if (analytics) {
          logEvent(analytics, "live_scores_fetch_failed", {
            userId: user?.uid || "anonymous",
            poolId,
            sport: poolData.sport,
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
        }
      }
    };

    fetchLiveScores();
    const intv = setInterval(fetchLiveScores, 5 * 60 * 1000);
    return () => clearInterval(intv);
  }, [poolData, analytics, db]);

  // isCommissioner
  const isCommissioner = poolData?.commissionerId === user?.uid;

  // Handlers
  const handleBackClick = () => {
    if (!hasLoggedBackClick.current && analytics) {
      logEvent(analytics, "pool_view_back_clicked", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      hasLoggedBackClick.current = true;
    }
    navigate("/dashboard");
  };

  const handleManageMembersClick = () => {
    setManageMembersOpen(true);
    if (!hasLoggedManageMembersClick.current && analytics) {
      logEvent(analytics, "manage_members_clicked", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      hasLoggedManageMembersClick.current = true;
    }
  };

  const handleEnterScoresClick = () => {
    setEnterScoresOpen(true);
    if (!hasLoggedEnterScoresClick.current && analytics) {
      logEvent(analytics, "enter_scores_clicked", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      hasLoggedEnterScoresClick.current = true;
    }
  };

  const handleRefresh = () => {
    if (!hasLoggedRefreshClick.current && analytics) {
      logEvent(analytics, "pool_view_refreshed", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      hasLoggedRefreshClick.current = true;
    }
    setLoading(true);
    setError("");
  };

  // Display name helper
  const getUserDisplayName = (uid) => {
    if (!uid) return "N/A";
    if (uid.startsWith("offline_")) {
      const offUser = poolData.offlineUsers?.find((o) => o.id === uid);
      return offUser ? offUser.name : `Offline User (${uid.slice(-4)})`;
    }
    if (participants[uid]?.displayName) {
      return participants[uid].displayName;
    }
    return `User (${uid.slice(0, 8)})`;
  };

  // 8) Compute payouts & rankings
  useEffect(() => {
    if (!poolData) return;

    // normalize format
    const formatLower = (poolData.format || "").toLowerCase();

    // If the format is not recognized => set sortBy("") so MUI doesn’t complain
    if (
      !["squares", "strip_cards", "pickem", "survivor"].includes(formatLower)
    ) {
      setSortBy("");
      return;
    }

    let localPayouts = {};
    if (poolData.totalPot && poolData.totalPot !== "Donations only") {
      const potVal = parseFloat(poolData.totalPot);
      const struct = poolData.payoutStructure || {
        q1: 0.2,
        q2: 0.2,
        q3: 0.2,
        final: 0.4,
      };
      localPayouts = {
        q1: (potVal * struct.q1).toFixed(2),
        q2: (potVal * struct.q2).toFixed(2),
        q3: (potVal * struct.q3).toFixed(2),
        final: (potVal * struct.final).toFixed(2),
      };
    }
    setPayouts(localPayouts);

    const memberIds = poolData.memberIds || [];
    const squares = formatLower === "squares" ? poolData.squares || {} : {};
    const strips = formatLower === "strip_cards" ? poolData.strips || {} : {};

    const overall = [];
    const byPeriod = { q1: [], q2: [], q3: [], final: [] };
    const stripClaims = [];
    const pickemResults = [];
    const survivorResults = [];

    // squares
    if (formatLower === "squares") {
      const winners = poolData.winners || {};
      const potNum = parseFloat(poolData.totalPot || 0);
      const pStruct =
        poolData.payoutStructure || { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 };
      const payMap = {
        q1: potNum * pStruct.q1,
        q2: potNum * pStruct.q2,
        q3: potNum * pStruct.q3,
        final: potNum * pStruct.final,
      };

      const userWins = {};
      const userWinnings = { q1: {}, q2: {}, q3: {}, final: {} };
      memberIds.forEach((uid) => {
        userWins[uid] = { overall: 0 };
        Object.values(squares).forEach((sq) => {
          if (sq.userId === uid) {
            const sqNumber = sq.row * 10 + sq.col + 1;
            ["q1", "q2", "q3", "final"].forEach((prd) => {
              if (winners[prd] === sqNumber) {
                userWins[uid].overall += 1;
                userWinnings[prd][uid] =
                  (userWinnings[prd][uid] || 0) + payMap[prd];
              }
            });
          }
        });
      });

      memberIds.forEach((uid) => {
        overall.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          wins: userWins[uid].overall,
        });
      });
      overall.sort((a, b) => b.wins - a.wins);

      ["q1", "q2", "q3", "final"].forEach((prd) => {
        const temp = [];
        memberIds.forEach((uid) => {
          if (userWinnings[prd][uid]) {
            temp.push({
              userId: uid,
              displayName: getUserDisplayName(uid),
              winnings: userWinnings[prd][uid],
            });
          }
        });
        temp.sort((a, b) => b.winnings - a.winnings);
        byPeriod[prd] = temp;
      });
    }
    // strip_cards
    else if (formatLower === "strip_cards") {
      memberIds.forEach((uid) => {
        let claimed = 0;
        Object.values(strips).forEach((st) => {
          if (st.userId === uid) {
            claimed++;
            stripClaims.push({
              userId: uid,
              displayName: getUserDisplayName(uid),
              stripNumber: st.number,
              claimedAt: st.claimedAt,
            });
          }
        });
        overall.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          claimed,
        });
      });
      overall.sort((a, b) => b.claimed - a.claimed);
      stripClaims.sort(
        (a, b) =>
          (b.claimedAt?.toDate?.() || 0) -
          (a.claimedAt?.toDate?.() || 0)
      );
    }
    // pickem
    else if (formatLower === "pickem") {
      memberIds.forEach((uid) => {
        let correct = 0;
        matchups.forEach((m) => {
          const userPick = participants[uid]?.picks?.[m.id];
          if (userPick && m.winner && userPick === m.winner) {
            correct++;
          }
        });
        pickemResults.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          correctPicks: correct,
        });
      });
      overall.push(...pickemResults);
      overall.sort((a, b) => b.correctPicks - a.correctPicks);
    }
    // survivor
    else if (formatLower === "survivor") {
      memberIds.forEach((uid) => {
        const part = participants[uid] || {};
        survivorResults.push({
          userId: uid,
          displayName: getUserDisplayName(uid),
          status: part.status || "active",
          weeksSurvived: part.weeksSurvived || 0,
        });
      });
      survivorResults.sort((a, b) => {
        if (a.status === b.status) {
          return b.weeksSurvived - a.weeksSurvived;
        }
        return a.status === "active" ? -1 : 1;
      });
      overall.push(...survivorResults);
    }

    setRankingsData({
      overall,
      byPeriod,
      stripClaims,
      pickemResults,
      survivorResults,
    });

    // If squares => ensure "sortBy" is in ["overall","q1","q2","q3","final"]
    // Otherwise => "overall"
    if (formatLower === "squares") {
      if (!["overall", "q1", "q2", "q3", "final"].includes(sortBy)) {
        setSortBy("overall");
      }
    } else if (
      ["strip_cards", "pickem", "survivor"].includes(formatLower) &&
      sortBy !== "overall"
    ) {
      setSortBy("overall");
    }
  }, [poolData, matchups, participants, sortBy, db]);

  // Displayed rankings depends on format
  const displayedRankings = useMemo(() => {
    if (!poolData) return [];
    const formatLower = (poolData.format || "").toLowerCase();

    if (formatLower === "squares") {
      return sortBy === "overall"
        ? rankingsData.overall
        : rankingsData.byPeriod[sortBy] || [];
    } else if (
      ["strip_cards", "pickem", "survivor"].includes(formatLower)
    ) {
      return rankingsData.overall;
    }
    // If unknown format => empty
    return [];
  }, [poolData, sortBy, rankingsData]);

  // Helper for squares scoreboard
  function getWinnerDisplay(winner, format) {
    if (!winner || !poolData) return "N/A";
    const fmt = (format || "").toLowerCase();

    if (fmt === "squares" && poolData.assignments) {
      const participant = poolData.assignments[winner];
      return participant || `Square #${winner}`;
    }
    if (fmt === "strip_cards" && poolData.participants) {
      const participant = poolData.participants[winner - 1];
      return participant || `Strip #${winner}`;
    }
    if (fmt === "custom_pool") {
      return winner;
    }
    return `Winner #${winner}`;
  }

  // Build custom theme
  const customTheme = useMemo(() => {
    if (!poolData?.theme) {
      return createTheme({ palette: { mode } });
    }
    return createTheme({
      palette: {
        mode,
        primary: {
          main: poolData.theme.primaryColor || "#1976d2",
        },
        secondary: {
          main: poolData.theme.secondaryColor || "#9c27b0",
        },
      },
    });
  }, [poolData?.theme, mode]);

  // Precompute squares game results
  const gameResults = useMemo(() => {
    if (!poolData) return [];
    const formatLower = (poolData.format || "").toLowerCase();
    if (formatLower !== "squares") return [];

    const winners = poolData.winners || {};
    const squaresObj = poolData.squares || {};
    const results = [];

    ["q1", "q2", "q3", "final"].forEach((period) => {
      const sqNumber = winners[period];
      if (sqNumber) {
        const sq = Object.values(squaresObj).find(
          (s) => s.row * 10 + s.col + 1 === sqNumber
        );
        if (sq) {
          results.push({
            period: period.toUpperCase(),
            squareNumber: sqNumber,
            winner: getUserDisplayName(sq.userId),
            payout: payouts[period] || 0,
          });
        }
      }
    });
    return results;
  }, [poolData, payouts]);

  // ---------------------------
  // RENDER
  // ---------------------------
  if (authLoading) {
    return (
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress
                sx={{ color: "#FFD700", mb: 2 }}
                aria-label="Loading authentication state"
              />
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
            </Box>
          </Fade>
        </Container>
      </PoolViewContainer>
    );
  }

  if (loading) {
    return (
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress
                sx={{ color: "#FFD700", mb: 2 }}
                aria-label="Loading pool data"
              />
              <Typography
                variant="body1"
                sx={{
                  mb: 2,
                  fontFamily: "'Poppins', sans-serif'",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                Loading pool data...
              </Typography>
            </Box>
          </Fade>
        </Container>
      </PoolViewContainer>
    );
  }

  if (error) {
    return (
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ py: 4 }}>
              <Alert
                severity="error"
                sx={{ mb: 2, borderRadius: 2 }}
                role="alert"
                aria-live="assertive"
              >
                {error}
              </Alert>
              <StyledButton
                onClick={handleBackClick}
                startIcon={<ArrowBackIcon />}
                aria-label="Back to dashboard"
              >
                Back to Dashboard
              </StyledButton>
            </Box>
          </Fade>
        </Container>
      </PoolViewContainer>
    );
  }

  if (!poolData) {
    return (
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ py: 4 }}>
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                Pool not found or no data.
              </Alert>
              <StyledButton
                onClick={handleBackClick}
                startIcon={<ArrowBackIcon />}
                aria-label="Back to dashboard"
              >
                Back to Dashboard
              </StyledButton>
            </Box>
          </Fade>
        </Container>
      </PoolViewContainer>
    );
  }

  return (
    <ThemeProvider theme={customTheme}>
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ py: 4 }}>
              {/* Title & Top Buttons */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 4,
                  flexWrap: "wrap",
                  gap: 2,
                }}
              >
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    fontFamily: "'Montserrat', sans-serif'",
                    color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  }}
                >
                  {poolData.poolName || "Untitled Pool"}
                </Typography>

                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {isCommissioner && (
                    <StyledButton
                      onClick={handleManageMembersClick}
                      aria-label="Manage members and payments"
                    >
                      Manage Members & Payments
                    </StyledButton>
                  )}
                  {isCommissioner &&
                    ["squares", "strip_cards", "custom_pool"].includes(
                      (poolData.format || "").toLowerCase()
                    ) && (
                      <StyledButton
                        onClick={handleEnterScoresClick}
                        aria-label="Enter scores"
                      >
                        Enter Scores
                      </StyledButton>
                    )}
                  <StyledButton
                    onClick={handleRefresh}
                    startIcon={<RefreshIcon />}
                    aria-label="Refresh pool data"
                  >
                    Refresh
                  </StyledButton>
                  <StyledButton
                    onClick={handleBackClick}
                    startIcon={<ArrowBackIcon />}
                    aria-label="Back to dashboard"
                  >
                    Back to Dashboard
                  </StyledButton>
                </Box>
              </Box>

              {/* Pool Info Row */}
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  {/* Pool Overview */}
                  <DetailCard variant="outlined">
                    <CardContent>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 600,
                          fontFamily: "'Poppins', sans-serif'",
                          color: isDarkMode ? "#FFFFFF" : "#0B162A",
                          mb: 2,
                        }}
                      >
                        Pool Overview
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          mb: 1,
                          fontFamily: "'Poppins', sans-serif'",
                          color: isDarkMode ? "#B0BEC5" : "#555555",
                        }}
                      >
                        <strong>Sport:</strong> {poolData.sport || "N/A"}
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          mb: 1,
                          fontFamily: "'Poppins', sans-serif'",
                          color: isDarkMode ? "#B0BEC5" : "#555555",
                        }}
                      >
                        <strong>Format:</strong>{" "}
                        {poolData.formatName || poolData.format || "N/A"}
                      </Typography>

                      {/* Instead of wrapping the Chip in Typography, break it out */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                        <Typography
                          variant="body1"
                          sx={{
                            fontFamily: "'Poppins', sans-serif'",
                            color: isDarkMode ? "#B0BEC5" : "#555555",
                          }}
                        >
                          <strong>Status:</strong>
                        </Typography>
                        <Chip
                          label={poolData.status || "N/A"}
                          size="small"
                          color={
                            poolData.status === "open"
                              ? "success"
                              : poolData.status === "closed"
                              ? "warning"
                              : "default"
                          }
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                          aria-label={`Pool status: ${poolData.status || "N/A"}`}
                        />
                      </Box>

                      <Typography
                        variant="body1"
                        sx={{
                          mb: 1,
                          fontFamily: "'Poppins', sans-serif'",
                          color: isDarkMode ? "#B0BEC5" : "#555555",
                        }}
                      >
                        <strong>Members:</strong>{" "}
                        {poolData.memberIds?.length || 1}
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          mb: 1,
                          fontFamily: "'Poppins', sans-serif'",
                          color: isDarkMode ? "#B0BEC5" : "#555555",
                        }}
                      >
                        <strong>Commissioner:</strong>{" "}
                        {isCommissioner ? "You" : poolData.commissionerId}
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          mb: 1,
                          fontFamily: "'Poppins', sans-serif'",
                          color: isDarkMode ? "#B0BEC5" : "#555555",
                        }}
                      >
                        <strong>Created:</strong>{" "}
                        {poolData.createdAt?.toDate
                          ? poolData.createdAt.toDate().toLocaleDateString()
                          : "N/A"}
                      </Typography>
                    </CardContent>
                  </DetailCard>
                </Grid>

                {(poolData.teamAName ||
                  poolData.teamBName ||
                  (poolData.format || "").toLowerCase() === "custom_pool") && (
                  <Grid item xs={12} md={6}>
                    {/* Teams, Scores & Winners */}
                    <DetailCard variant="outlined">
                      <CardContent>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 600,
                            fontFamily: "'Poppins', sans-serif'",
                            color: isDarkMode ? "#FFFFFF" : "#0B162A",
                            mb: 2,
                          }}
                        >
                          Teams, Scores & Winners
                        </Typography>

                        {["squares", "strip_cards"].includes(
                          (poolData.format || "").toLowerCase()
                        ) && (
                          <>
                            <Typography
                              variant="body1"
                              sx={{
                                mb: 1,
                                fontFamily: "'Poppins', sans-serif'",
                                color: isDarkMode ? "#B0BEC5" : "#555555",
                              }}
                            >
                              <strong>Team A:</strong>{" "}
                              {poolData.teamAName || "N/A"}
                            </Typography>
                            <Typography
                              variant="body1"
                              sx={{
                                mb: 1,
                                fontFamily: "'Poppins', sans-serif'",
                                color: isDarkMode ? "#B0BEC5" : "#555555",
                              }}
                            >
                              <strong>Team B:</strong>{" "}
                              {poolData.teamBName || "N/A"}
                            </Typography>

                            {/* Live Scores */}
                            {scoreError && (
                              <Typography
                                variant="body2"
                                sx={{
                                  mb: 1,
                                  fontFamily: "'Poppins', sans-serif'",
                                  color: isDarkMode ? "#FF6F61" : "#D32F2F",
                                }}
                              >
                                {scoreError}
                              </Typography>
                            )}
                            {liveScores.length > 0 && (
                              <>
                                <Typography
                                  variant="body1"
                                  sx={{
                                    mb: 1,
                                    fontFamily: "'Poppins', sans-serif'",
                                    color: isDarkMode ? "#B0BEC5" : "#555555",
                                    fontWeight: 600,
                                  }}
                                >
                                  Live Scores:
                                </Typography>
                                {liveScores.map((ev) => (
                                  <Typography
                                    key={ev.idEvent}
                                    variant="body1"
                                    sx={{
                                      mb: 1,
                                      fontFamily: "'Poppins', sans-serif'",
                                      color: isDarkMode ? "#B0BEC5" : "#555555",
                                    }}
                                  >
                                    {ev.strEvent}:{" "}
                                    {ev.intHomeScore || "N/A"} -{" "}
                                    {ev.intAwayScore || "N/A"}
                                    {ev.strStatus === "Match Finished" && " (Final)"}
                                  </Typography>
                                ))}
                              </>
                            )}

                            {/* Commissioner Entered Scores */}
                            {poolData.scores && (
                              <>
                                <Typography
                                  variant="body1"
                                  sx={{
                                    mb: 1,
                                    mt: liveScores.length > 0 ? 2 : 0,
                                    fontFamily: "'Poppins', sans-serif'",
                                    color: isDarkMode ? "#B0BEC5" : "#555555",
                                    fontWeight: 600,
                                  }}
                                >
                                  Manual Scores (Commissioner Entered):
                                </Typography>
                                {["q1", "q2", "q3", "final"].map((period) => {
                                  const scr = poolData.scores[period];
                                  if (!scr) return null;
                                  return (
                                    <Typography
                                      key={period}
                                      variant="body1"
                                      sx={{
                                        mb: 1,
                                        fontFamily: "'Poppins', sans-serif'",
                                        color: isDarkMode ? "#B0BEC5" : "#555555",
                                      }}
                                    >
                                      <strong>{period.toUpperCase()}:</strong>{" "}
                                      {poolData.teamAName || "Team A"}{" "}
                                      {scr.teamA ?? 0} -{" "}
                                      {poolData.teamBName || "Team B"}{" "}
                                      {scr.teamB ?? 0}
                                      {poolData.winners?.[period] && (
                                        <span>
                                          {" "}
                                          (Winner:{" "}
                                          {getWinnerDisplay(
                                            poolData.winners[period],
                                            poolData.format
                                          )}
                                          )
                                        </span>
                                      )}
                                    </Typography>
                                  );
                                })}
                              </>
                            )}
                          </>
                        )}

                        {/* custom_pool final winner */}
                        {(poolData.format || "").toLowerCase() === "custom_pool" &&
                          poolData.winners?.final && (
                            <Typography
                              variant="body1"
                              sx={{
                                mb: 1,
                                fontFamily: "'Poppins', sans-serif'",
                                color: isDarkMode ? "#B0BEC5" : "#555555",
                              }}
                            >
                              <strong>Winner:</strong>{" "}
                              {getWinnerDisplay(
                                poolData.winners.final,
                                poolData.format
                              )}
                            </Typography>
                          )}
                      </CardContent>
                    </DetailCard>
                  </Grid>
                )}
              </Grid>

              {/* Squares Grid */}
              {(poolData.format || "").toLowerCase() === "squares" && (
                <Box sx={{ mt: 2 }}>
                  <SquaresGrid poolId={poolId} poolData={poolData} />
                </Box>
              )}

              {/* Strip Cards */}
              {(poolData.format || "").toLowerCase() === "strip_cards" && (
                <Box sx={{ mt: 2 }}>
                  <StripCardList poolId={poolId} poolData={poolData} />
                </Box>
              )}

              {/* Pickem Board */}
              {(poolData.format || "").toLowerCase() === "pickem" && (
                <Box sx={{ mt: 2 }}>
                  <SectionTitle variant="h5">Pick'em Board</SectionTitle>
                  <PickemBoard poolId={poolId} />
                </Box>
              )}

              {/* Survivor Board */}
              {(poolData.format || "").toLowerCase() === "survivor" && (
                <Box sx={{ mt: 2 }}>
                  <SectionTitle variant="h5">Survivor Pool</SectionTitle>
                  <SurvivorBoard poolId={poolId} />
                </Box>
              )}

              {/* Current Scores */}
              {poolData.scores && (
                <InfoCard role="region" aria-label="Current scores section">
                  <SectionTitle variant="h6">Current Scores</SectionTitle>
                  {["q1", "q2", "q3", "final"].map((period) => {
                    const val = poolData.scores[period];
                    if (!val) return null;
                    return (
                      <Box
                        key={period}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {period.toUpperCase()}: {val.teamA} - {val.teamB}
                        </Typography>
                        {payouts[period] && (
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: "'Poppins', sans-serif'",
                              color: isDarkMode ? "#34d399" : "#16a34a",
                            }}
                          >
                            Payout: ${payouts[period]}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </InfoCard>
              )}

              {/* Squares game results */}
              {(poolData.format || "").toLowerCase() === "squares" &&
                gameResults.length > 0 && (
                  <InfoCard role="region" aria-label="Game results section">
                    <SectionTitle variant="h6">Game Results</SectionTitle>
                    {gameResults.map((res) => (
                      <Box
                        key={res.period}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {res.period}: Square {res.squareNumber} won by {res.winner}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "'Poppins', sans-serif'",
                            color: isDarkMode ? "#34d399" : "#16a34a",
                          }}
                        >
                          Payout: ${res.payout}
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}

              {/* Strip card claims */}
              {(poolData.format || "").toLowerCase() === "strip_cards" &&
                rankingsData.stripClaims?.length > 0 && (
                  <InfoCard
                    role="region"
                    aria-label="Strip card claims section"
                  >
                    <SectionTitle variant="h6">Strip Card Claims</SectionTitle>
                    {rankingsData.stripClaims.map((cl, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          Strip #{cl.stripNumber} claimed by {cl.displayName}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          Claimed on:{" "}
                          {cl.claimedAt?.toDate?.().toLocaleString() || "N/A"}
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}

              {/* Pick'em results */}
              {(poolData.format || "").toLowerCase() === "pickem" &&
                rankingsData.pickemResults?.length > 0 && (
                  <InfoCard
                    role="region"
                    aria-label="Pick'em results section"
                  >
                    <SectionTitle variant="h6">Pick'em Results</SectionTitle>
                    {rankingsData.pickemResults.map((res, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {res.displayName}: {res.correctPicks} Correct Picks
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}

              {/* Survivor results */}
              {(poolData.format || "").toLowerCase() === "survivor" &&
                rankingsData.survivorResults?.length > 0 && (
                  <InfoCard
                    role="region"
                    aria-label="Survivor results section"
                  >
                    <SectionTitle variant="h6">Survivor Results</SectionTitle>
                    {rankingsData.survivorResults.map((res, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {res.displayName}: {res.status}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                        >
                          Weeks Survived: {res.weeksSurvived}
                        </Typography>
                      </Box>
                    ))}
                  </InfoCard>
                )}

              {/* Member Rankings */}
              {(() => {
                const fmt = (poolData.format || "").toLowerCase();
                // Only show the "sort" UI if recognized format
                if (!["squares", "strip_cards", "pickem", "survivor"].includes(fmt)) {
                  return null;
                }
                return (
                  <InfoCard role="region" aria-label="Member rankings section">
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <SectionTitle variant="h6">Member Rankings</SectionTitle>
                      <FormControl sx={{ minWidth: 120 }}>
                        <InputLabel
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                          id="sort-rankings-label"
                        >
                          Sort By
                        </InputLabel>
                        <Select
                          labelId="sort-rankings-label"
                          value={sortBy}
                          onChange={(e) => {
                            setSortBy(e.target.value);
                            if (!hasLoggedSortChange.current && analytics) {
                              logAnalyticsEvent(
                                analytics,
                                "pool_view_sort_changed",
                                {
                                  poolId,
                                  userId: user?.uid || "anonymous",
                                  sortBy: e.target.value,
                                  timestamp: new Date().toISOString(),
                                },
                                hasLoggedSortChange
                              );
                            }
                          }}
                          sx={{ fontFamily: "'Poppins', sans-serif'" }}
                          aria-label="Sort rankings"
                          aria-describedby="sort-rankings-label"
                        >
                          {fmt === "squares" && (
                            <>
                              <MenuItem
                                value="overall"
                                sx={{ fontFamily: "'Poppins', sans-serif'" }}
                              >
                                Overall Wins
                              </MenuItem>
                              <MenuItem
                                value="q1"
                                sx={{ fontFamily: "'Poppins', sans-serif'" }}
                              >
                                Q1 Wins
                              </MenuItem>
                              <MenuItem
                                value="q2"
                                sx={{ fontFamily: "'Poppins', sans-serif'" }}
                              >
                                Q2 Wins
                              </MenuItem>
                              <MenuItem
                                value="q3"
                                sx={{ fontFamily: "'Poppins', sans-serif'" }}
                              >
                                Q3 Wins
                              </MenuItem>
                              <MenuItem
                                value="final"
                                sx={{ fontFamily: "'Poppins', sans-serif'" }}
                              >
                                Final Wins
                              </MenuItem>
                            </>
                          )}
                          {fmt === "strip_cards" && (
                            <MenuItem
                              value="overall"
                              sx={{ fontFamily: "'Poppins', sans-serif'" }}
                            >
                              Claimed Strips
                            </MenuItem>
                          )}
                          {fmt === "pickem" && (
                            <MenuItem
                              value="overall"
                              sx={{ fontFamily: "'Poppins', sans-serif'" }}
                            >
                              Overall Correct Picks
                            </MenuItem>
                          )}
                          {fmt === "survivor" && (
                            <MenuItem
                              value="overall"
                              sx={{ fontFamily: "'Poppins', sans-serif'" }}
                            >
                              Survival Duration
                            </MenuItem>
                          )}
                        </Select>
                      </FormControl>
                    </Box>

                    {rankingsData.overall.length > 0 ? (
                      <Box role="list" aria-label="Member rankings">
                        {displayedRankings.map((rank, index) => {
                          let valueLabel = "N/A";

                          if (fmt === "squares" && sortBy === "overall") {
                            valueLabel = `${rank.wins} Wins`;
                          } else if (fmt === "squares") {
                            // per q1/q2/q3/final
                            valueLabel = rank.winnings
                              ? `$${rank.winnings.toFixed(2)}`
                              : "$0.00";
                          } else if (fmt === "strip_cards") {
                            valueLabel = `${rank.claimed} Claimed`;
                          } else if (fmt === "pickem") {
                            valueLabel = `${rank.correctPicks} Correct Picks`;
                          } else if (fmt === "survivor") {
                            valueLabel = `${rank.weeksSurvived} Weeks (${rank.status})`;
                          }

                          const highlightColor =
                            index === 0
                              ? isDarkMode
                                ? "#ff9500"
                                : "#f97316"
                              : index === 1
                              ? isDarkMode
                                ? "#C0C0C0"
                                : "#A9A9A9"
                              : index === 2
                              ? isDarkMode
                                ? "#CD7F32"
                                : "#B87333"
                              : "transparent";

                          return (
                            <motion.div
                              key={rank.userId}
                              role="listitem"
                              aria-label={`Rank ${index + 1}: ${rank.displayName}`}
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
                                  backgroundColor: highlightColor,
                                  borderRadius: index <= 2 ? 1 : 0,
                                  p: index <= 2 ? 1 : 0,
                                  color: index <= 2 ? "#ffffff" : undefined,
                                }}
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
                                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                                >
                                  {valueLabel}
                                </Typography>
                              </Box>
                            </motion.div>
                          );
                        })}
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "'Poppins', sans-serif'" }}
                      >
                        No rankings available yet for{" "}
                        {sortBy === "overall"
                          ? "this pool"
                          : `${sortBy.toUpperCase()} period`}
                        .
                      </Typography>
                    )}
                  </InfoCard>
                );
              })()}
            </Box>
          </Fade>
        </Container>

        {/* ManageMembersModal */}
        <ManageMembersModal
          open={manageMembersOpen}
          onClose={() => setManageMembersOpen(false)}
          poolId={poolId}
        />

        {/* EnterScoresModal */}
        <EnterScoresModal
          open={enterScoresOpen}
          onClose={() => setEnterScoresOpen(false)}
          poolId={poolId}
          poolData={poolData}
        />

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
          >
            {successMessage}
          </Alert>
        </Snackbar>
      </PoolViewContainer>
    </ThemeProvider>
  );
}
