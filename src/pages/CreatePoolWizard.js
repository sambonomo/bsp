import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import { useThemeContext } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { getDb, getAnalyticsService } from "../firebase/config";
import {
  runTransaction,
  doc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { logEvent } from "firebase/analytics";

import {
  Box,
  Container,
  Typography,
  TextField,
  Alert,
  Button,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardActionArea,
  Grid,
  Fade,
  styled,
  Snackbar,
  CircularProgress,
} from "@mui/material";

import SportsFootballIcon from "@mui/icons-material/SportsFootball";
import SportsBaseballIcon from "@mui/icons-material/SportsBaseball";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsHockeyIcon from "@mui/icons-material/SportsHockey";
import SchoolIcon from "@mui/icons-material/School";
import SportsGolfIcon from "@mui/icons-material/SportsGolf";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ShareIcon from "@mui/icons-material/Share";

// Import only validatePoolName now (deadline was removed)
import { validatePoolName as validatePoolNameFn } from "../utils/validations";

const WizardContainer = styled(Box)(({ theme }) => ({
  background:
    theme.palette.mode === "dark"
      ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
      : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
  minHeight: "100vh",
  py: { xs: 6, md: 8 },
  px: { xs: 2, md: 4 },
}));

const StyledStepper = styled(Stepper)(({ theme }) => ({
  "& .MuiStepLabel-label": {
    fontFamily: "'Poppins', sans-serif",
    color: theme.palette.mode === "dark" ? "#B0BEC5" : "#555555",
    fontSize: "1rem",
  },
  "& .MuiStepLabel-label.Mui.active": {
    color: "#FFD700",
    fontWeight: 600,
  },
  "& .MuiStepLabel-label.Mui.completed": {
    color: theme.palette.mode === "dark" ? "#FFFFFF" : "#0B162A",
  },
  "& .MuiStepIcon-root": {
    color: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  },
  "& .MuiStepIcon-root.Mui.active": {
    color: "#FFD700",
  },
  "& .MuiStepIcon-root.Mui.completed": {
    color: "#FFD700",
  },
}));

const SelectionCard = styled(Card)(({ theme, disabled }) => ({
  backgroundColor: disabled
    ? theme.palette.mode === "dark"
      ? "#3A4B6A"
      : "#E0E0E0"
    : theme.palette.mode === "dark"
    ? "#2A3B5A"
    : "#FFFFFF",
  color: disabled
    ? theme.palette.mode === "dark"
      ? "#B0BEC5"
      : "#555555"
    : theme.palette.mode === "dark"
    ? "#FFFFFF"
    : "#0B162A",
  textAlign: "center",
  padding: theme.spacing(3),
  cursor: disabled ? "not-allowed" : "pointer",
  borderRadius: theme.shape.borderRadius * 2,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
  "&:hover": {
    transform: disabled ? "none" : "scale(1.03)",
    boxShadow: disabled ? "none" : theme.shadows[6],
    borderColor: disabled ? undefined : "#FFD700",
  },
  minHeight: 140,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#FFD700",
  color: "#0B162A",
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif",
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

// Steps array
const steps = ["Choose Sport", "Select Format", "Name Pool", "Review & Create", "Finish"];

const SPORTS = [
  { key: "nfl", name: "NFL Football", icon: <SportsFootballIcon fontSize="large" />, comingSoon: false },
  { key: "mlb", name: "MLB Baseball", icon: <SportsBaseballIcon fontSize="large" />, comingSoon: false },
  { key: "nba", name: "NBA Basketball", icon: <SportsBasketballIcon fontSize="large" />, comingSoon: false },
  { key: "nhl", name: "NHL Hockey", icon: <SportsHockeyIcon fontSize="large" />, comingSoon: false },
  { key: "ncaaf", name: "College Football", icon: <SchoolIcon fontSize="large" />, comingSoon: false },
  { key: "ncaab", name: "College Basketball", icon: <SchoolIcon fontSize="large" />, comingSoon: false },
  { key: "golf", name: "Golf", icon: <SportsGolfIcon fontSize="large" />, comingSoon: false },
  { key: "nascar", name: "NASCAR", icon: <DirectionsCarIcon fontSize="large" />, comingSoon: false },
  { key: "other", name: "Other Event", icon: <MoreHorizIcon fontSize="large" />, comingSoon: false },
];

const FORMATS = [
  { key: "squares", name: "Squares", desc: "Classic 10x10 grid pool." },
  { key: "strip_cards", name: "Strip Cards", desc: "Simple number strip pool." },
  { key: "pickem", name: "Pick’Em", desc: "Pick game winners weekly." },
  { key: "survivor", name: "Survivor", desc: "Pick one winner weekly, no repeats." },
];

function WizardContent({ user, authLoading, mode, location }) {
  const isDarkMode = mode === "dark";
  const navigate = useNavigate();

  const [activeStep, setActiveStep] = useState(0);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [poolName, setPoolName] = useState("");

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPoolId, setNewPoolId] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const hasLoggedPageView = useRef(false);
  const hasLoggedSportPreselected = useRef(false);
  const hasLoggedSportSelected = useRef(false);
  const hasLoggedFormatSelected = useRef(false);
  const hasLoggedPoolCreated = useRef(false);
  const hasLoggedStepChange = useRef(false);
  const hasLoggedWizardCanceled = useRef(false);
  const hasLoggedShareInvite = useRef(false);
  const hasLoggedStripsInitialized = useRef(false);
  const hasLoggedSquaresInitialized = useRef(false);

  const db = getDb();
  const functions = getFunctions();

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "create_pool_wizard_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, analytics]);

  // Handle auth + URL param preselection
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const params = new URLSearchParams(location.search);
    const sportKey = params.get("sport");
    const formatKey = params.get("format");

    if (sportKey) {
      const sport = SPORTS.find((s) => s.key === sportKey);
      if (sport) {
        setSelectedSport(sport);
        setActiveStep(1);
        if (!hasLoggedSportPreselected.current && analytics) {
          logEvent(analytics, "sport_preselected", {
            userId: user.uid,
            sportKey,
            timestamp: new Date().toISOString(),
          });
          hasLoggedSportPreselected.current = true;
        }
      }
    }
    if (formatKey && sportKey) {
      const format = FORMATS.find((f) => f.key === formatKey);
      if (format) {
        setSelectedFormat(format);
        setActiveStep(2);
        if (!hasLoggedFormatSelected.current && analytics) {
          logEvent(analytics, "format_preselected", {
            userId: user.uid,
            formatKey,
            timestamp: new Date().toISOString(),
          });
          hasLoggedFormatSelected.current = true;
        }
      }
    }
  }, [authLoading, user, location.search, navigate, analytics]);

  // A simple input sanitization
  const sanitizeInput = useCallback((input) => {
    return input
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
  }, []);

  const handleNext = useCallback(() => {
    setActiveStep((prev) => {
      const newStep = prev + 1;
      if (!hasLoggedStepChange.current && analytics) {
        logEvent(analytics, "wizard_step_changed", {
          userId: user?.uid || "anonymous",
          fromStep: prev,
          toStep: newStep,
          timestamp: new Date().toISOString(),
        });
        hasLoggedStepChange.current = true;
      }
      return newStep;
    });
  }, [analytics]);

  const handleBack = useCallback(() => {
    setActiveStep((prev) => {
      const newStep = prev - 1;
      if (!hasLoggedStepChange.current && analytics) {
        logEvent(analytics, "wizard_step_changed", {
          userId: user?.uid || "anonymous",
          fromStep: prev,
          toStep: newStep,
          timestamp: new Date().toISOString(),
        });
        hasLoggedStepChange.current = true;
      }
      return newStep;
    });
  }, [analytics]);

  // Validate step data
  const handleNextStepValidation = useCallback(() => {
    setError("");
    if (activeStep === 0 && !selectedSport) {
      setError("Please select a sport to continue.");
      return;
    }
    if (activeStep === 1 && !selectedFormat) {
      setError("Please select a pool format to continue.");
      return;
    }
    if (activeStep === 2) {
      if (!poolName.trim()) {
        setError("Please enter a Pool Name.");
        return;
      }
      const poolNameErr = validatePoolNameFn(poolName);
      if (poolNameErr) {
        setError(poolNameErr);
        return;
      }
    }
    handleNext();
  }, [activeStep, selectedSport, selectedFormat, poolName]);

  // Generate a unique invite code
  const generateUniqueInviteCode = useCallback(async () => {
    try {
      const generateInviteCode = httpsCallable(functions, "generateInviteCode");
      const result = await generateInviteCode();
      const code = result.data.inviteCode;

      if (analytics) {
        logEvent(analytics, "invite_code_generated", {
          userId: user?.uid || "anonymous",
          inviteCode: code,
          timestamp: new Date().toISOString(),
        });
      }
      return code;
    } catch (err) {
      throw new Error("Failed to generate invite code: " + err.message);
    }
  }, [analytics, functions, user?.uid]);

  // *** 1) We remove addDoc/setDoc and use runTransaction for atomic writes. ***
  const handleCreatePool = useCallback(async () => {
    if (!user) {
      setError("You must be logged in to create a pool.");
      return;
    }
    if (!selectedSport || !selectedFormat || !poolName.trim()) {
      setError("Missing required fields: sport, format, and pool name are required.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const inviteCode = await generateUniqueInviteCode();
      const sanitizedPoolName = sanitizeInput(poolName);

      // Basic pool data
      const newPoolData = {
        poolName: sanitizedPoolName,
        format: selectedFormat.key,
        sport: selectedSport.name,
        status: "open",
        createdAt: serverTimestamp(),
        commissionerId: user.uid,
        memberIds: [user.uid],
        sportKey: selectedSport.key,
        formatName: selectedFormat.name,
        inviteCode,
      };
      console.log("CreatePoolWizard - Creating Pool (Transaction) with:", newPoolData);

      // *** 2) Start transaction. Create docRef manually. ***
      const docRef = doc(collection(db, "pools"));

      await runTransaction(db, async (transaction) => {
        // Step A: Create the main doc
        transaction.set(docRef, newPoolData);

        // Step B: If format is strip_cards, add strips in the same transaction
        if (selectedFormat.key === "strip_cards") {
          const strips = [];
          for (let i = 1; i <= 10; i++) {
            strips.push({ number: i, userId: null, claimedAt: null });
          }
          // transaction.update merges these fields
          transaction.update(docRef, { strips });
        }

        // Step C: If format is squares, add squares in the same transaction
        if (selectedFormat.key === "squares") {
          const squares = {};
          for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
              const squareId = `square-${row * 10 + col + 1}`;
              squares[squareId] = {
                row,
                col,
                userId: null,
                claimedAt: null,
              };
            }
          }
          transaction.update(docRef, { squares });
        }

        // If the transaction completes, docRef is fully created with sub-fields.
      });

      console.log("CreatePoolWizard - Transaction success. Pool doc ID:", docRef.id);

      // *** 3) If we get here, transaction was successful. ***
      setNewPoolId(docRef.id);
      setInviteCode(inviteCode);
      setSuccessMessage("Pool created successfully!");
      setActiveStep(4);

      // Analytics for pool_created
      if (!hasLoggedPoolCreated.current && analytics) {
        logEvent(analytics, "pool_created", {
          userId: user.uid,
          poolId: docRef.id,
          sport: selectedSport.key,
          format: selectedFormat.key,
          timestamp: new Date().toISOString(),
        });
        hasLoggedPoolCreated.current = true;
      }

      // Log strips or squares initialization if needed
      if (selectedFormat.key === "strip_cards" && analytics && !hasLoggedStripsInitialized.current) {
        logEvent(analytics, "strips_initialized", {
          userId: user.uid,
          poolId: docRef.id,
          stripCount: 10,
          timestamp: new Date().toISOString(),
        });
        hasLoggedStripsInitialized.current = true;
      } else if (selectedFormat.key === "squares" && analytics && !hasLoggedSquaresInitialized.current) {
        logEvent(analytics, "squares_initialized", {
          userId: user.uid,
          poolId: docRef.id,
          squareCount: 100,
          timestamp: new Date().toISOString(),
        });
        hasLoggedSquaresInitialized.current = true;
      }

      // Finally, navigate to the new pool
      navigate(`/pool/${docRef.id}`);
    } catch (err) {
      console.error("CreatePoolWizard - Transaction Error:", err);
      let userFriendlyError = "Failed to create pool. Please try again.";
      if (err.code === "permission-denied") {
        userFriendlyError =
          "You do not have permission to create a pool. Please contact support.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      } else if (err.code === "invalid-argument") {
        userFriendlyError = "Invalid data provided. Please check your inputs and try again.";
      } else if (err.message) {
        userFriendlyError = err.message;
      }
      setError(userFriendlyError);

      // Analytics for pool_creation_failed
      if (analytics) {
        logEvent(analytics, "pool_creation_failed", {
          userId: user?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code || "unknown",
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setCreating(false);
    }
  }, [
    user,
    selectedSport,
    selectedFormat,
    poolName,
    analytics,
    db,
    sanitizeInput,
    generateUniqueInviteCode,
    navigate,
    hasLoggedPoolCreated,
    hasLoggedStripsInitialized,
    hasLoggedSquaresInitialized,
  ]);

  const handleCancelWizard = useCallback(() => {
    navigate("/dashboard");
    if (!hasLoggedWizardCanceled.current && analytics) {
      logEvent(analytics, "create_pool_wizard_canceled", {
        userId: user?.uid || "anonymous",
        currentStep: activeStep,
        timestamp: new Date().toISOString(),
      });
      hasLoggedWizardCanceled.current = true;
    }
  }, [navigate, analytics, user, activeStep]);

  const handleShareInvite = useCallback(() => {
    const inviteUrl = inviteCode ? `${window.location.origin}/join?code=${inviteCode}` : "";
    if (navigator.share) {
      navigator
        .share({
          title: `Join My ${selectedFormat?.name} Pool!`,
          text: `I created a ${selectedFormat?.name} pool for ${selectedSport?.name}. Join now!`,
          url: inviteUrl,
        })
        .then(() => {
          if (analytics && !hasLoggedShareInvite.current) {
            logEvent(analytics, "pool_invite_shared", {
              userId: user?.uid || "anonymous",
              poolId: newPoolId,
              method: "web_share",
              timestamp: new Date().toISOString(),
            });
            hasLoggedShareInvite.current = true;
          }
        })
        .catch((err) => {
          console.error("Sharing failed:", err);
          setError("Failed to share invite link. Please copy it manually.");
        });
    } else {
      navigator.clipboard
        .writeText(inviteUrl)
        .then(() => {
          setSuccessMessage("Invite link copied to clipboard!");
          if (analytics && !hasLoggedShareInvite.current) {
            logEvent(analytics, "pool_invite_shared", {
              userId: user?.uid || "anonymous",
              poolId: newPoolId,
              method: "clipboard",
              timestamp: new Date().toISOString(),
            });
            hasLoggedShareInvite.current = true;
          }
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          setError("Failed to copy invite link. Please copy it manually: " + inviteUrl);
        });
    }
  }, [analytics, user, newPoolId, selectedFormat, selectedSport, inviteCode]);

  // Step rendering
  function renderStepContent(stepIndex) {
    switch (stepIndex) {
      case 0:
        return renderSelectSport();
      case 1:
        return renderSelectFormat();
      case 2:
        return renderNamePool();
      case 3:
        return renderReviewCreate();
      default:
        return renderFinish();
    }
  }

  // Step 0: Sport
  function renderSelectSport() {
    return (
      <Box>
        <Typography
          variant="h6"
          align="center"
          sx={{
            mb: 4,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Choose a Sport
        </Typography>
        <Grid container spacing={3} justifyContent="center">
          {SPORTS.map((sport) => (
            <Grid item xs={6} sm={4} md={3} key={sport.key}>
              <Fade in timeout={1000}>
                <SelectionCard
                  disabled={sport.comingSoon}
                  onClick={() => {
                    if (!sport.comingSoon) {
                      setSelectedSport(sport);
                      handleNext();
                      if (!hasLoggedSportSelected.current && analytics) {
                        logEvent(analytics, "sport_selected", {
                          userId: user?.uid || "anonymous",
                          sportKey: sport.key,
                          timestamp: new Date().toISOString(),
                        });
                        hasLoggedSportSelected.current = true;
                      }
                    }
                  }}
                  sx={{
                    border: selectedSport?.key === sport.key ? "2px solid #FFD700" : "1px solid",
                  }}
                  tabIndex={sport.comingSoon ? -1 : 0}
                  onKeyPress={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !sport.comingSoon) {
                      setSelectedSport(sport);
                      handleNext();
                      if (!hasLoggedSportSelected.current && analytics) {
                        logEvent(analytics, "sport_selected", {
                          userId: user?.uid || "anonymous",
                          sportKey: sport.key,
                          timestamp: new Date().toISOString(),
                        });
                        hasLoggedSportSelected.current = true;
                      }
                    }
                  }}
                  role="button"
                  aria-label={`Select ${sport.name} sport${sport.comingSoon ? " (coming soon)" : ""}`}
                >
                  <CardActionArea disabled={sport.comingSoon}>
                    <Box sx={{ mb: 1 }}>{sport.icon}</Box>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}
                    >
                      {sport.name}
                    </Typography>
                    {sport.comingSoon && (
                      <Typography
                        variant="body2"
                        sx={{ color: "#FF4040", mt: 0.5, fontFamily: "'Poppins', sans-serif" }}
                      >
                        (Coming Soon)
                      </Typography>
                    )}
                  </CardActionArea>
                </SelectionCard>
              </Fade>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 4 }}>
          <StyledButton
            onClick={handleCancelWizard}
            sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
            aria-label="Cancel and go to dashboard"
          >
            Cancel
          </StyledButton>
        </Box>
      </Box>
    );
  }

  // Step 1: Format
  function renderSelectFormat() {
    return (
      <Box>
        <Typography
          variant="h6"
          align="center"
          sx={{
            mb: 4,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Select a Format for {selectedSport?.name}
        </Typography>
        <Grid container spacing={3} justifyContent="center">
          {FORMATS.map((fmt) => (
            <Grid item xs={6} sm={4} md={3} key={fmt.key}>
              <Fade in timeout={1000}>
                <SelectionCard
                  onClick={() => {
                    setSelectedFormat(fmt);
                    handleNext();
                    if (!hasLoggedFormatSelected.current && analytics) {
                      logEvent(analytics, "format_selected", {
                        userId: user?.uid || "anonymous",
                        formatKey: fmt.key,
                        timestamp: new Date().toISOString(),
                      });
                      hasLoggedFormatSelected.current = true;
                    }
                  }}
                  sx={{
                    border: selectedFormat?.key === fmt.key ? "2px solid #FFD700" : "1px solid",
                  }}
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedFormat(fmt);
                      handleNext();
                      if (!hasLoggedFormatSelected.current && analytics) {
                        logEvent(analytics, "format_selected", {
                          userId: user?.uid || "anonymous",
                          formatKey: fmt.key,
                          timestamp: new Date().toISOString(),
                        });
                        hasLoggedFormatSelected.current = true;
                      }
                    }
                  }}
                  role="button"
                  aria-label={`Select ${fmt.name} format`}
                >
                  <CardActionArea>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        mb: 1,
                        color: "#FFD700",
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {fmt.name}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif" }}>
                      {fmt.desc}
                    </Typography>
                  </CardActionArea>
                </SelectionCard>
              </Fade>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
          <StyledButton
            onClick={handleBack}
            sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
            aria-label="Go back to previous step"
          >
            Back
          </StyledButton>
          <StyledButton
            onClick={handleCancelWizard}
            sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
            aria-label="Cancel and go to dashboard"
          >
            Cancel
          </StyledButton>
        </Box>
      </Box>
    );
  }

  // Step 2: Name Pool
  function renderNamePool() {
    return (
      <Box>
        <Typography
          variant="h6"
          align="center"
          sx={{
            mb: 4,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Name Your Pool
        </Typography>
        <TextField
          fullWidth
          label="Pool Name"
          placeholder="e.g. My Super Bowl Pool"
          value={poolName}
          onChange={(e) => setPoolName(e.target.value)}
          sx={{ mb: 3 }}
          InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif" } }}
          InputProps={{ sx: { fontFamily: "'Poppins', sans-serif" } }}
          inputProps={{ "aria-label": "Enter pool name" }}
          required
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
          <StyledButton
            onClick={handleBack}
            sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
            aria-label="Go back to previous step"
          >
            Back
          </StyledButton>
          <Box sx={{ display: "flex", gap: 2 }}>
            <StyledButton
              onClick={handleCancelWizard}
              sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
              aria-label="Cancel and go to dashboard"
            >
              Cancel
            </StyledButton>
            <StyledButton onClick={handleNextStepValidation} aria-label="Go to review and create step">
              Next
            </StyledButton>
          </Box>
        </Box>
      </Box>
    );
  }

  // Step 3: Review & Create
  function renderReviewCreate() {
    return (
      <Box>
        <Typography
          variant="h6"
          align="center"
          sx={{
            mb: 4,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Review and Create Your Pool
        </Typography>
        <Box
          sx={{
            backgroundColor: isDarkMode ? "#2A3B5A" : "#F0F0F0",
            p: 3,
            borderRadius: 2,
            mb: 3,
          }}
        >
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Sport:</strong> {selectedSport?.name}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Format:</strong> {selectedFormat?.name}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Pool Name:</strong> {poolName}
          </Typography>
        </Box>
        <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
          After creation, you can customize additional rules and settings in the commissioner’s page.
        </Alert>
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
          <StyledButton
            onClick={handleBack}
            sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
            aria-label="Go back to previous step"
          >
            Back
          </StyledButton>
          <Box sx={{ display: "flex", gap: 2 }}>
            <StyledButton
              onClick={handleCancelWizard}
              sx={{ backgroundColor: "#B0BEC5", "&:hover": { backgroundColor: "#A0AEB5" } }}
              aria-label="Cancel and go to dashboard"
            >
              Cancel
            </StyledButton>
            {/* Notice we now call the transaction-based method */}
            <StyledButton onClick={handleCreatePool} disabled={creating} aria-label="Create pool">
              {creating ? (
                <>
                  Creating...
                  <CircularProgress size={20} sx={{ ml: 1 }} aria-label="Creating pool" />
                </>
              ) : (
                "Create Pool"
              )}
            </StyledButton>
          </Box>
        </Box>
      </Box>
    );
  }

  // Step 4: Finish
  function renderFinish() {
    const inviteUrl = inviteCode ? `${window.location.origin}/join?code=${inviteCode}` : "";
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography
          variant="h4"
          sx={{
            mb: 2,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Pool Created!
        </Typography>
        <Typography
          variant="body1"
          sx={{
            mb: 4,
            fontFamily: "'Poppins', sans-serif",
            color: isDarkMode ? "#B0BEC5" : "#555555",
          }}
        >
          Your pool has been created. Invite others to join, or go to the Dashboard to manage your pool settings.
        </Typography>
        {inviteCode && (
          <Box sx={{ mb: 4 }}>
            <Typography
              variant="body1"
              sx={{
                mb: 2,
                fontFamily: "'Poppins', sans-serif",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              Share this invite link with others to join your pool:
            </Typography>
            <TextField
              fullWidth
              value={inviteUrl}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: "'Poppins', sans-serif" },
              }}
              sx={{ mb: 2 }}
              variant="outlined"
              inputProps={{ "aria-label": "Invite link for pool" }}
            />
            <StyledButton onClick={handleShareInvite} startIcon={<ShareIcon />} aria-label="Share invite link for pool">
              Share Invite Link
            </StyledButton>
          </Box>
        )}
        <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
          <StyledButton
            component={RouterLink}
            to="/dashboard"
            aria-label="Go to dashboard after pool creation"
          >
            View Dashboard
          </StyledButton>
          {newPoolId && (
            <StyledButton
              component={RouterLink}
              to={`/pool/${newPoolId}`}
              aria-label="Go to pool page after creation"
            >
              Go to Pool
            </StyledButton>
          )}
        </Box>
      </Box>
    );
  }

  // While loading auth
  if (authLoading) {
    return (
      <WizardContainer>
        <Container maxWidth="md">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress sx={{ mb: 2 }} aria-label="Loading create pool wizard" />
              <Typography
                variant="h5"
                sx={{
                  mb: 2,
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif",
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                }}
              >
                Loading Create Pool Wizard
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mb: 3,
                  fontFamily: "'Poppins', sans-serif",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                Please wait while we verify your authentication state...
              </Typography>
            </Box>
          </Fade>
        </Container>
      </WizardContainer>
    );
  }

  // Render wizard if user is authenticated
  return (
    <WizardContainer>
      <Container maxWidth="md">
        <Fade in timeout={1000}>
          <Box>
            <Typography
              variant="h4"
              sx={{
                mb: 4,
                fontWeight: 700,
                fontFamily: "'Montserrat', sans-serif",
                color: isDarkMode ? "#FFFFFF" : "#0B162A",
                textAlign: "center",
              }}
            >
              Create a New Pool
            </Typography>
            <StyledStepper activeStep={activeStep} sx={{ mb: 4, maxWidth: 600, mx: "auto" }} alternativeLabel>
              {steps.map((label, index) => (
                <Step key={index}>
                  <StepLabel aria-label={`Step ${index + 1}: ${label}`}>{label}</StepLabel>
                </Step>
              ))}
            </StyledStepper>

            {error && (
              <Fade in timeout={500}>
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} role="alert" aria-live="assertive">
                  {error}
                </Alert>
              </Fade>
            )}

            <Snackbar
              open={!!successMessage}
              autoHideDuration={3000}
              onClose={() => setSuccessMessage("")}
              anchorOrigin={{ vertical: "top", horizontal: "center" }}
            >
              <Alert severity="success" sx={{ fontFamily: "'Poppins', sans-serif" }} role="alert" aria-live="assertive">
                {successMessage}
              </Alert>
            </Snackbar>

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
              {renderStepContent(activeStep)}
            </Box>
          </Box>
        </Fade>
      </Container>
    </WizardContainer>
  );
}

export default function CreatePoolWizard() {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const location = useLocation();

  return (
    <WizardContent
      user={user}
      authLoading={authLoading}
      mode={mode}
      location={location}
    />
  );
}
