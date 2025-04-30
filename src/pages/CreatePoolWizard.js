import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useThemeContext } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { getDb, getAnalyticsService } from "../firebase/config";
import { addDoc, collection, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { logEvent } from "firebase/analytics";
import { Link as RouterLink } from "react-router-dom";
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
  Tooltip,
  Snackbar,
  IconButton,
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

// Removed unused import:
// import InfoIcon from "@mui/icons-material/Info";

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
  "& .MuiStepLabel-label.Mui-active": {
    color: "#FFD700",
    fontWeight: 600,
  },
  "& .MuiStepLabel-label.Mui-completed": {
    color: theme.palette.mode === "dark" ? "#FFFFFF" : "#0B162A",
  },
  "& .MuiStepIcon-root": {
    color: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  },
  "& .MuiStepIcon-root.Mui-active": {
    color: "#FFD700",
  },
  "& .MuiStepIcon-root.Mui-completed": {
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

/**
 * Main Wizard Content
 */
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

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "create_pool_wizard_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("CreatePoolWizard - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, analytics]);

  // Handle auth state and preselect sport/format
  useEffect(() => {
    console.log("CreatePoolWizard - Current User on Mount:", user);

    if (authLoading) {
      return;
    }

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
          console.log(
            "CreatePoolWizard - Sport preselection logged to Firebase Analytics"
          );
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
          console.log(
            "CreatePoolWizard - Format preselection logged to Firebase Analytics"
          );
          hasLoggedFormatSelected.current = true;
        }
      }
    }
  }, [authLoading, user, location.search, navigate, analytics]);

  // Retry helper
  const withRetry = useCallback(
    async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
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
            console.log(
              `CreatePoolWizard - ${operation} retry attempt ${attempt} logged to Firebase Analytics`
            );
          }
          if (attempt === maxRetries) {
            throw error;
          }
          const delay = Math.pow(2, attempt - 1) * retryDelayBase;
          console.log(
            `${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    },
    [analytics, user]
  );

  // Sanitizes input
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

  // Validates pool name
  const validatePoolName = useCallback((name) => {
    const regex = /^[a-zA-Z0-9\s.,!?-]+$/;
    return regex.test(name);
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
        console.log("CreatePoolWizard - Step change logged to Firebase Analytics");
        hasLoggedStepChange.current = true;
      }
      return newStep;
    });
  }, [analytics, user]);

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
        console.log("CreatePoolWizard - Step change logged to Firebase Analytics");
        hasLoggedStepChange.current = true;
      }
      return newStep;
    });
  }, [analytics, user]);

  // Validate step data before moving forward
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
      if (!validatePoolName(poolName)) {
        setError(
          "Pool Name can only contain letters, numbers, spaces, and basic punctuation (.,!?-)."
        );
        return;
      }
      if (poolName.length > 100) {
        setError("Pool Name must be 100 characters or less.");
        return;
      }
    }
    handleNext();
  }, [activeStep, selectedSport, selectedFormat, poolName, validatePoolName, handleNext]);

  // Generate invite code via Cloud Function
  const generateUniqueInviteCode = useCallback(async () => {
    try {
      const generateInviteCode = httpsCallable(functions, "generateInviteCode");
      const result = await generateInviteCode();
      const inviteCode = result.data.inviteCode;

      if (analytics) {
        logEvent(analytics, "invite_code_generated", {
          userId: user?.uid || "anonymous",
          inviteCode,
          timestamp: new Date().toISOString(),
        });
        console.log(
          "CreatePoolWizard - Invite code generation logged to Firebase Analytics"
        );
      }
      return inviteCode;
    } catch (err) {
      throw new Error("Failed to generate invite code: " + err.message);
    }
  }, [analytics, user?.uid, functions]);

  // Create the pool
  const handleCreatePool = useCallback(async () => {
    if (!user) {
      setError("You must be logged in to create a pool.");
      return;
    }
    if (!selectedSport || !selectedFormat || !poolName.trim()) {
      setError(
        "Missing required fields: sport, format, and pool name are required."
      );
      return;
    }
  
    try {
      setCreating(true);
      setError("");
  
      const inviteCode = await generateUniqueInviteCode();
      const sanitizedPoolName = sanitizeInput(poolName);
  
      // Validate field lengths
      if (sanitizedPoolName.length > 100) {
        throw new Error("Pool Name must be 100 characters or less.");
      }
      if (selectedSport.name.length > 50) {
        throw new Error("Sport name must be 50 characters or less.");
      }
  
      const newPoolData = {
        poolName: sanitizedPoolName,
        format: selectedFormat.key,
        sport: selectedSport.name,
        status: "open",
        createdAt: serverTimestamp(),
        commissionerId: user.uid,
        memberIds: [user.uid],
        isFeatured: false, // Added default value
        // Additional optional data
        sportKey: selectedSport.key,
        formatName: selectedFormat.name,
        inviteCode,
      };
      console.log("CreatePoolWizard - Creating Pool with Data:", newPoolData);
  
      const docRef = await withRetry("Create Pool", () =>
        addDoc(collection(db, "pools"), newPoolData)
      );
      console.log("CreatePoolWizard - Pool Created with ID:", docRef.id);
  
      // Initialize format-specific data
      if (selectedFormat.key === "strip_cards") {
        const strips = [];
        for (let i = 1; i <= 10; i++) {
          strips.push({
            number: i,
            userId: null, // Not claimed yet
            claimedAt: null,
          });
        }
        await withRetry("Initialize Strips", () =>
          setDoc(doc(db, "pools", docRef.id), { strips }, { merge: true })
        );
        console.log(
          "CreatePoolWizard - Initialized 10 strips for Strip Cards pool"
        );
        if (analytics && !hasLoggedStripsInitialized.current) {
          logEvent(analytics, "strips_initialized", {
            userId: user.uid,
            poolId: docRef.id,
            stripCount: 10,
            timestamp: new Date().toISOString(),
          });
          console.log(
            "CreatePoolWizard - Strips initialization logged to Firebase Analytics"
          );
          hasLoggedStripsInitialized.current = true;
        }
      } else if (selectedFormat.key === "squares") {
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
        await withRetry("Initialize Squares", () =>
          setDoc(doc(db, "pools", docRef.id), { squares }, { merge: true })
        );
        console.log(
          "CreatePoolWizard - Initialized 100 squares for Squares pool"
        );
        if (analytics && !hasLoggedSquaresInitialized.current) {
          logEvent(analytics, "squares_initialized", {
            userId: user.uid,
            poolId: docRef.id,
            squareCount: 100,
            timestamp: new Date().toISOString(),
          });
          console.log(
            "CreatePoolWizard - Squares initialization logged to Firebase Analytics"
          );
          hasLoggedSquaresInitialized.current = true;
        }
      }
  
      setNewPoolId(docRef.id);
      setInviteCode(inviteCode);
      setSuccessMessage("Pool created successfully!");
      setActiveStep(4);
  
      if (!hasLoggedPoolCreated.current && analytics) {
        logEvent(analytics, "pool_created", {
          userId: user.uid,
          poolId: docRef.id,
          sport: selectedSport.key,
          format: selectedFormat.key,
          timestamp: new Date().toISOString(),
        });
        console.log("CreatePoolWizard - Pool creation logged to Firebase Analytics");
        hasLoggedPoolCreated.current = true;
      }
  
      // Navigate to the pool dashboard
      navigate(`/pool/${docRef.id}`);
    } catch (err) {
      console.error("CreatePoolWizard - Firestore Error:", err, err.stack);
      let userFriendlyError = "Failed to create pool. Please try again.";
      if (err.code === "permission-denied") {
        userFriendlyError =
          "You do not have permission to create a pool. Please contact support.";
      } else if (err.code === "unavailable") {
        userFriendlyError =
          "Firestore is currently unavailable. Please try again later.";
      } else if (err.code === "invalid-argument") {
        userFriendlyError =
          "Invalid data provided. Please check your inputs and try again.";
      } else if (err.message) {
        userFriendlyError = err.message;
      }
      setError(userFriendlyError);
  
      if (analytics) {
        logEvent(analytics, "pool_creation_failed", {
          userId: user?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code || "unknown",
          timestamp: new Date().toISOString(),
        });
        console.log("CreatePoolWizard - Pool creation failure logged to Firebase Analytics");
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
    withRetry,
  ]);

  // Cancel wizard
  const handleCancelWizard = useCallback(() => {
    navigate("/dashboard");
    if (!hasLoggedWizardCanceled.current && analytics) {
      logEvent(analytics, "create_pool_wizard_canceled", {
        userId: user?.uid || "anonymous",
        currentStep: activeStep,
        timestamp: new Date().toISOString(),
      });
      console.log("CreatePoolWizard - Wizard canceled logged to Firebase Analytics");
      hasLoggedWizardCanceled.current = true;
    }
  }, [navigate, analytics, user, activeStep]);

  // Share invite link
  const handleShareInvite = useCallback(() => {
    const inviteUrl = `${window.location.origin}/join?code=${inviteCode}`;
    if (navigator.share) {
      navigator
        .share({
          title: `Join My ${selectedFormat.name} Pool!`,
          text: `I created a ${selectedFormat.name} pool for ${selectedSport.name} on Bonomo Sports Pools. Join now using this link!`,
          url: inviteUrl,
        })
        .then(() => {
          console.log("Invite shared successfully");
          if (analytics && !hasLoggedShareInvite.current) {
            logEvent(analytics, "pool_invite_shared", {
              userId: user?.uid || "anonymous",
              poolId: newPoolId,
              method: "web_share",
              timestamp: new Date().toISOString(),
            });
            console.log("CreatePoolWizard - Pool invite shared logged to Firebase Analytics");
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
            console.log("CreatePoolWizard - Pool invite copied logged to Firebase Analytics");
            hasLoggedShareInvite.current = true;
          }
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          setError("Failed to copy invite link. Please copy it manually: " + inviteUrl);
        });
    }
  }, [analytics, user, newPoolId, selectedFormat, selectedSport, inviteCode]);

  function renderStepContent(step) {
    switch (step) {
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
                        console.log("CreatePoolWizard - Sport selection logged to Firebase Analytics");
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
                        console.log("CreatePoolWizard - Sport selection logged to Firebase Analytics");
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
                      console.log("CreatePoolWizard - Format selection logged to Firebase Analytics");
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
                        console.log("CreatePoolWizard - Format selection logged to Firebase Analytics");
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
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: "'Poppins', sans-serif" }}
                    >
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
          After creation, you can customize event details, rules, and settings from the commissioner’s page.
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
            <StyledButton onClick={handleCreatePool} disabled={creating} aria-label="Create pool">
              {creating ? (
                <>
                  Creating...{" "}
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
            <StyledButton
              onClick={handleShareInvite}
              startIcon={<ShareIcon />}
              aria-label="Share invite link for pool"
            >
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

  // Show loading UI while auth state is resolving
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
              <Alert
                severity="success"
                sx={{ fontFamily: "'Poppins', sans-serif" }}
                role="alert"
                aria-live="assertive"
              >
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

  return <WizardContent user={user} authLoading={authLoading} mode={mode} location={location} />;
}
