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

// Styled components for polished UI
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

function PoolView() {
  const { poolId } = useParams();
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";
  const navigate = useNavigate();
  const [poolData, setPoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [enterScoresOpen, setEnterScoresOpen] = useState(false);
  const [liveScores, setLiveScores] = useState([]);
  const [scoreError, setScoreError] = useState("");
  const hasLoggedPageView = useRef(false);
  const hasLoggedBackClick = useRef(false);
  const hasLoggedManageMembersClick = useRef(false);
  const hasLoggedEnterScoresClick = useRef(false);

  // Track page view on mount (only once)
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

  // Fetch pool data with real-time updates
  useEffect(() => {
    if (authLoading) {
      return; // Wait for auth state to resolve
    }

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

  // Fetch live scores when pool data is available, with caching
  useEffect(() => {
    if (!poolData || !poolData.sport || !poolData.eventDate) return;

    const fetchLiveScores = async () => {
      setScoreError("");
      try {
        const eventDate = poolData.eventDate.toDate().toISOString().split("T")[0];
        const scoreDocRef = doc(db, "scores", `${poolData.sport}_${poolData.id}_${eventDate}`);

        const scoreDoc = await getDoc(scoreDocRef);
        if (scoreDoc.exists()) {
          const { events, lastUpdated } = scoreDoc.data();
          const lastUpdatedTime = new Date(lastUpdated).getTime();
          const currentTime = new Date().getTime();
          const fiveMinutes = 5 * 60 * 1000;

          if (currentTime - lastUpdatedTime < fiveMinutes) {
            setLiveScores(events);
            return;
          }
        }

        const events = await fetchScores(poolData.sport, eventDate);
        if (events.length === 0) {
          setScoreError("No live scores available for this event.");
        } else {
          const filteredEvents = poolData.teamAName && poolData.teamBName
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
    const interval = setInterval(fetchLiveScores, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [poolData, user?.uid, poolId]);

  // Handle back navigation
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

  // Handle opening the Manage Members modal
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

  // Handle opening the Enter Scores modal
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

  // Reset analytics logging flags when user or poolId changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedBackClick.current = false;
    hasLoggedManageMembersClick.current = false;
    hasLoggedEnterScoresClick.current = false;
  }, [user?.uid, poolId]);

  // Show loading UI while auth state is resolving
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

  // Show loading UI while fetching pool data
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

  // Show error message if fetching fails or pool not found
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

  // Check if user is the commissioner
  const isCommissioner = poolData?.commissionerId === user.uid;

  // Helper function to get winner display text
  const getWinnerDisplay = (winner, format) => {
    if (!winner || !poolData) return "N/A";
    if (format === "squares" && poolData.assignments) {
      const participant = poolData.assignments[winner];
      return participant || `Square #${winner}`;
    } else if (format === "strip_cards" && poolData.participants) {
      const participant = poolData.participants[winner - 1];
      return participant || `Strip #${winner}`;
    } else if (format === "custom_pool") {
      return winner;
    }
    return `Winner #${winner}`;
  };

  // Render the pool details if data is available
  return (
    <PoolViewContainer>
      <Container maxWidth="lg">
        <Fade in timeout={1000}>
          <Box sx={{ py: 4 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
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
                {isCommissioner && (poolData.format === "squares" || poolData.format === "strip_cards" || poolData.format === "custom_pool") && (
                  <StyledButton
                    onClick={handleEnterScoresClick}
                    aria-label="Enter scores"
                  >
                    Enter Scores
                  </StyledButton>
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

              {/* Teams, Scores, and Winners (if applicable) */}
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

                          {/* Live Scores Section */}
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

                          {/* Manual Scores Section (if available) */}
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

              {/* Render Squares Grid for squares format */}
              {poolData.format === "squares" && (
                <Grid item xs={12}>
                  <SquaresGrid poolId={poolId} poolData={poolData} />
                </Grid>
              )}

              {/* Render Strip Card List for strip_cards format */}
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

export default PoolView;