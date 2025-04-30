// /src/pages/PoolView.js
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useThemeContext } from "../contexts/ThemeContext";
import { db, analytics } from "../firebase/config";
import { doc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import { fetchScores } from "../utils/api";

import {
  Container,
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Fade,
  styled,
  Grid,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ManageMembersModal from "../modals/ManageMembersModal";
import EnterScoresModal from "../modals/EnterScoresModal";
import SquaresGrid from "../components/SquaresGrid";
import StripCardList from "../components/StripCardList";

// ------------------------------------
// Styled Components
// ------------------------------------
const PoolViewContainer = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === "dark"
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
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

// ------------------------------------
// Main Component
// ------------------------------------
export default function PoolView() {
  // 1) Hooks at the top
  const { poolId } = useParams();
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";

  const [poolData, setPoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [enterScoresOpen, setEnterScoresOpen] = useState(false);
  const [liveScores, setLiveScores] = useState([]);
  const [scoreError, setScoreError] = useState("");

  // Refs for analytics logging
  const hasLoggedPageView = useRef(false);
  const hasLoggedBackClick = useRef(false);
  const hasLoggedManageMembersClick = useRef(false);
  const hasLoggedEnterScoresClick = useRef(false);

  // 2) Reset certain analytics flags if user or pool changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedBackClick.current = false;
    hasLoggedManageMembersClick.current = false;
    hasLoggedEnterScoresClick.current = false;
  }, [user?.uid, poolId]);

  // 3) Track page view once
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
  }, [user?.uid, poolId]);

  // 4) Real-time listener for pool doc
  useEffect(() => {
    if (authLoading) return; // Wait for auth to resolve
    if (!user) {
      // Not logged in => redirect
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
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPoolData({ ...data, id: snapshot.id });
          setLoading(false);
        } else {
          setError("Pool not found.");
          setLoading(false);
        }
      },
      (err) => {
        console.error("PoolView - Error fetching pool data:", err);
        let userFriendlyError = "Failed to load pool data. Please try again.";
        if (err.code === "permission-denied") {
          userFriendlyError = "You do not have permission to view this pool.";
        } else if (err.code === "unavailable") {
          userFriendlyError = "Firestore is currently unavailable. Please try again later.";
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
          console.log("PoolView - Pool fetch failure logged to Firebase Analytics");
        }
      }
    );

    return () => unsubscribe();
  }, [user, authLoading, poolId, navigate]);

  // 5) Live scores fetching / caching
  useEffect(() => {
    if (!poolData || !poolData.sport || !poolData.eventDate) return;

    const fetchLiveScores = async () => {
      setScoreError("");
      try {
        const eventDate = poolData.eventDate.toDate().toISOString().split("T")[0];
        const scoreDocRef = doc(db, "scores", `${poolData.sport}_${poolData.id}_${eventDate}`);

        // Try using cached doc first
        const scoreDoc = await getDoc(scoreDocRef);
        if (scoreDoc.exists()) {
          const { events, lastUpdated } = scoreDoc.data();
          const lastUpdatedTime = new Date(lastUpdated).getTime();
          const currentTime = new Date().getTime();
          const fiveMinutes = 5 * 60 * 1000;

          // If we cached in the last 5 min, use it
          if (currentTime - lastUpdatedTime < fiveMinutes) {
            setLiveScores(events);
            return;
          }
        }

        // Otherwise, fetch fresh from API
        const events = await fetchScores(poolData.sport, eventDate);
        if (events.length === 0) {
          setScoreError("No live scores available for this event.");
        } else {
          // Filter by teamAName/teamBName if present
          const filteredEvents = (poolData.teamAName && poolData.teamBName)
            ? events.filter(event =>
                (event.strHomeTeam === poolData.teamAName && event.strAwayTeam === poolData.teamBName) ||
                (event.strHomeTeam === poolData.teamBName && event.strAwayTeam === poolData.teamAName)
              )
            : events;

          if (filteredEvents.length === 0) {
            setScoreError("No matching game found for this pool.");
          } else {
            setLiveScores(filteredEvents);
            await setDoc(scoreDocRef, {
              events: filteredEvents,
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
            eventDate: poolData.eventDate.toDate().toISOString(),
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
          console.log("PoolView - Live scores fetch failure logged to Firebase Analytics");
        }
      }
    };

    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 5 * 60 * 1000); // Re-fetch every 5 min
    return () => clearInterval(interval);
  }, [poolData, poolId]);

  // 6) Handlers
  const handleBackClick = () => {
    if (!hasLoggedBackClick.current && analytics) {
      logEvent(analytics, "pool_view_back_clicked", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("PoolView - Back click logged to Firebase Analytics");
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
      console.log("PoolView - Manage members click logged to Firebase Analytics");
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
      console.log("PoolView - Enter scores click logged to Firebase Analytics");
      hasLoggedEnterScoresClick.current = true;
    }
  };

  // 7) Loading states
  if (authLoading) {
    return (
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress sx={{ color: "#FFD700", mb: 2 }} aria-label="Loading authentication state" />
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
              <CircularProgress sx={{ color: "#FFD700", mb: 2 }} aria-label="Loading pool data" />
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

  // 8) If error
  if (error) {
    return (
      <PoolViewContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ py: 4 }}>
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} role="alert" aria-live="assertive">
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

  // 9) Check if user is commissioner
  const isCommissioner = poolData?.commissionerId === user.uid;

  // Helper for winner display
  const getWinnerDisplay = (winner, format) => {
    if (!winner || !poolData) return "N/A";

    // For squares
    if (format === "squares" && poolData.assignments) {
      const participant = poolData.assignments[winner];
      return participant || `Square #${winner}`;
    }
    // For strip_cards
    if (format === "strip_cards" && poolData.participants) {
      const participant = poolData.participants[winner - 1];
      return participant || `Strip #${winner}`;
    }
    // For custom_pool
    if (format === "custom_pool") {
      return winner;
    }
    // fallback
    return `Winner #${winner}`;
  };

  // 10) Render the pool details
  return (
    <PoolViewContainer>
      <Container maxWidth="lg">
        <Fade in timeout={1000}>
          <Box sx={{ py: 4 }}>
            {/* Title & Top Actions */}
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
                {isCommissioner && (
                  (poolData.format === "squares" ||
                   poolData.format === "strip_cards" ||
                   poolData.format === "custom_pool"
                  ) && (
                    <StyledButton
                      onClick={handleEnterScoresClick}
                      aria-label="Enter scores"
                    >
                      Enter Scores
                    </StyledButton>
                  )
                )}
                <StyledButton
                  onClick={handleBackClick}
                  startIcon={<ArrowBackIcon />}
                  aria-label="Back to dashboard"
                >
                  Back to Dashboard
                </StyledButton>
              </Box>
            </Box>

            <Grid container spacing={3}>
              {/* Pool Overview */}
              <Grid item xs={12} md={6}>
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
                      <strong>Format:</strong> {poolData.formatName || poolData.format || "N/A"}
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        mb: 1,
                        fontFamily: "'Poppins', sans-serif'",
                        color: isDarkMode ? "#B0BEC5" : "#555555",
                      }}
                    >
                      <strong>Status:</strong>{" "}
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
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        mb: 1,
                        fontFamily: "'Poppins', sans-serif'",
                        color: isDarkMode ? "#B0BEC5" : "#555555",
                      }}
                    >
                      <strong>Members:</strong> {poolData.memberIds?.length || 1}
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
                      {poolData.commissionerId === user.uid ? "You" : poolData.commissionerId}
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

              {/* Teams, Scores, & Winners */}
              {(poolData.teamAName || poolData.teamBName || poolData.format === "custom_pool") && (
                <Grid item xs={12} md={6}>
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

                      {(poolData.format === "squares" || poolData.format === "strip_cards") && (
                        <>
                          <Typography
                            variant="body1"
                            sx={{
                              mb: 1,
                              fontFamily: "'Poppins', sans-serif'",
                              color: isDarkMode ? "#B0BEC5" : "#555555",
                            }}
                          >
                            <strong>Team A:</strong> {poolData.teamAName || "N/A"}
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{
                              mb: 1,
                              fontFamily: "'Poppins', sans-serif'",
                              color: isDarkMode ? "#B0BEC5" : "#555555",
                            }}
                          >
                            <strong>Team B:</strong> {poolData.teamBName || "N/A"}
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
                              {liveScores.map((event) => (
                                <Typography
                                  key={event.idEvent}
                                  variant="body1"
                                  sx={{
                                    mb: 1,
                                    fontFamily: "'Poppins', sans-serif'",
                                    color: isDarkMode ? "#B0BEC5" : "#555555",
                                  }}
                                >
                                  {event.strEvent}: {event.intHomeScore || "N/A"} - {event.intAwayScore || "N/A"}
                                  {event.strStatus === "Match Finished" && " (Final)"}
                                </Typography>
                              ))}
                            </>
                          )}

                          {/* Manual Scores (Commissioner Entered) */}
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
                              <Typography
                                variant="body1"
                                sx={{
                                  mb: 1,
                                  fontFamily: "'Poppins', sans-serif'",
                                  color: isDarkMode ? "#B0BEC5" : "#555555",
                                }}
                              >
                                <strong>Q1:</strong> {poolData.teamAName || "Team A"} {poolData.scores.q1?.teamA ?? 0} - {poolData.teamBName || "Team B"} {poolData.scores.q1?.teamB ?? 0}
                                {poolData.winners?.q1 && (
                                  <span> (Winner: {getWinnerDisplay(poolData.winners.q1, poolData.format)})</span>
                                )}
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{
                                  mb: 1,
                                  fontFamily: "'Poppins', sans-serif'",
                                  color: isDarkMode ? "#B0BEC5" : "#555555",
                                }}
                              >
                                <strong>Q2:</strong> {poolData.teamAName || "Team A"} {poolData.scores.q2?.teamA ?? 0} - {poolData.teamBName || "Team B"} {poolData.scores.q2?.teamB ?? 0}
                                {poolData.winners?.q2 && (
                                  <span> (Winner: {getWinnerDisplay(poolData.winners.q2, poolData.format)})</span>
                                )}
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{
                                  mb: 1,
                                  fontFamily: "'Poppins', sans-serif'",
                                  color: isDarkMode ? "#B0BEC5" : "#555555",
                                }}
                              >
                                <strong>Q3:</strong> {poolData.teamAName || "Team A"} {poolData.scores.q3?.teamA ?? 0} - {poolData.teamBName || "Team B"} {poolData.scores.q3?.teamB ?? 0}
                                {poolData.winners?.q3 && (
                                  <span> (Winner: {getWinnerDisplay(poolData.winners.q3, poolData.format)})</span>
                                )}
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{
                                  mb: 1,
                                  fontFamily: "'Poppins', sans-serif'",
                                  color: isDarkMode ? "#B0BEC5" : "#555555",
                                }}
                              >
                                <strong>Final:</strong> {poolData.teamAName || "Team A"} {poolData.scores.final?.teamA ?? 0} - {poolData.teamBName || "Team B"} {poolData.scores.final?.teamB ?? 0}
                                {poolData.winners?.final && (
                                  <span> (Winner: {getWinnerDisplay(poolData.winners.final, poolData.format)})</span>
                                )}
                              </Typography>
                            </>
                          )}
                        </>
                      )}

                      {/* Custom pool with final winner */}
                      {poolData.format === "custom_pool" && poolData.winners?.final && (
                        <Typography
                          variant="body1"
                          sx={{
                            mb: 1,
                            fontFamily: "'Poppins', sans-serif'",
                            color: isDarkMode ? "#B0BEC5" : "#555555",
                          }}
                        >
                          <strong>Winner:</strong> {getWinnerDisplay(poolData.winners.final, poolData.format)}
                        </Typography>
                      )}
                    </CardContent>
                  </DetailCard>
                </Grid>
              )}

              {/* Squares Grid */}
              {poolData.format === "squares" && (
                <Grid item xs={12}>
                  <SquaresGrid poolId={poolId} poolData={poolData} />
                </Grid>
              )}

              {/* Strip Cards List */}
              {poolData.format === "strip_cards" && (
                <Grid item xs={12}>
                  <StripCardList poolId={poolId} poolData={poolData} />
                </Grid>
              )}
            </Grid>
          </Box>
        </Fade>
      </Container>

      {/* Manage Members Modal */}
      <ManageMembersModal
        open={manageMembersOpen}
        onClose={() => setManageMembersOpen(false)}
        poolId={poolId}
      />

      {/* Enter Scores Modal */}
      <EnterScoresModal
        open={enterScoresOpen}
        onClose={() => setEnterScoresOpen(false)}
        poolId={poolId}
        poolData={poolData}
      />
    </PoolViewContainer>
  );
}

