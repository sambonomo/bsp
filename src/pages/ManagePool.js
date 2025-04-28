import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot } from "firebase/firestore";
import { getDb, getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";
import { useAuth } from "../contexts/AuthContext";
import { generateInviteCode, shuffleArray } from "../utils/helpers";
import { validatePayoutStructure, validateMatchup } from "../utils/validations";
import { fetchSchedule } from "../utils/sportsRadar";
import sanitizeHtml from "sanitize-html";
import { motion } from "framer-motion";
import {
  Container,
  Typography,
  Button,
  Alert,
  TextField,
  Stack,
  Card,
  CardContent,
  Chip,
  Snackbar,
  Box,
  InputLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";

// Utility function to log analytics events with deduplication
const logAnalyticsEvent = (analytics, eventName, params, hasLoggedRef) => {
  if (!hasLoggedRef.current && analytics) {
    logEvent(analytics, eventName, params);
    hasLoggedRef.current = true;
  }
};

const db = getDb();

function ManagePool() {
  const { poolId } = useParams();
  const { user, authLoading } = useAuth();
  const [poolData, setPoolData] = useState(null);
  const [matchups, setMatchups] = useState([]); // Now fetched from subcollection
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [locking, setLocking] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [fetchingGames, setFetchingGames] = useState(false);
  const [games, setGames] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedPageView = useRef(false);
  const hasLoggedLockPool = useRef(false);
  const hasLoggedSaveRules = useRef(false);
  const hasLoggedSaveBranding = useRef(false);
  const hasLoggedRegenerateCode = useRef(false);
  const hasLoggedFetchGames = useRef(false);
  const hasLoggedAddGame = useRef(false);

  // Rule states
  const [payoutStructure, setPayoutStructure] = useState({ q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 });
  // Branding states
  const [primaryColor, setPrimaryColor] = useState("#1976d2");
  const [secondaryColor, setSecondaryColor] = useState("#9c27b0");
  const [logoURL, setLogoURL] = useState("");
  // Invite code
  const [inviteCode, setInviteCode] = useState("");

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view
  useEffect(() => {
    logAnalyticsEvent(analytics, "manage_pool_page_viewed", {
      poolId,
      userId: user?.uid || "anonymous",
      timestamp: new Date().toISOString(),
    }, hasLoggedPageView);
  }, [poolId, user?.uid, analytics]);

  // Fetch pool data
  useEffect(() => {
    const fetchPool = async () => {
      if (!poolId || authLoading) {
        if (authLoading) setError("Waiting for authentication...");
        return;
      }
      try {
        setLoading(true);
        const poolRef = doc(db, "pools", poolId);
        const snapshot = await withRetry("Fetch Pool", () => getDoc(poolRef));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPoolData(data);
          setPayoutStructure(data.payoutStructure || { q1: 0.2, q2: 0.2, q3: 0.2, final: 0.4 });
          setPrimaryColor(data.theme?.primaryColor || "#1976d2");
          setSecondaryColor(data.theme?.secondaryColor || "#9c27b0");
          setLogoURL(data.theme?.logoURL || "");
          setInviteCode(data.inviteCode || generateInviteCode());
        } else {
          setError("Pool not found.");
        }
      } catch (err) {
        let userFriendlyError = "Failed to fetch pool data.";
        if (err.code === "permission-denied") {
          userFriendlyError = "You do not have permission to view this pool.";
        } else if (err.code === "unavailable") {
          userFriendlyError = "Firestore is currently unavailable. Please try again later.";
        }
        setError(userFriendlyError);
        if (analytics) {
          logEvent(analytics, "pool_fetch_failed", {
            poolId,
            userId: user?.uid || "anonymous",
            error_message: userFriendlyError,
            timestamp: new Date().toISOString(),
          });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPool();
  }, [poolId, authLoading, user, analytics]);

  // Fetch matchups from subcollection
  useEffect(() => {
    if (!poolId) return;
    const matchupsRef = collection(db, "pools", poolId, "matchups");
    const unsubscribe = onSnapshot(matchupsRef, (snapshot) => {
      const matchupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMatchups(matchupsData);
    }, (err) => {
      setError("Failed to fetch matchups.");
      if (analytics) {
        logEvent(analytics, "fetch_matchups_failed", {
          poolId,
          userId: user?.uid || "anonymous",
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    });
    return () => unsubscribe();
  }, [poolId, user?.uid, analytics]);

  // Fetch SportsRadar games when pool data is available
  useEffect(() => {
    const fetchGames = async () => {
      if (poolData?.sport && poolData?.season && poolData.status !== "locked") {
        setFetchingGames(true);
        try {
          const sport = poolData.sport.toLowerCase(); // e.g., 'nfl'
          const season = poolData.season; // e.g., '2025'
          const gamesData = await fetchSchedule(sport, season);
          setGames(gamesData);
          setError("");
          logAnalyticsEvent(analytics, "fetch_games_success", {
            poolId,
            userId: user?.uid || "anonymous",
            sport,
            season,
            gameCount: gamesData.length,
            timestamp: new Date().toISOString(),
          }, hasLoggedFetchGames);
        } catch (err) {
          setError("Failed to fetch upcoming games. Please try again.");
          if (analytics) {
            logEvent(analytics, "fetch_games_failed", {
              poolId,
              userId: user?.uid || "anonymous",
              error_message: err.message,
              timestamp: new Date().toISOString(),
            });
          }
        } finally {
          setFetchingGames(false);
        }
      }
    };
    fetchGames();
  }, [poolData, analytics, user?.uid, poolId]);

  // Reset analytics flags
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedLockPool.current = false;
    hasLoggedSaveRules.current = false;
    hasLoggedSaveBranding.current = false;
    hasLoggedRegenerateCode.current = false;
    hasLoggedFetchGames.current = false;
    hasLoggedAddGame.current = false;
  }, [user?.uid, poolId]);

  const isCommissioner = poolData?.commissionerId === user?.uid;

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
        }
        if (attempt === maxRetries) throw error;
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  // Validate URL format for logo
  const validateLogoURL = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Lock pool logic
  const handleLockPool = async () => {
    if (!isCommissioner) {
      setError("Only the commissioner can lock this pool.");
      return;
    }
    setLocking(true);
    try {
      const poolRef = doc(db, "pools", poolId);
      let updates = { status: "locked" };

      if (poolData.format === "squares" && !poolData.axisAssigned) {
        const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        updates.axisAssigned = true;
        updates.axisNumbers = { x: shuffleArray(digits), y: shuffleArray(digits) };
      }

      if (poolData.format === "strip_cards" && !poolData.stripNumbersAssigned) {
        const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        updates.stripNumbersAssigned = true;
        updates.stripNumbers = shuffleArray(digits);
      }

      if (poolData.format === "custom_pool" && poolData.customPoolListId) {
        const customRef = doc(db, "playerPools", poolData.customPoolListId);
        const customSnap = await withRetry("Fetch Custom Pool", () => getDoc(customRef));
        if (customSnap.exists()) {
          updates.participants = customSnap.data().participants || [];
        }
      }

      await withRetry("Lock Pool", () => updateDoc(poolRef, updates));
      setPoolData({ ...poolData, ...updates });
      setSuccessMessage("Pool locked successfully!");
      logAnalyticsEvent(analytics, "lock_pool", {
        poolId,
        userId: user.uid,
        format: poolData.format,
        timestamp: new Date().toISOString(),
      }, hasLoggedLockPool);
    } catch (err) {
      let userFriendlyError = "Failed to lock pool.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to lock this pool.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "lock_pool_failed", {
          poolId,
          userId: user.uid,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setLocking(false);
    }
  };

  // Save payout structure
  const handleSaveRules = async () => {
    if (!isCommissioner) {
      setError("Only the commissioner can update rules.");
      return;
    }
    const validationError = validatePayoutStructure(payoutStructure);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSavingRules(true);
    try {
      const poolRef = doc(db, "pools", poolId);
      await withRetry("Save Rules", () => updateDoc(poolRef, { payoutStructure }));
      setPoolData({ ...poolData, payoutStructure });
      setSuccessMessage("Rules updated successfully!");
      logAnalyticsEvent(analytics, "save_rules", {
        poolId,
        userId: user.uid,
        payoutStructure,
        timestamp: new Date().toISOString(),
      }, hasLoggedSaveRules);
    } catch (err) {
      setError("Failed to save rules.");
      if (analytics) {
        logEvent(analytics, "save_rules_failed", {
          poolId,
          userId: user.uid,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setSavingRules(false);
    }
  };

  // Save branding
  const handleSaveBranding = async () => {
    if (!isCommissioner) {
      setError("Only the commissioner can update branding.");
      return;
    }
    if (logoURL && !validateLogoURL(logoURL)) {
      setError("Invalid logo URL. Please enter a valid URL (e.g., https://example.com/logo.png).");
      return;
    }
    setSavingBranding(true);
    try {
      const poolRef = doc(db, "pools", poolId);
      const sanitizedLogoURL = logoURL ? sanitizeHtml(logoURL, { allowedTags: [], allowedAttributes: {} }) : "";
      const themeUpdates = { primaryColor, secondaryColor, logoURL: sanitizedLogoURL };
      await withRetry("Save Branding", () => updateDoc(poolRef, { theme: themeUpdates }));
      setSuccessMessage("Branding updated successfully!");
      setPoolData({ ...poolData, theme: themeUpdates });
      logAnalyticsEvent(analytics, "save_branding", {
        poolId,
        userId: user.uid,
        primaryColor,
        secondaryColor,
        logoURL: sanitizedLogoURL,
        timestamp: new Date().toISOString(),
      }, hasLoggedSaveBranding);
    } catch (err) {
      let userFriendlyError = "Failed to save branding.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to update branding.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "save_branding_failed", {
          poolId,
          userId: user.uid,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setSavingBranding(false);
    }
  };

  // Regenerate invite code
  const handleRegenerateCode = async () => {
    if (!isCommissioner) {
      setError("Only the commissioner can regenerate invite codes.");
      return;
    }
    setRegeneratingCode(true);
    try {
      const newCode = generateInviteCode();
      const poolRef = doc(db, "pools", poolId);
      await withRetry("Regenerate Invite Code", () => updateDoc(poolRef, { inviteCode: newCode }));
      setInviteCode(newCode);
      setSuccessMessage("Invite code regenerated successfully!");
      logAnalyticsEvent(analytics, "regenerate_invite_code", {
        poolId,
        userId: user.uid,
        newCode,
        timestamp: new Date().toISOString(),
      }, hasLoggedRegenerateCode);
    } catch (err) {
      setError("Failed to regenerate invite code.");
      if (analytics) {
        logEvent(analytics, "regenerate_invite_code_failed", {
          poolId,
          userId: user.uid,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setRegeneratingCode(false);
    }
  };

  // Add game to pool's matchups subcollection
  const handleAddGame = async (game) => {
    if (!isCommissioner) {
      setError("Only the commissioner can add games.");
      return;
    }
    const matchup = {
      gameId: game.id,
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      startTime: game.scheduled,
      status: "pending",
    };
    const validationError = validateMatchup(matchup);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      const matchupRef = collection(db, "pools", poolId, "matchups");
      await withRetry("Add Game", () => addDoc(matchupRef, matchup));
      // Matchups are now updated via onSnapshot listener
      setSuccessMessage(`Game ${game.away.name} vs ${game.home.name} added to pool!`);
      logAnalyticsEvent(analytics, "add_game_to_pool", {
        poolId,
        userId: user.uid,
        gameId: game.id,
        sport: poolData.sport,
        timestamp: new Date().toISOString(),
      }, hasLoggedAddGame);
    } catch (err) {
      setError("Failed to add game to pool.");
      if (analytics) {
        logEvent(analytics, "add_game_failed", {
          poolId,
          userId: user.uid,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  // Memoize logo preview to optimize re-renders
  const logoPreview = useMemo(() => {
    if (!logoURL) return null;
    return (
      <img
        src={logoURL}
        alt="Pool Logo Preview"
        style={{ maxWidth: 100, marginTop: 8 }}
        onError={() => setError("Invalid logo URL.")}
      />
    );
  }, [logoURL]);

  if (authLoading || loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, textAlign: "center" }}>
        <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
          Loading pool data...
        </Typography>
        <CircularProgress aria-label="Loading pool data" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {error}
          <Box sx={{ mt: 2, display: "flex", gap: 1, justifyContent: "center" }}>
            <Button
              onClick={() => window.location.reload()}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Retry loading pool data"
            >
              Retry
            </Button>
            <Button
              component="a"
              href="mailto:support@bonomosportspools.com"
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Contact support for pool management issue"
            >
              Contact Support
            </Button>
          </Box>
        </Alert>
      </Container>
    );
  }

  if (!poolData || !isCommissioner) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          Only the commissioner can manage this pool.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}>
          Manage Pool: {poolData.poolName}
        </Typography>

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

        {/* Pool Status */}
        <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
              Pool Status
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <Typography variant="body1" sx={{ mr: 1, fontFamily: "'Poppins', sans-serif'" }}>
                Status:
              </Typography>
              <Chip
                label={poolData.status === "locked" ? "Locked" : "Open"}
                color={poolData.status === "locked" ? "secondary" : "primary"}
                aria-label={`Pool status: ${poolData.status}`}
              />
            </Box>
            <Typography variant="body1" sx={{ mb: 0.5, fontFamily: "'Poppins', sans-serif'" }}>
              <strong>Format:</strong> {poolData.format}
            </Typography>
            {isCommissioner && poolData.status !== "locked" && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="contained"
                  onClick={handleLockPool}
                  disabled={locking}
                  sx={{ mt: 2, fontFamily: "'Poppins', sans-serif'", fontSize: { xs: "1rem", sm: "1.2rem" }, py: 1.5 }}
                  aria-label="Lock pool and reveal"
                >
                  {locking ? "Locking..." : "Lock Pool & Reveal"}
                </Button>
              </motion.div>
            )}
            {poolData.status === "locked" && (
              <Alert severity="info" sx={{ mt: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert">
                Pool is locked. Digits/Participants have been revealed.
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Matchups Section */}
        {isCommissioner && poolData.status !== "locked" && (
          <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Manage Matchups
              </Typography>
              {fetchingGames ? (
                <Box sx={{ textAlign: "center" }}>
                  <CircularProgress aria-label="Fetching upcoming games" />
                  <Typography sx={{ mt: 1, fontFamily: "'Poppins', sans-serif'" }}>
                    Fetching upcoming games...
                  </Typography>
                </Box>
              ) : games.length === 0 ? (
                <Alert severity="warning" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert">
                  No upcoming games found for {poolData.sport} {poolData.season}.
                </Alert>
              ) : (
                <Table aria-label="Upcoming games table">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Date</TableCell>
                      <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Matchup</TableCell>
                      <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {games.map((game) => (
                      <TableRow key={game.id}>
                        <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                          {new Date(game.scheduled).toLocaleDateString()}
                        </TableCell>
                        <TableCell sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                          {game.away.name} @ {game.home.name}
                        </TableCell>
                        <TableCell>
                          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button
                              variant="contained"
                              onClick={() => handleAddGame(game)}
                              disabled={matchups.some((m) => m.gameId === game.id)}
                              sx={{ fontFamily: "'Poppins', sans-serif'" }}
                              aria-label={`Add ${game.away.name} vs ${game.home.name} to pool`}
                            >
                              Add to Pool
                            </Button>
                          </motion.div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Squares / Strips / Custom Info */}
        {poolData.format === "squares" && poolData.axisAssigned && (
          <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Grid Numbers
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                X Axis: {poolData.axisNumbers.x.join(", ")}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                Y Axis: {poolData.axisNumbers.y.join(", ")}
              </Typography>
            </CardContent>
          </Card>
        )}
        {poolData.format === "strip_cards" && poolData.stripNumbersAssigned && (
          <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Strip Numbers
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                {poolData.stripNumbers.join(", ")}
              </Typography>
            </CardContent>
          </Card>
        )}
        {poolData.format === "custom_pool" && poolData.participants && (
          <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Participants
              </Typography>
              <Box component="ul" sx={{ ml: 3 }} aria-label="List of participants">
                {poolData.participants.map((p, idx) => (
                  <Box
                    component="li"
                    key={idx}
                    sx={{ listStyleType: "disc", fontFamily: "'Poppins', sans-serif'" }}
                    role="listitem"
                  >
                    {p}
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Rules Section */}
        {poolData.format === "squares" && (
          <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Payout Structure
              </Typography>
              <Box role="form" aria-label="Payout structure form">
                <Stack spacing={2}>
                  <TextField
                    label="Q1 Payout (%)"
                    type="number"
                    value={payoutStructure.q1 * 100}
                    onChange={(e) =>
                      setPayoutStructure({ ...payoutStructure, q1: parseFloat(e.target.value) / 100 })
                    }
                    inputProps={{ min: 0, max: 100, step: 1 }}
                    sx={{ fontFamily: "'Poppins', sans-serif'", maxWidth: { xs: "100%", sm: 150 } }}
                    aria-label="Q1 payout percentage"
                  />
                  <TextField
                    label="Q2 Payout (%)"
                    type="number"
                    value={payoutStructure.q2 * 100}
                    onChange={(e) =>
                      setPayoutStructure({ ...payoutStructure, q2: parseFloat(e.target.value) / 100 })
                    }
                    inputProps={{ min: 0, max: 100, step: 1 }}
                    sx={{ fontFamily: "'Poppins', sans-serif'", maxWidth: { xs: "100%", sm: 150 } }}
                    aria-label="Q2 payout percentage"
                  />
                  <TextField
                    label="Q3 Payout (%)"
                    type="number"
                    value={payoutStructure.q3 * 100}
                    onChange={(e) =>
                      setPayoutStructure({ ...payoutStructure, q3: parseFloat(e.target.value) / 100 })
                    }
                    inputProps={{ min: 0, max: 100, step: 1 }}
                    sx={{ fontFamily: "'Poppins', sans-serif'", maxWidth: { xs: "100%", sm: 150 } }}
                    aria-label="Q3 payout percentage"
                  />
                  <TextField
                    label="Final Payout (%)"
                    type="number"
                    value={payoutStructure.final * 100}
                    onChange={(e) =>
                      setPayoutStructure({ ...payoutStructure, final: parseFloat(e.target.value) / 100 })
                    }
                    inputProps={{ min: 0, max: 100, step: 1 }}
                    sx={{ fontFamily: "'Poppins', sans-serif'", maxWidth: { xs: "100%", sm: 150 } }}
                    aria-label="Final payout percentage"
                  />
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="contained"
                      onClick={handleSaveRules}
                      disabled={savingRules}
                      sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: { xs: "1rem", sm: "1.2rem" }, py: 1.5 }}
                      aria-label="Save payout structure"
                    >
                      {savingRules ? "Saving..." : "Save Rules"}
                    </Button>
                  </motion.div>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Branding Section */}
        {isCommissioner && (
          <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Branding
              </Typography>
              <Box role="form" aria-label="Branding form">
                <Stack spacing={2}>
                  <Box>
                    <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} htmlFor="primary-color">
                      Primary Color
                    </InputLabel>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <input
                        id="primary-color"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        tabIndex={0}
                        aria-label="Select primary color"
                        style={{ width: 50, height: 50, cursor: "pointer" }}
                      />
                      <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>{primaryColor}</Typography>
                    </Box>
                  </Box>
                  <Box>
                    <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} htmlFor="secondary-color">
                      Secondary Color
                    </InputLabel>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <input
                        id="secondary-color"
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        tabIndex={0}
                        aria-label="Select secondary color"
                        style={{ width: 50, height: 50, cursor: "pointer" }}
                      />
                      <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>{secondaryColor}</Typography>
                    </Box>
                  </Box>
                  <TextField
                    label="Logo URL"
                    value={logoURL}
                    onChange={(e) => setLogoURL(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    fullWidth
                    sx={{ fontFamily: "'Poppins', sans-serif'", maxWidth: { xs: "100%", sm: "500px" } }}
                    aria-label="Enter logo URL"
                  />
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="contained"
                      onClick={handleSaveBranding}
                      disabled={savingBranding}
                      sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: { xs: "1rem", sm: "1.2rem" }, py: 1.5 }}
                      aria-label="Save branding"
                    >
                      {savingBranding ? "Saving..." : "Save Branding"}
                    </Button>
                  </motion.div>
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      backgroundColor: primaryColor,
                      borderRadius: 2,
                      border: `2px solid ${secondaryColor}`,
                      color: "#fff",
                      fontFamily: "'Poppins', sans-serif'",
                    }}
                    role="region"
                    aria-label="Branding preview"
                  >
                    <Typography sx={{ color: "#fff", fontFamily: "'Poppins', sans-serif'" }}>
                      Preview
                    </Typography>
                    {logoPreview}
                  </Box>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Invite Code Section */}
        {isCommissioner && (
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontFamily: "'Montserrat', sans-serif'" }}>
                Invite Code
              </Typography>
              <Typography sx={{ fontFamily: "'Poppins', sans-serif'", mb: 2 }}>
                Share this code with friends: <strong>{inviteCode}</strong>
              </Typography>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outlined"
                  onClick={handleRegenerateCode}
                  disabled={regeneratingCode}
                  sx={{ fontFamily: "'Poppins', sans-serif'", fontSize: { xs: "1rem", sm: "1.2rem" }, py: 1.5 }}
                  aria-label="Regenerate invite code"
                >
                  {regeneratingCode ? "Regenerating..." : "Regenerate Code"}
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </Container>
  );
}

export default ManagePool;