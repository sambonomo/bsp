import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useThemeContext } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { getDb, getAnalyticsService } from "../firebase/config";
import { addDoc, collection, serverTimestamp, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import { Link as RouterLink } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
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
  CardContent,
  Grid,
  Fade,
  styled,
  Tooltip,
  Snackbar,
  IconButton,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
} from "@mui/material";
import SportsFootballIcon from "@mui/icons-material/SportsFootball";
import SportsBaseballIcon from "@mui/icons-material/SportsBaseball";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsHockeyIcon from "@mui/icons-material/SportsHockey";
import SchoolIcon from "@mui/icons-material/School";
import SportsGolfIcon from "@mui/icons-material/SportsGolf";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import InfoIcon from "@mui/icons-material/Info";

// Styled components for polished UI
const WizardContainer = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === "dark"
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

const steps = ["Select Sport", "Select Event", "Select Format", "Pool Settings", "Review & Create", "Finish"];

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

// Main component to encapsulate navigation logic
function WizardContent({ user, authLoading, mode, location }) {
  const isDarkMode = mode === "dark";
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState("");
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [poolName, setPoolName] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [poolPassword, setPoolPassword] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  // Add state for manual event entry
  const [customEventName, setCustomEventName] = useState("");
  const [customEventDate, setCustomEventDate] = useState("");
  const [customTeamA, setCustomTeamA] = useState("");
  const [customTeamB, setCustomTeamB] = useState("");
  const [isManualEvent, setIsManualEvent] = useState(false);
  const [formatSettings, setFormatSettings] = useState({
    pickemPicksPerWeek: 1,
    survivorElimination: "single",
    squaresGridSize: 100,
    stripCardCount: 10,
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPoolId, setNewPoolId] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedPageView = useRef(false);
  const hasLoggedSportPreselected = useRef(false);
  const hasLoggedSportSelected = useRef(false);
  const hasLoggedEventSelected = useRef(false);
  const hasLoggedFormatSelected = useRef(false);
  const hasLoggedPoolCreated = useRef(false);
  const hasLoggedStepChange = useRef(false);
  const hasLoggedWizardCanceled = useRef(false);
  const db = getDb();

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

  // Handle auth state and preselect sport
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
          console.log("CreatePoolWizard - Sport preselection logged to Firebase Analytics");
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
          console.log("CreatePoolWizard - Format preselection logged to Firebase Analytics");
          hasLoggedFormatSelected.current = true;
        }
      }
    }
  }, [authLoading, user, location.search, navigate, analytics]);

  // Fetch events for the selected sport
  useEffect(() => {
    if (activeStep !== 1 || !selectedSport) return;

    const fetchEvents = async () => {
      setEventLoading(true);
      setEventError("");
      setEvents([]);
      setIsManualEvent(false);

      try {
        // Map sport keys to TheSportsDB league IDs
        const leagueMap = {
          nfl: "4391", // NFL
          nascar: "4370", // NASCAR Cup Series
          golf: "4333", // PGA Tour
          nba: "4387", // NBA
          nhl: "4380", // NHL
          mlb: "4424", // MLB
          ncaaf: "4346", // NCAA Football
          ncaab: "4357", // NCAA Basketball
          other: "0", // No specific league for "Other"
        };

        const leagueId = leagueMap[selectedSport.key];
        if (!leagueId || leagueId === "0") {
          if (selectedSport.key === "other") {
            setEventError("Please manually enter event details for 'Other Event' in the next step.");
            setIsManualEvent(true);
          } else {
            setEventError("Sport not supported by the API. Please manually enter event details in the next step.");
            setIsManualEvent(true);
          }
          if (analytics) {
            logEvent(analytics, "event_fetch_unavailable", {
              userId: user?.uid || "anonymous",
              sportKey: selectedSport.key,
              reason: "unsupported_league",
              timestamp: new Date().toISOString(),
            });
            console.log("CreatePoolWizard - Event fetch unavailable logged to Firebase Analytics");
          }
          return;
        }

        // Try recent seasons starting from 2024 down to 2020
        let season = "2024";
        let fetchedEvents = [];
        for (let year = 2024; year >= 2020; year--) {
          const response = await fetch(
            `https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=${leagueId}&s=${year}`
          );
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          console.log(`CreatePoolWizard - API Response for ${selectedSport.key} (${year}):`, data);

          if (!data || typeof data !== "object") {
            throw new Error("Invalid API response: Data is not an object");
          }

          fetchedEvents = Array.isArray(data.events) ? data.events : [];
          if (fetchedEvents.length > 0) {
            season = year.toString();
            break;
          }
        }

        if (fetchedEvents.length === 0) {
          setEventError(`No events found for ${selectedSport.name} in recent seasons (2020-2024). Please manually enter event details in the next step.`);
          setIsManualEvent(true);
          if (analytics) {
            logEvent(analytics, "event_fetch_unavailable", {
              userId: user?.uid || "anonymous",
              sportKey: selectedSport.key,
              reason: "no_events_found",
              seasonsTried: "2020-2024",
              timestamp: new Date().toISOString(),
            });
            console.log("CreatePoolWizard - Event fetch unavailable (no events) logged to Firebase Analytics");
          }
        } else {
          setEvents(fetchedEvents);
        }
      } catch (err) {
        console.error("CreatePoolWizard - Error fetching events:", err);
        setEventError("Failed to fetch events. Please manually enter event details in the next step or contact support at support@bonomosportspools.com.");
        setIsManualEvent(true);
        setEvents([]);
        if (analytics) {
          logEvent(analytics, "events_fetch_failed", {
            userId: user?.uid || "anonymous",
            sportKey: selectedSport.key,
            error_message: err.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
          console.log("CreatePoolWizard - Events fetch failure logged to Firebase Analytics");
        }
      } finally {
        setEventLoading(false);
      }
    };

    fetchEvents();
  }, [activeStep, selectedSport, user?.uid, analytics]);

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
          console.log(`CreatePoolWizard - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  // Input sanitization function
  const sanitizeInput = (input) => {
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
  };

  // Validate pool name (alphanumeric with spaces and basic punctuation)
  const validatePoolName = (name) => {
    const regex = /^[a-zA-Z0-9\s.,!?-]+$/;
    return regex.test(name);
  };

  function handleNext() {
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
  }

  function handleBack() {
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
  }

  function handleNextStepValidation() {
    setError("");
    if (activeStep === 0 && !selectedSport) {
      setError("Please select a sport to continue.");
      return;
    }
    if (activeStep === 1 && !selectedEvent && !isManualEvent) {
      setError("Please select an event or proceed to manually enter event details.");
      return;
    }
    if (activeStep === 2 && !selectedFormat) {
      setError("Please select a pool format.");
      return;
    }
    if (activeStep === 3) {
      if (!poolName.trim()) {
        setError("Please enter a Pool Name.");
        return;
      }
      if (!validatePoolName(poolName)) {
        setError("Pool Name can only contain letters, numbers, spaces, and basic punctuation (.,!?-).");
        return;
      }
      if (poolPassword && poolPassword.length < 6) {
        setError("Pool Password must be at least 6 characters long if set.");
        return;
      }
      if (isManualEvent) {
        if (!customEventName.trim()) {
          setError("Please enter the event name for your custom event.");
          return;
        }
        if (!customEventDate) {
          setError("Please select a date for your custom event.");
          return;
        }
        if ((selectedFormat.key === "squares" || selectedFormat.key === "strip_cards") && (!customTeamA.trim() || !customTeamB.trim())) {
          setError("Please enter Team A and Team B names for your custom event.");
          return;
        }
      } else {
        if (!eventDate) {
          setError("Please select an event date.");
          return;
        }
        if ((selectedFormat.key === "squares" || selectedFormat.key === "strip_cards") && (!teamAName || !teamBName)) {
          setError("Please enter Team A and Team B names.");
          return;
        }
      }
      if (selectedFormat.key === "pickem" && formatSettings.pickemPicksPerWeek < 1) {
        setError("Picks per week must be at least 1 for Pick’em pools.");
        return;
      }
      if (selectedFormat.key === "squares" && (formatSettings.squaresGridSize !== 25 && formatSettings.squaresGridSize !== 100)) {
        setError("Grid size must be 25 or 100 for Squares pools.");
        return;
      }
      if (selectedFormat.key === "strip_cards" && formatSettings.stripCardCount !== 10) {
        setError("Strip card count must be 10 for Strip Card pools.");
        return;
      }
    }
    handleNext();
  }

  async function handleCreatePool() {
    if (!user) {
      setError("You must be logged in to create a pool.");
      return;
    }
    if (!selectedSport || (!selectedEvent && !isManualEvent) || !selectedFormat || !poolName.trim()) {
      setError("Missing required fields.");
      return;
    }

    try {
      setCreating(true);
      setError("");
      const inviteCode = await generateUniqueInviteCode();
      const sanitizedPoolName = sanitizeInput(poolName);
      const sanitizedWelcomeMsg = sanitizeInput(welcomeMsg);
      const sanitizedTeamAName = isManualEvent ? sanitizeInput(customTeamA) : sanitizeInput(teamAName);
      const sanitizedTeamBName = isManualEvent ? sanitizeInput(customTeamB) : sanitizeInput(teamBName);
      const newPoolData = {
        sport: selectedSport.name,
        sportKey: selectedSport.key,
        eventId: isManualEvent ? "custom_" + uuidv4() : selectedEvent.idEvent,
        eventDate: isManualEvent ? new Date(customEventDate) : new Date(eventDate),
        format: selectedFormat.key,
        formatName: selectedFormat.name,
        poolName: sanitizedPoolName,
        welcomeMessage: sanitizedWelcomeMsg || "",
        poolPassword: poolPassword || "",
        teamAName: sanitizedTeamAName || "",
        teamBName: sanitizedTeamBName || "",
        formatSettings,
        commissionerId: user.uid,
        memberIds: [user.uid],
        status: "open",
        createdAt: serverTimestamp(),
        inviteCode,
        isCustomEvent: isManualEvent,
        customEventName: isManualEvent ? sanitizeInput(customEventName) : null,
      };
      console.log("CreatePoolWizard - Creating Pool with Data:", newPoolData);

      const docRef = await withRetry("Create Pool", () =>
        addDoc(collection(db, "pools"), newPoolData)
      );
      console.log("CreatePoolWizard - Pool Created with ID:", docRef.id);

      if (selectedFormat.key === "squares") {
        const batch = writeBatch(db);
        const squaresCollectionRef = collection(db, "pools", docRef.id, "squares");
        const squareCount = formatSettings.squaresGridSize;
        const gridSize = Math.sqrt(squareCount);

        for (let i = 1; i <= squareCount; i++) {
          const squareId = `square-${i}`;
          const squareRef = doc(squaresCollectionRef, squareId);
          batch.set(squareRef, {
            squareId,
            row: Math.floor((i - 1) / gridSize),
            col: (i - 1) % gridSize,
            userId: null,
            createdAt: serverTimestamp(),
            status: "available",
          });
        }

        await withRetry("Create Squares Batch", () => batch.commit());
        console.log(`CreatePoolWizard - Initialized ${squareCount} squares for pool:`, docRef.id);

        const squaresSnapshot = await getDocs(squaresCollectionRef);
        const createdSquaresCount = squaresSnapshot.size;
        console.log(`CreatePoolWizard - Verified ${createdSquaresCount} squares in pool:`, docRef.id);
        if (createdSquaresCount !== squareCount) {
          console.warn(`CreatePoolWizard - Expected ${squareCount} squares, but found ${createdSquaresCount}`);
        }

        if (analytics) {
          logEvent(analytics, "squares_initialized", {
            userId: user.uid,
            poolId: docRef.id,
            squareCount: createdSquaresCount,
            timestamp: new Date().toISOString(),
          });
          console.log("CreatePoolWizard - Squares initialization logged to Firebase Analytics");
        }
      }

      if (selectedFormat.key === "strip_cards") {
        const batch = writeBatch(db);
        const stripCardsCollectionRef = collection(db, "pools", docRef.id, "strip_cards");
        const stripCount = formatSettings.stripCardCount;

        for (let i = 1; i <= stripCount; i++) {
          const stripId = `strip-${i}`;
          const stripRef = doc(stripCardsCollectionRef, stripId);
          batch.set(stripRef, {
            stripId,
            position: i,
            userId: null,
            createdAt: serverTimestamp(),
            status: "available",
          });
        }

        await withRetry("Create Strip Cards Batch", () => batch.commit());
        console.log(`CreatePoolWizard - Initialized ${stripCount} strip cards for pool:`, docRef.id);

        const stripCardsSnapshot = await getDocs(stripCardsCollectionRef);
        const createdStripCardsCount = stripCardsSnapshot.size;
        console.log(`CreatePoolWizard - Verified ${createdStripCardsCount} strip cards in pool:`, docRef.id);
        if (createdStripCardsCount !== stripCount) {
          console.warn(`CreatePoolWizard - Expected ${stripCount} strip cards, but found ${createdStripCardsCount}`);
        }

        if (analytics) {
          logEvent(analytics, "strip_cards_initialized", {
            userId: user.uid,
            poolId: docRef.id,
            stripCardCount: createdStripCardsCount,
            timestamp: new Date().toISOString(),
          });
          console.log("CreatePoolWizard - Strip cards initialization logged to Firebase Analytics");
        }
      }

      setNewPoolId(docRef.id);
      setSuccessMessage("Pool created successfully!");
      setActiveStep(5);

      if (!hasLoggedPoolCreated.current && analytics) {
        logEvent(analytics, "pool_created", {
          userId: user.uid,
          poolId: docRef.id,
          sport: selectedSport.key,
          eventId: isManualEvent ? "custom" : selectedEvent.idEvent,
          format: selectedFormat.key,
          timestamp: new Date().toISOString(),
        });
        console.log("CreatePoolWizard - Pool creation logged to Firebase Analytics");
        hasLoggedPoolCreated.current = true;
      }
    } catch (err) {
      console.error("CreatePoolWizard - Firestore Error:", err, err.stack);
      let userFriendlyError = "Failed to create pool. Please try again.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to create a pool. Please contact support.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Firestore is currently unavailable. Please try again later.";
      } else if (err.code === "invalid-argument") {
        userFriendlyError = "Invalid data provided. Please check your inputs and try again.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "pool_creation_failed", {
          userId: user?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code,
          timestamp: new Date().toISOString(),
        });
        console.log("CreatePoolWizard - Pool creation failure logged to Firebase Analytics");
      }
    } finally {
      setCreating(false);
    }
  }

  const handleCancelWizard = () => {
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
  };

  async function generateUniqueInviteCode() {
    let inviteCode;
    let isUnique = false;
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, "").substring(0, 6).toUpperCase();
      const poolsRef = collection(db, "pools");
      const q = query(poolsRef, where("inviteCode", "==", inviteCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        isUnique = true;
        break;
      }

      if (analytics) {
        logEvent(analytics, "invite_code_collision", {
          userId: user?.uid || "anonymous",
          inviteCode,
          attempt,
          timestamp: new Date().toISOString(),
        });
        console.log("CreatePoolWizard - Invite code collision logged to Firebase Analytics");
      }
    }

    if (!isUnique) {
      throw new Error("Unable to generate a unique invite code after maximum attempts.");
    }

    if (analytics) {
      logEvent(analytics, "invite_code_generated", {
        userId: user?.uid || "anonymous",
        inviteCode,
        timestamp: new Date().toISOString(),
      });
      console.log("CreatePoolWizard - Invite code generation logged to Firebase Analytics");
    }

    return inviteCode;
  }

  function renderStepContent(step) {
    switch (step) {
      case 0:
        return renderSelectSport();
      case 1:
        return renderSelectEvent();
      case 2:
        return renderSelectFormat();
      case 3:
        return renderPoolSettings();
      case 4:
        return renderReviewCreate();
      default:
        return renderSuccessStep();
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
            fontFamily: "'Montserrat', sans-serif'",
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
                      setSelectedEvent(null);
                      setEvents([]);
                      setIsManualEvent(false);
                      setCustomEventName("");
                      setCustomEventDate("");
                      setCustomTeamA("");
                      setCustomTeamB("");
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
                      setSelectedEvent(null);
                      setEvents([]);
                      setIsManualEvent(false);
                      setCustomEventName("");
                      setCustomEventDate("");
                      setCustomTeamA("");
                      setCustomTeamB("");
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
                      sx={{ fontWeight: 600, fontFamily: "'Poppins', sans-serif'" }}
                    >
                      {sport.name}
                    </Typography>
                    {sport.comingSoon && (
                      <Typography
                        variant="body2"
                        sx={{ color: "#FF4040", mt: 0.5, fontFamily: "'Poppins', sans-serif'" }}
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
      </Box>
    );
  }

  function renderSelectEvent() {
    return (
      <Box>
        <Typography
          variant="h6"
          align="center"
          sx={{
            mb: 4,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif'",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Select an Event for {selectedSport?.name}
        </Typography>
        {eventLoading && (
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <CircularProgress sx={{ color: "#FFD700", mb: 2 }} aria-label="Loading events" />
            <Typography
              variant="body1"
              sx={{
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              Loading events...
            </Typography>
          </Box>
        )}
        {eventError && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }} role="alert" aria-live="assertive">
            {eventError}
            <Typography
              variant="body2"
              sx={{
                mt: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              Click "Next" to manually enter your event details in the Pool Settings step.
            </Typography>
          </Alert>
        )}
        {!eventLoading && Array.isArray(events) && events.length > 0 && (
          <Grid container spacing={3} justifyContent="center">
            {events.slice(0, 6).map((event) => (
              <Grid item xs={12} sm={6} md={4} key={event.idEvent}>
                <Fade in timeout={1000}>
                  <SelectionCard
                    onClick={() => {
                      setSelectedEvent(event);
                      setEventDate(event.dateEvent);
                      setTeamAName(event.strHomeTeam || "");
                      setTeamBName(event.strAwayTeam || "");
                      setIsManualEvent(false);
                      setCustomEventName("");
                      setCustomEventDate("");
                      setCustomTeamA("");
                      setCustomTeamB("");
                      if (!hasLoggedEventSelected.current && analytics) {
                        logEvent(analytics, "event_selected", {
                          userId: user?.uid || "anonymous",
                          eventId: event.idEvent,
                          sportKey: selectedSport.key,
                          timestamp: new Date().toISOString(),
                        });
                        console.log("CreatePoolWizard - Event selection logged to Firebase Analytics");
                        hasLoggedEventSelected.current = true;
                      }
                    }}
                    sx={{
                      border: selectedEvent?.idEvent === event.idEvent ? "2px solid #FFD700" : "1px solid",
                    }}
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedEvent(event);
                        setEventDate(event.dateEvent);
                        setTeamAName(event.strHomeTeam || "");
                        setTeamBName(event.strAwayTeam || "");
                        setIsManualEvent(false);
                        setCustomEventName("");
                        setCustomEventDate("");
                        setCustomTeamA("");
                        setCustomTeamB("");
                        if (!hasLoggedEventSelected.current && analytics) {
                          logEvent(analytics, "event_selected", {
                            userId: user?.uid || "anonymous",
                            eventId: event.idEvent,
                            sportKey: selectedSport.key,
                            timestamp: new Date().toISOString(),
                          });
                          console.log("CreatePoolWizard - Event selection logged to Firebase Analytics");
                          hasLoggedEventSelected.current = true;
                        }
                      }
                    }}
                    role="button"
                    aria-label={`Select event: ${event.strEvent} on ${event.dateEvent}`}
                  >
                    <CardActionArea>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600, fontFamily: "'Poppins', sans-serif'" }}
                      >
                        {event.strEvent}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.5, fontFamily: "'Poppins', sans-serif'" }}
                      >
                        Date: {event.dateEvent}
                      </Typography>
                      {(event.strHomeTeam || event.strAwayTeam) && (
                        <Typography
                          variant="body2"
                          sx={{ mt: 0.5, fontFamily: "'Poppins', sans-serif'" }}
                        >
                          {event.strHomeTeam || "TBD"} vs {event.strAwayTeam || "TBD"}
                        </Typography>
                      )}
                    </CardActionArea>
                  </SelectionCard>
                </Fade>
              </Grid>
            ))}
          </Grid>
        )}
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
            fontFamily: "'Montserrat', sans-serif'",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Select Pool Format for {selectedSport?.name}
        </Typography>
        <Grid container spacing={3} justifyContent="center">
          {FORMATS.map((fmt) => (
            <Grid item xs={6} sm={4} md={3} key={fmt.key}>
              <Fade in timeout={1000}>
                <SelectionCard
                  onClick={() => {
                    setSelectedFormat(fmt);
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
                        fontFamily: "'Poppins', sans-serif'",
                      }}
                    >
                      {fmt.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    >
                      {fmt.desc}
                    </Typography>
                  </CardActionArea>
                </SelectionCard>
              </Fade>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  function renderPoolSettings() {
    return (
      <Box>
        <Typography
          variant="h6"
          align="center"
          sx={{
            mb: 4,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif'",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Pool Settings
        </Typography>
        <TextField
          fullWidth
          label="Pool Name *"
          placeholder="e.g. My Super Bowl Squares"
          value={poolName}
          onChange={(e) => setPoolName(e.target.value)}
          sx={{ mb: 3 }}
          InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
          InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
          inputProps={{ "aria-label": "Enter pool name" }}
          required
        />
        {isManualEvent ? (
          <>
            <TextField
              fullWidth
              label="Custom Event Name *"
              placeholder="e.g. Masters Tournament 2025"
              value={customEventName}
              onChange={(e) => setCustomEventName(e.target.value)}
              sx={{ mb: 3 }}
              InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
              InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
              inputProps={{ "aria-label": "Enter custom event name" }}
              required
              helperText="Enter the name of your event (e.g., a specific game or tournament)."
            />
            <TextField
              fullWidth
              type="date"
              label="Custom Event Date *"
              value={customEventDate}
              onChange={(e) => setCustomEventDate(e.target.value)}
              sx={{ mb: 3 }}
              InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", shrink: true } }}
              InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
              inputProps={{ "aria-label": "Select custom event date" }}
              required
              helperText="Select the date when the event will take place."
            />
            {(selectedFormat?.key === "squares" || selectedFormat?.key === "strip_cards") && (
              <>
                <TextField
                  fullWidth
                  label="Team A Name / Competitor A *"
                  placeholder="e.g. Rory McIlroy"
                  value={customTeamA}
                  onChange={(e) => setCustomTeamA(e.target.value)}
                  sx={{ mb: 3 }}
                  InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  inputProps={{ "aria-label": "Enter custom Team A name" }}
                  required
                  helperText="Enter the name of Team A or Competitor A (e.g., a team or player)."
                />
                <TextField
                  fullWidth
                  label="Team B Name / Competitor B *"
                  placeholder="e.g. Tiger Woods"
                  value={customTeamB}
                  onChange={(e) => setCustomTeamB(e.target.value)}
                  sx={{ mb: 3 }}
                  InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  inputProps={{ "aria-label": "Enter custom Team B name" }}
                  required
                  helperText="Enter the name of Team B or Competitor B (e.g., a team or player)."
                />
              </>
            )}
          </>
        ) : (
          <>
            <TextField
              fullWidth
              type="date"
              label="Event Date *"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              sx={{ mb: 3 }}
              InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", shrink: true } }}
              InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
              inputProps={{ "aria-label": "Select event date" }}
              required
            />
            {(selectedFormat?.key === "squares" || selectedFormat?.key === "strip_cards") && (
              <>
                <TextField
                  fullWidth
                  label="Team A Name *"
                  placeholder="e.g. Kansas City Chiefs"
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  sx={{ mb: 3 }}
                  InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  inputProps={{ "aria-label": "Enter Team A name" }}
                  required
                />
                <TextField
                  fullWidth
                  label="Team B Name *"
                  placeholder="e.g. Philadelphia Eagles"
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  sx={{ mb: 3 }}
                  InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
                  inputProps={{ "aria-label": "Enter Team B name" }}
                  required
                />
              </>
            )}
          </>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <TextField
            fullWidth
            label="Welcome Message (Optional)"
            placeholder="An optional message displayed to members on the pool page."
            multiline
            rows={4}
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            inputProps={{ "aria-label": "Enter welcome message", "aria-describedby": "welcome-message-info" }}
          />
          <Tooltip title="This message will be displayed to all members on the pool page." arrow>
            <IconButton aria-label="Welcome message info">
              <InfoIcon id="welcome-message-info" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <TextField
            fullWidth
            label="Pool Password (Optional)"
            placeholder="If set, participants must enter this password to join."
            value={poolPassword}
            onChange={(e) => setPoolPassword(e.target.value)}
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            inputProps={{ "aria-label": "Enter pool password", "aria-describedby": "pool-password-info" }}
          />
          <Tooltip title="If set, participants must enter this password to join the pool." arrow>
            <IconButton aria-label="Pool password info">
              <InfoIcon id="pool-password-info" />
            </IconButton>
          </Tooltip>
        </Box>
        {selectedFormat?.key === "pickem" && (
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Picks Per Week *</InputLabel>
            <Select
              value={formatSettings.pickemPicksPerWeek}
              onChange={(e) =>
                setFormatSettings({ ...formatSettings, pickemPicksPerWeek: e.target.value })
              }
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              inputProps={{ "aria-label": "Select picks per week for Pick’em pool" }}
            >
              {[1, 2, 3, 4, 5].map((num) => (
                <MenuItem key={num} value={num}>
                  {num}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Number of games participants must pick each week.
            </FormHelperText>
          </FormControl>
        )}
        {selectedFormat?.key === "survivor" && (
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Elimination Type *</InputLabel>
            <Select
              value={formatSettings.survivorElimination}
              onChange={(e) =>
                setFormatSettings({ ...formatSettings, survivorElimination: e.target.value })
              }
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              inputProps={{ "aria-label": "Select elimination type for Survivor pool" }}
            >
              <MenuItem value="single">Single Elimination</MenuItem>
              <MenuItem value="double">Double Elimination</MenuItem>
            </Select>
            <FormHelperText sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Single elimination removes players after one loss; double allows two losses.
            </FormHelperText>
          </FormControl>
        )}
        {selectedFormat?.key === "squares" && (
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Grid Size *</InputLabel>
            <Select
              value={formatSettings.squaresGridSize}
              onChange={(e) =>
                setFormatSettings({ ...formatSettings, squaresGridSize: e.target.value })
              }
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              inputProps={{ "aria-label": "Select grid size for Squares pool" }}
            >
              <MenuItem value={25}>5x5 (25 Squares)</MenuItem>
              <MenuItem value={100}>10x10 (100 Squares)</MenuItem>
            </Select>
            <FormHelperText sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Choose the size of the squares grid.
            </FormHelperText>
          </FormControl>
        )}
        {selectedFormat?.key === "strip_cards" && (
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Strip Card Count *</InputLabel>
            <Select
              value={formatSettings.stripCardCount}
              onChange={(e) =>
                setFormatSettings({ ...formatSettings, stripCardCount: e.target.value })
              }
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              inputProps={{ "aria-label": "Select strip card count for Strip Card pool" }}
            >
              <MenuItem value={10}>10 Strips</MenuItem>
            </Select>
            <FormHelperText sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              Number of strips in the pool (currently fixed at 10).
            </FormHelperText>
          </FormControl>
        )}
        <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
          More advanced settings (deadlines, entry limits, scoring rules) will be available in the pool’s admin panel after creation.
        </Alert>
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
            fontFamily: "'Montserrat', sans-serif'",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Review Your Pool
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
              fontFamily: "'Poppins', sans-serif'",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Sport:</strong> {selectedSport?.name}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif'",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Event:</strong> {isManualEvent ? customEventName : selectedEvent?.strEvent}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif'",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Event Date:</strong> {isManualEvent ? customEventDate : eventDate}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif'",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Format:</strong> {selectedFormat?.name}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 1,
              fontFamily: "'Poppins', sans-serif'",
              color: isDarkMode ? "#B0BEC5" : "#555555",
            }}
          >
            <strong>Pool Name:</strong> {poolName}
          </Typography>
          {(selectedFormat?.key === "squares" || selectedFormat?.key === "strip_cards") && (
            <>
              <Typography
                variant="body1"
                sx={{
                  mb: 1,
                  fontFamily: "'Poppins', sans-serif'",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                <strong>Team A:</strong> {isManualEvent ? customTeamA : teamAName}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mb: 1,
                  fontFamily: "'Poppins', sans-serif'",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                <strong>Team B:</strong> {isManualEvent ? customTeamB : teamBName}
              </Typography>
            </>
          )}
          {selectedFormat?.key === "pickem" && (
            <Typography
              variant="body1"
              sx={{
                mb: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              <strong>Picks Per Week:</strong> {formatSettings.pickemPicksPerWeek}
            </Typography>
          )}
          {selectedFormat?.key === "survivor" && (
            <Typography
              variant="body1"
              sx={{
                mb: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              <strong>Elimination Type:</strong> {formatSettings.survivorElimination === "single" ? "Single Elimination" : "Double Elimination"}
            </Typography>
          )}
          {selectedFormat?.key === "squares" && (
            <Typography
              variant="body1"
              sx={{
                mb: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              <strong>Grid Size:</strong> {formatSettings.squaresGridSize} Squares
            </Typography>
          )}
          {selectedFormat?.key === "strip_cards" && (
            <Typography
              variant="body1"
              sx={{
                mb: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              <strong>Strip Card Count:</strong> {formatSettings.stripCardCount}
            </Typography>
          )}
          {welcomeMsg && (
            <Typography
              variant="body1"
              sx={{
                mb: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              <strong>Welcome Message:</strong> {welcomeMsg}
            </Typography>
          )}
          {poolPassword && (
            <Typography
              variant="body1"
              sx={{
                mb: 1,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
              }}
            >
              <strong>Pool Password:</strong> {poolPassword}
            </Typography>
          )}
        </Box>
        <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
          Ready to create your pool? You can manage more detailed settings after creation.
        </Alert>
        <Box sx={{ textAlign: "right", mt: 3 }}>
          <StyledButton
            onClick={handleCreatePool}
            disabled={creating}
            aria-label="Create pool"
          >
            {creating ? "Creating..." : "Create Pool"}
          </StyledButton>
        </Box>
      </Box>
    );
  }

  function renderSuccessStep() {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography
          variant="h4"
          sx={{
            mb: 2,
            fontWeight: 700,
            fontFamily: "'Montserrat', sans-serif'",
            color: isDarkMode ? "#FFFFFF" : "#0B162A",
          }}
        >
          Pool Created!
        </Typography>
        <Typography
          variant="body1"
          sx={{
            mb: 4,
            fontFamily: "'Poppins', sans-serif'",
            color: isDarkMode ? "#B0BEC5" : "#555555",
          }}
        >
          Your pool has been created. Go to the Dashboard or manage your pool to customize settings.
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
          <StyledButton
            component={RouterLink}
            to="/dashboard"
            aria-label="Go to dashboard"
          >
            View Dashboard
          </StyledButton>
          {newPoolId && (
            <StyledButton
              component={RouterLink}
              to={`/pool/${newPoolId}`}
              aria-label="Go to pool page"
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
                  fontFamily: "'Montserrat', sans-serif'",
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                }}
              >
                Loading Create Pool Wizard
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mb: 3,
                  fontFamily: "'Poppins', sans-serif'",
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

  // Render the wizard if user is authenticated
  return (
    <WizardContainer>
      <Container maxWidth="md">
        <Fade in timeout={1000}>
          <Box>            <Typography
              variant="h4"
              sx={{
                mb: 4,
                fontWeight: 700,
                fontFamily: "'Montserrat', sans-serif'",
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
              <Alert severity="success" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
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
            {activeStep < 4 && (
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
                <StyledButton
                  onClick={handleBack}
                  disabled={activeStep === 0}
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
                  <StyledButton
                    onClick={handleNextStepValidation}
                    aria-label="Go to next step"
                  >
                    Next
                  </StyledButton>
                </Box>
              </Box>
            )}
          </Box>
        </Fade>
      </Container>
    </WizardContainer>
  );
}

// Main component to wrap the wizard content
export default function CreatePoolWizard() {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const location = useLocation();

  return <WizardContent user={user} authLoading={authLoading} mode={mode} location={location} />;
}