import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useThemeContext } from "../contexts/ThemeContext";
import { getDb, getAnalyticsService } from "../firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import {
  Box,
  Container,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  CircularProgress,
  Fade,
  Grid,
  styled,
} from "@mui/material";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";

// Styled components for polished UI
const SettingsContainer = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === "dark"
    ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
    : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
  minHeight: "100vh",
  py: { xs: 6, md: 8 },
  px: { xs: 2, md: 4 },
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

/**
 * Page for commissioners to customize pool settings after creation.
 * @returns {JSX.Element} The rendered commissioner settings page.
 */
function CommissionerSettingsPage() {
  const { poolId } = useParams(); // Get poolId from URL
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const navigate = useNavigate();
  const isDarkMode = mode === "dark";
  const db = getDb();
  const [poolData, setPoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedPageView = useRef(false);
  const hasLoggedSettingsUpdated = useRef(false);

  // Form state for pool settings
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [gridSize, setGridSize] = useState(100); // For Squares
  const [picksPerWeek, setPicksPerWeek] = useState(1); // For Pick'em
  const [eliminationType, setEliminationType] = useState("single"); // For Survivor
  const [stripCardCount, setStripCardCount] = useState(10); // For Strip Cards

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Log page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "commissioner_settings_page_viewed", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("CommissionerSettingsPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, poolId, analytics]);

  // Fetch pool data and verify commissioner access
  useEffect(() => {
    const fetchPoolData = async () => {
      if (authLoading) return;

      if (!user) {
        navigate("/login");
        return;
      }

      try {
        setLoading(true);
        const poolRef = doc(db, "pools", poolId);
        const poolSnap = await getDoc(poolRef);

        if (!poolSnap.exists()) {
          setError("Pool not found.");
          setLoading(false);
          return;
        }

        const data = poolSnap.data();
        if (data.commissionerId !== user.uid) {
          setError("You do not have permission to manage this pool.");
          setLoading(false);
          return;
        }

        setPoolData(data);
        // Initialize form state with existing pool data
        setEventName(data.eventName || "");
        setEventDate(data.eventDate ? new Date(data.eventDate.toDate()).toISOString().split("T")[0] : "");
        setTeamA(data.teamA || "");
        setTeamB(data.teamB || "");
        setGridSize(data.gridSize || 100);
        setPicksPerWeek(data.picksPerWeek || 1);
        setEliminationType(data.eliminationType || "single");
        setStripCardCount(data.stripCardCount || 10);
      } catch (err) {
        console.error("CommissionerSettingsPage - Error fetching pool:", err);
        setError("Failed to load pool data. Please try again.");
        if (analytics) {
          logEvent(analytics, "fetch_pool_failed", {
            userId: user?.uid || "anonymous",
            poolId,
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
          console.log("CommissionerSettingsPage - Fetch pool failure logged to Firebase Analytics");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPoolData();
  }, [authLoading, user, poolId, navigate, analytics, db]);

  /**
   * Sanitizes input by removing HTML tags and special characters.
   * @param {string} input - The input string to sanitize.
   * @returns {string} The sanitized string.
   */
  const sanitizeInput = useCallback((input) => {
    const sanitized = input
      .replace(/<[^>]*>/g, "")
      .replace(/[&<>"'/]/g, (char) => {
        const entities = {
          "&": "&",
          "<": "<",
          ">": ">",
          '"': "\"",
          "'": "'",
          "/": "/",
        };
        return entities[char] || char;
      })
      .trim();
    return sanitized;
  }, []);

  /**
   * Handles saving the updated pool settings to Firestore.
   * @returns {Promise<void>}
   */
  const handleSaveSettings = useCallback(async () => {
    if (!poolData) return;

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const poolRef = doc(db, "pools", poolId);
      const updatedData = {
        eventName: sanitizeInput(eventName),
        eventDate: eventDate ? new Date(eventDate) : null,
        teamA: teamA ? sanitizeInput(teamA) : "",
        teamB: teamB ? sanitizeInput(teamB) : "",
        updatedAt: new Date(),
      };

      // Add pool-type-specific settings
      switch (poolData.format) {
        case "squares":
          updatedData.gridSize = gridSize;
          break;
        case "pickem":
          updatedData.picksPerWeek = picksPerWeek;
          break;
        case "survivor":
          updatedData.eliminationType = eliminationType;
          break;
        case "strip_cards":
          updatedData.stripCardCount = stripCardCount;
          break;
        default:
          break;
      }

      await updateDoc(poolRef, updatedData);
      setSuccessMessage("Settings updated successfully!");

      if (analytics && !hasLoggedSettingsUpdated.current) {
        logEvent(analytics, "pool_settings_updated", {
          userId: user?.uid || "anonymous",
          poolId,
          format: poolData.format,
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerSettingsPage - Pool settings updated logged to Firebase Analytics");
        hasLoggedSettingsUpdated.current = true;
      }
    } catch (err) {
      console.error("CommissionerSettingsPage - Error saving settings:", err);
      setError("Failed to save settings. Please try again.");
      if (analytics) {
        logEvent(analytics, "save_pool_settings_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("CommissionerSettingsPage - Save settings failure logged to Firebase Analytics");
      }
    } finally {
      setSaving(false);
    }
  }, [
    poolData,
    poolId,
    eventName,
    eventDate,
    teamA,
    teamB,
    gridSize,
    picksPerWeek,
    eliminationType,
    stripCardCount,
    user?.uid,
    analytics,
    db,
    sanitizeInput,
  ]);

  const handleCancel = useCallback(() => {
    navigate(`/pool/${poolId}`);
  }, [navigate, poolId]);

  // Render loading state
  if (authLoading || loading) {
    return (
      <SettingsContainer>
        <Container maxWidth="md">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress sx={{ mb: 2 }} aria-label="Loading commissioner settings page" />
              <Typography
                variant="h5"
                sx={{
                  mb: 2,
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif'",
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                }}
              >
                Loading Commissioner Settings
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mb: 3,
                  fontFamily: "'Poppins', sans-serif'",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                Please wait while we load the pool settings...
              </Typography>
            </Box>
          </Fade>
        </Container>
      </SettingsContainer>
    );
  }

  // Render error state
  if (error) {
    return (
      <SettingsContainer>
        <Container maxWidth="md">
          <Fade in timeout={500}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} role="alert" aria-live="assertive">
                {error}
              </Alert>
              <StyledButton
                onClick={() => navigate(`/pool/${poolId}`)}
                sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
                aria-label="Return to pool page"
              >
                Return to Pool
              </StyledButton>
            </Box>
          </Fade>
        </Container>
      </SettingsContainer>
    );
  }

  // Render the settings page
  return (
    <SettingsContainer>
      <Navbar />
      <Container maxWidth="md">
        <Fade in timeout={1000}>
          <Box>
            <Typography
              variant="h4"
              sx={{
                mb: 4,
                fontWeight: 700,
                fontFamily: "'Montserrat', sans-serif'",
                color: isDarkMode ? "#FFFFFF" : "#0B162A",
                textAlign: "center",
              }}
            >
              Manage Pool Settings
            </Typography>
            {successMessage && (
              <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} role="alert" aria-live="assertive">
                {successMessage}
              </Alert>
            )}
            <Box
              sx={{
                p: 4,
                backgroundColor: isDarkMode ? "#2A3B5A" : "#FFFFFF",
                borderRadius: 3,
                border: "1px solid",
                borderColor: isDarkMode ? "#3A4B6A" : "#E0E0E0",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  mb: 3,
                  fontWeight: 600,
                  fontFamily: "'Montserrat', sans-serif'",
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                }}
              >
                Event Details
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Event Name"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    sx={{ mb: 3 }}
                    InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                    InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                    inputProps={{ "aria-label": "Enter event name" }}
                    helperText="e.g., Super Bowl 2025"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Event Date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    sx={{ mb: 3 }}
                    InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", shrink: true } }}
                    InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                    inputProps={{ "aria-label": "Select event date" }}
                  />
                </Grid>
                {(poolData.format === "squares" || poolData.format === "strip_cards") && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Team A / Competitor A"
                        value={teamA}
                        onChange={(e) => setTeamA(e.target.value)}
                        sx={{ mb: 3 }}
                        InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                        InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                        inputProps={{ "aria-label": "Enter Team A or Competitor A name" }}
                        helperText="e.g., Kansas City Chiefs"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Team B / Competitor B"
                        value={teamB}
                        onChange={(e) => setTeamB(e.target.value)}
                        sx={{ mb: 3 }}
                        InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                        InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                        inputProps={{ "aria-label": "Enter Team B or Competitor B name" }}
                        helperText="e.g., Philadelphia Eagles"
                      />
                    </Grid>
                  </>
                )}
              </Grid>

              <Typography
                variant="h6"
                sx={{
                  mb: 3,
                  mt: 4,
                  fontWeight: 600,
                  fontFamily: "'Montserrat', sans-serif'",
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                }}
              >
                Pool-Specific Settings
              </Typography>
              {poolData.format === "squares" && (
                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Grid Size</InputLabel>
                  <Select
                    value={gridSize}
                    onChange={(e) => setGridSize(e.target.value)}
                    sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    inputProps={{ "aria-label": "Select grid size for Squares pool" }}
                  >
                    <MenuItem value={25}>5x5 (25 Squares)</MenuItem>
                    <MenuItem value={100}>10x10 (100 Squares)</MenuItem>
                  </Select>
                </FormControl>
              )}
              {poolData.format === "pickem" && (
                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Picks Per Week</InputLabel>
                  <Select
                    value={picksPerWeek}
                    onChange={(e) => setPicksPerWeek(e.target.value)}
                    sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    inputProps={{ "aria-label": "Select picks per week for Pick’em pool" }}
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <MenuItem key={num} value={num}>
                        {num}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {poolData.format === "survivor" && (
                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Elimination Type</InputLabel>
                  <Select
                    value={eliminationType}
                    onChange={(e) => setEliminationType(e.target.value)}
                    sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    inputProps={{ "aria-label": "Select elimination type for Survivor pool" }}
                  >
                    <MenuItem value="single">Single Elimination</MenuItem>
                    <MenuItem value="double">Double Elimination</MenuItem>
                  </Select>
                </FormControl>
              )}
              {poolData.format === "strip_cards" && (
                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Strip Card Count</InputLabel>
                  <Select
                    value={stripCardCount}
                    onChange={(e) => setStripCardCount(e.target.value)}
                    sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    inputProps={{ "aria-label": "Select strip card count for Strip Card pool" }}
                  >
                    <MenuItem value={10}>10 Strips</MenuItem>
                  </Select>
                </FormControl>
              )}

              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
                <StyledButton
                  onClick={handleCancel}
                  sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
                  aria-label="Cancel and return to pool page"
                >
                  Cancel
                </StyledButton>
                <StyledButton
                  onClick={handleSaveSettings}
                  disabled={saving}
                  aria-label="Save pool settings"
                >
                  {saving ? (
                    <>
                      Saving... <CircularProgress size={20} sx={{ ml: 1 }} aria-label="Saving settings" />
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </StyledButton>
              </Box>
            </Box>
          </Box>
        </Fade>
      </Container>
      <Footer />
    </SettingsContainer>
  );
}

export default CommissionerSettingsPage;