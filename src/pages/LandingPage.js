import React, { useEffect, useState, useRef } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useThemeContext } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { getAnalyticsService, getDb } from "../firebase/config";
import { logEvent } from "firebase/analytics";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  doc,
} from "firebase/firestore";
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Paper,
  Fade,
  styled,
  TextField,
  IconButton,
  Card,
  CardContent,
  CardActions,
  CircularProgress,
  Alert,
} from "@mui/material";
import SportsFootballIcon from "@mui/icons-material/SportsFootball";
import SportsBaseballIcon from "@mui/icons-material/SportsBaseball";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsHockeyIcon from "@mui/icons-material/SportsHockey";
import SportsGolfIcon from "@mui/icons-material/SportsGolf";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import TwitterIcon from "@mui/icons-material/Twitter";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

// Styled components for polished UI
const HeroBox = styled(Box)(({ theme }) => ({
  position: "relative",
  "&:before": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)",
    opacity: 0.4,
  },
}));

const StepBadge = styled(Box)(({ theme, tier }) => ({
  width: 60,
  height: 60,
  borderRadius: "50%",
  backgroundColor: tier === "Bronze" ? "#CD7F32" : tier === "Silver" ? "#C0C0C0" : "#FFD700",
  color: "#0B162A",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: "1.2rem",
  margin: "0 auto 16px",
  boxShadow: theme.shadows[3],
}));

const SportCard = styled(Paper)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(2),
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius * 2,
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
  "&:hover": {
    transform: "scale(1.05)",
    boxShadow: theme.shadows[6],
  },
  textDecoration: "none",
}));

const TestimonialCard = styled(Paper)(({ theme }) => ({
  position: "relative",
  padding: theme.spacing(4),
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius * 2,
  boxShadow: theme.shadows[2],
}));

const SectionContainer = styled(Container)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#1A2A44" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius * 3,
  padding: theme.spacing(4),
  boxShadow: theme.shadows[2],
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  position: "relative",
  zIndex: 1,
}));

const StickyButton = styled(Button)(({ theme }) => ({
  position: "fixed",
  bottom: 20,
  right: 20,
  backgroundColor: theme.palette.mode === "dark" ? "#FFD700" : "#D4A017",
  color: "#0B162A",
  fontWeight: 600,
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  "&:hover": {
    backgroundColor: theme.palette.mode === "dark" ? "#FFEB3B" : "#E0B030",
    boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
  },
  zIndex: 1000,
}));

function LandingPage() {
  const { user } = useAuth();
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";
  const navigate = useNavigate();
  const [showStickyButton, setShowStickyButton] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");
  const [featuredPools, setFeaturedPools] = useState([]);
  const [stats, setStats] = useState({
    poolsCreated: "0+",
    usersJoined: "0+",
    gamesPlayed: "0+",
  });
  const [analytics, setAnalytics] = useState(null);
  const howItWorksRef = useRef(null);
  const hasLoggedPageView = useRef(false);
  const hasLoggedLearnMore = useRef(false);
  const hasLoggedSportCardClick = useRef({});
  const hasLoggedCreatePoolClick = useRef(false);
  const hasLoggedJoinPoolClick = useRef(false);
  const hasLoggedFeaturedPoolClick = useRef({});
  const hasLoggedGetStartedClick = useRef(false);
  const hasLoggedStickyGetStartedClick = useRef(false);
  const hasLoggedNewsletterSignup = useRef(false);
  const hasLoggedNewsletterCancel = useRef(false);
  const db = getDb();

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "landing_page_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [analytics, user?.uid]);

  // Fetch featured pools with real-time updates
  useEffect(() => {
    const poolsRef = collection(db, "pools");
    const q = query(poolsRef, where("isFeatured", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const poolsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setFeaturedPools(poolsData);
    }, (err) => {
      console.error("Failed to fetch featured pools:", err);
      setFeaturedPools([]); // Fallback to empty array on error
    });
    return () => unsubscribe();
  }, [db]);

  // Fetch real-time community stats from /stats/community
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statsRef = doc(db, "stats", "community");
        const statsDoc = await getDoc(statsRef);
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          // Format numbers
          const formatNumber = (num) => {
            if (typeof num !== "number") return "0+";
            if (num >= 1000) return `${Math.floor(num / 1000)},${num % 1000}+`;
            return `${num}+`;
          };

          setStats({
            poolsCreated: formatNumber(data.poolsCreated || 0),
            usersJoined: formatNumber(data.usersJoined || 0),
            gamesPlayed: formatNumber(data.gamesPlayed || 0),
          });
        } else {
          console.error("Community stats document not found");
          setStats({
            poolsCreated: "0+",
            usersJoined: "0+",
            gamesPlayed: "0+",
          });
        }
      } catch (err) {
        console.error("Failed to fetch community stats:", err);
        setStats({
          poolsCreated: "0+",
          usersJoined: "0+",
          gamesPlayed: "0+",
        });
      }
    };

    fetchStats();
  }, [db]);

  // Handle sticky button visibility on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowStickyButton(true);
      } else {
        setShowStickyButton(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle scroll to "How It Works" section
  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!hasLoggedLearnMore.current && analytics) {
      logEvent(analytics, "learn_more_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Learn More clicked logged to Firebase Analytics");
      hasLoggedLearnMore.current = true;
    }
  };

  // Handle sport card click
  const handleSportClick = (sportKey) => {
    if (!hasLoggedSportCardClick.current[sportKey] && analytics) {
      logEvent(analytics, "sport_card_clicked", {
        userId: user?.uid || "anonymous",
        sportKey,
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Sport card click logged to Firebase Analytics");
      hasLoggedSportCardClick.current[sportKey] = true;
    }
  };

  // Handle create pool click
  const handleCreatePoolClick = () => {
    if (!hasLoggedCreatePoolClick.current && analytics) {
      logEvent(analytics, "create_pool_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Create pool click logged to Firebase Analytics");
      hasLoggedCreatePoolClick.current = true;
    }
  };

  // Handle join pool click
  const handleJoinPoolClick = () => {
    if (!hasLoggedJoinPoolClick.current && analytics) {
      logEvent(analytics, "join_pool_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Join pool click logged to Firebase Analytics");
      hasLoggedJoinPoolClick.current = true;
    }
  };

  // Handle featured pool click
  const handleFeaturedPoolClick = (poolId) => {
    if (!hasLoggedFeaturedPoolClick.current[poolId] && analytics) {
      logEvent(analytics, "featured_pool_clicked", {
        userId: user?.uid || "anonymous",
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Featured pool click logged to Firebase Analytics");
      hasLoggedFeaturedPoolClick.current[poolId] = true;
    }
  };

  // Handle get started click
  const handleGetStartedClick = () => {
    if (!hasLoggedGetStartedClick.current && analytics) {
      logEvent(analytics, "get_started_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Get started click logged to Firebase Analytics");
      hasLoggedGetStartedClick.current = true;
    }
  };

  // Handle sticky get started click
  const handleStickyGetStartedClick = () => {
    if (!hasLoggedStickyGetStartedClick.current && analytics) {
      logEvent(analytics, "sticky_get_started_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Sticky get started click logged to Firebase Analytics");
      hasLoggedStickyGetStartedClick.current = true;
    }
  };

  // Handle newsletter signup with Firestore
  const handleNewsletterSignup = async (e) => {
    e.preventDefault();
    setEmailError("");
    setEmailSuccess("");
    setEmailSubmitting(true);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address.");
      setEmailSubmitting(false);
      return;
    }

    try {
      const signupsRef = collection(db, "newsletter_signups");
      const q = query(signupsRef, where("email", "==", email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setEmailError("This email is already subscribed to the newsletter.");
        setEmailSubmitting(false);
        return;
      }

      await addDoc(signupsRef, {
        email,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });

      setEmailSuccess("Thank you for signing up! We'll keep you updated.");
      if (!hasLoggedNewsletterSignup.current && analytics) {
        logEvent(analytics, "newsletter_signup", {
          userId: user?.uid || "anonymous",
          emailHash: email ? btoa(email).substring(0, 10) : "anonymous",
          timestamp: new Date().toISOString(),
        });
        console.log("LandingPage - Newsletter signup logged to Firebase Analytics");
        hasLoggedNewsletterSignup.current = true;
      }
      setEmail("");
    } catch (err) {
      console.error("Newsletter signup failed:", err);
      let userFriendlyError = "Failed to sign up. Please try again later.";
      if (err.code === "permission-denied") {
        userFriendlyError = "Permission denied. Please try again or contact support.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Service unavailable. Please try again later.";
      }
      setEmailError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "newsletter_signup_failed", {
          userId: user?.uid || "anonymous",
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("LandingPage - Newsletter signup failure logged to Firebase Analytics");
      }
    } finally {
      setEmailSubmitting(false);
    }
  };

  // Handle newsletter signup cancel
  const handleNewsletterCancel = () => {
    setEmail("");
    setEmailError("");
    setEmailSuccess("");
    if (!hasLoggedNewsletterCancel.current && analytics) {
      logEvent(analytics, "newsletter_signup_canceled", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LandingPage - Newsletter signup canceled logged to Firebase Analytics");
      hasLoggedNewsletterCancel.current = true;
    }
  };

  return (
    <Box
      sx={{
        backgroundColor: isDarkMode ? "#1A2A44" : "#F5F5F5",
        color: isDarkMode ? "#FFFFFF" : "#0B162A",
        minHeight: "100vh",
      }}
    >
      {/* =============================
          HERO SECTION
      ============================= */}
      <HeroBox
        sx={{
          textAlign: "center",
          py: { xs: 12, md: 16 },
          px: { xs: 3, md: 5 },
          background: isDarkMode
            ? "linear-gradient(90deg, #1A2A44 0%, #2A3B5A 100%)"
            : "linear-gradient(90deg, #F5F5F5 0%, #E0E0E0 100%)",
        }}
      >
        <Fade in timeout={1000}>
          <Container maxWidth="lg">
            <Typography
              variant="h1"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "2.8rem", md: "4.5rem" },
                mb: 3,
                fontFamily: "'Montserrat', sans-serif'",
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
              }}
            >
              Bonomo Sports Pools
            </Typography>
            <Typography
              variant="h5"
              sx={{
                maxWidth: 800,
                mx: "auto",
                mb: 5,
                fontSize: { xs: "1.3rem", md: "1.8rem" },
                fontWeight: 400,
                fontFamily: "'Poppins', sans-serif'",
                color: isDarkMode ? "#B0BEC5" : "#555555",
                lineHeight: 1.5,
              }}
            >
              Create Your Free Pool in Seconds! Pick’em, Survivor, Squares, Strip Cards, and More.
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 3, flexWrap: "wrap" }}>
              <Button
                component={RouterLink}
                to="/create-pool"
                variant="contained"
                sx={{
                  backgroundColor: isDarkMode ? "#FFD700" : "#D4A017",
                  color: "#0B162A",
                  fontWeight: 600,
                  fontSize: { xs: "1rem", md: "1.2rem" },
                  px: 5,
                  py: 1.5,
                  borderRadius: 2,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  "&:hover": { backgroundColor: isDarkMode ? "#FFEB3B" : "#E0B030", boxShadow: "0 6px 16px rgba(0,0,0,0.3)" },
                }}
                aria-label="Create a pool"
                onClick={handleCreatePoolClick}
              >
                Create a Pool
              </Button>
              <Button
                component={RouterLink}
                to="/join"
                variant="contained"
                sx={{
                  backgroundColor: isDarkMode ? "#FFD700" : "#D4A017",
                  color: "#0B162A",
                  fontWeight: 600,
                  fontSize: { xs: "1rem", md: "1.2rem" },
                  px: 5,
                  py: 1.5,
                  borderRadius: 2,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  "&:hover": { backgroundColor: isDarkMode ? "#FFEB3B" : "#E0B030", boxShadow: "0 6px 16px rgba(0,0,0,0.3)" },
                }}
                aria-label="Join a pool"
                onClick={handleJoinPoolClick}
              >
                Join a Pool
              </Button>
              <Button
                variant="outlined"
                onClick={scrollToHowItWorks}
                sx={{
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  borderColor: isDarkMode ? "#FFFFFF" : "#0B162A",
                  fontWeight: 600,
                  fontSize: { xs: "1rem", md: "1.2rem" },
                  px: 5,
                  py: 1.5,
                  borderRadius: 2,
                  "&:hover": {
                    backgroundColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                  },
                }}
                endIcon={<ArrowDownwardIcon aria-hidden="true" />}
                aria-label="Learn more about Bonomo Sports Pools"
              >
                Learn More
              </Button>
            </Box>
          </Container>
        </Fade>
      </HeroBox>

      {/* =============================
          HOW IT WORKS
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#2A3B5A" : "#E0E0E0" }} ref={howItWorksRef}>
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 8,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            How It Works
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {[
              {
                tier: "Bronze",
                step: 1,
                title: "Sign Up",
                desc: "Join with a free Bronze account to get started.",
                icon: <PersonAddIcon sx={{ fontSize: 50, color: "#CD7F32" }} aria-label="Sign up icon" />,
              },
              {
                tier: "Silver",
                step: 2,
                title: "Create or Join",
                desc: "Create a pool or join one with a code—Pick’em, Survivor, Squares, or Strip Cards.",
                icon: <GroupAddIcon sx={{ fontSize: 50, color: "#C0C0C0" }} aria-label="Create or join icon" />,
              },
              {
                tier: "Gold",
                step: 3,
                title: "Compete & Win",
                desc: "Track results and aim for the Gold—bragging rights await!",
                icon: <EmojiEventsIcon sx={{ fontSize: 50, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="Compete and win icon" />,
              },
            ].map((item) => (
              <Grid item xs={12} sm={4} md={4} key={item.step} sx={{ display: "flex", justifyContent: "center" }}>
                <Fade in timeout={1200 + item.step * 200}>
                  <Paper
                    sx={{
                      p: 5,
                      textAlign: "center",
                      backgroundColor: isDarkMode ? "#1A2A44" : "#FFFFFF",
                      transition: "transform 0.3s ease",
                      "&:hover": { transform: "scale(1.03)", boxShadow: "0 6px 20px rgba(0,0,0,0.15)" },
                      borderRadius: 3,
                      border: "1px solid",
                      borderColor: isDarkMode ? "#3A4B6A" : "#E0E0E0",
                      width: "100%",
                      maxWidth: 300,
                    }}
                    elevation={2}
                    role="region"
                    aria-label={`Step ${item.step}: ${item.title}`}
                  >
                    <StepBadge tier={item.tier}>{item.step}</StepBadge>
                    {item.icon}
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2, fontSize: "1.3rem" }}>
                      {item.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: isDarkMode ? "#B0BEC5" : "#555555", lineHeight: 1.6, fontFamily: "'Poppins', sans-serif'" }}
                    >
                      {item.desc}
                    </Typography>
                  </Paper>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* =============================
          WHY CHOOSE BSP?
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#1A2A44" : "#F5F5F5" }}>
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 8,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            Why Choose BSP?
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {[
              {
                icon: <SportsFootballIcon sx={{ fontSize: 50, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="Variety of pool types icon" />,
                title: "Variety of Pool Types",
                desc: "Choose from Pick’em, Survivor, Squares, or Strip Cards for any sport.",
              },
              {
                icon: <GroupAddIcon sx={{ fontSize: 50, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="All sports supported icon" />,
                title: "All Sports Supported",
                desc: "From NFL to NASCAR, create pools for your favorite events.",
              },
              {
                icon: <EmojiEventsIcon sx={{ fontSize: 50, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="Free and fun icon" />,
                title: "Free & Fun",
                desc: "No fees, just friendly competition. Perfect for friends, family, or the office.",
              },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={4} key={item.title}>
                <Fade in timeout={1200 + index * 200}>
                  <Paper
                    sx={{
                      p: 5,
                      textAlign: "center",
                      backgroundColor: isDarkMode ? "#1A2A44" : "#FFFFFF",
                      transition: "transform 0.3s ease, border 0.3s ease",
                      "&:hover": {
                        transform: "scale(1.03)",
                        border: "2px solid",
                        borderImage: `linear-gradient(45deg, ${isDarkMode ? "#FFD700" : "#D4A017"}, ${isDarkMode ? "#FFEB3B" : "#E0B030"}) 1`,
                        boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
                      },
                      borderRadius: 3,
                      border: "1px solid",
                      borderColor: isDarkMode ? "#3A4B6A" : "#E0E0E0",
                    }}
                    elevation={2}
                    role="region"
                    aria-label={item.title}
                  >
                    {item.icon}
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, mt: 2, fontSize: "1.3rem", fontFamily: "'Montserrat', sans-serif'" }}>
                      {item.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: isDarkMode ? "#B0BEC5" : "#555555", lineHeight: 1.6, fontFamily: "'Poppins', sans-serif'" }}
                    >
                      {item.desc}
                    </Typography>
                  </Paper>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* =============================
          POOLS FOR EVERY SPORT
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#2A3B5A" : "#E0E0E0" }}>
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 8,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            Pools for Every Sport
          </Typography>
          <Grid container spacing={3} justifyContent="center">
            {[
              { name: "NFL Football", sportKey: "nfl", icon: <SportsFootballIcon sx={{ fontSize: 40, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="NFL Football icon" /> },
              { name: "NBA Basketball", sportKey: "nba", icon: <SportsBasketballIcon sx={{ fontSize: 40, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="NBA Basketball icon" /> },
              { name: "NHL Hockey", sportKey: "nhl", icon: <SportsHockeyIcon sx={{ fontSize: 40, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="NHL Hockey icon" /> },
              { name: "MLB Baseball", sportKey: "mlb", icon: <SportsBaseballIcon sx={{ fontSize: 40, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="MLB Baseball icon" /> },
              { name: "PGA Golf", sportKey: "pga", icon: <SportsGolfIcon sx={{ fontSize: 40, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="PGA Golf icon" /> },
              { name: "NASCAR", sportKey: "nascar", icon: <DirectionsCarIcon sx={{ fontSize: 40, color: isDarkMode ? "#FFD700" : "#D4A017" }} aria-label="NASCAR icon" /> },
            ].map((sport, index) => (
              <Grid item xs={6} sm={4} md={2} key={sport.name}>
                <Fade in timeout={1000 + index * 300}>
                  <SportCard
                    component={RouterLink}
                    to={`/create-pool?sport=${sport.sportKey}`}
                    onClick={() => handleSportClick(sport.sportKey)}
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleSportClick(sport.sportKey);
                        navigate(`/create-pool?sport=${sport.sportKey}`);
                      }
                    }}
                    role="link"
                    aria-label={`Create a pool for ${sport.name}`}
                  >
                    <Box
                      sx={{
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        backgroundColor: isDarkMode ? "#3A4B6A" : "#F0F0F0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        mb: 2,
                      }}
                    >
                      {sport.icon}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: isDarkMode ? "#B0BEC5" : "#555555",
                        fontSize: "0.95rem",
                        lineHeight: 1.4,
                        fontFamily: "'Poppins', sans-serif'",
                      }}
                    >
                      {sport.name}
                    </Typography>
                  </SportCard>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* =============================
          TESTIMONIALS
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#2A3B5A" : "#E0E0E0" }}>
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 8,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            What Our Users Say
          </Typography>
          <Grid container spacing={4}>
            {[
              { quote: "BSP’s Pick’em pools are so easy to set up! Our office loves competing each week.", author: "Mike T., Chicago, IL" },
              { quote: "I ran a Survivor pool for the NFL season, and BSP made it seamless. No fees, just fun!", author: "Sarah L., New York, NY" },
              { quote: "The mobile experience for Squares pools is amazing. I joined on my phone in seconds.", author: "Jake R., Los Angeles, CA" },
              { quote: "Strip Cards for NASCAR were a hit! The automatic assignment of drivers was perfect.", author: "Emily K., Daytona, FL" },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Fade in timeout={1200 + index * 200}>
                  <TestimonialCard>
                    <FormatQuoteIcon sx={{ position: "absolute", top: 16, left: 16, fontSize: 40, color: isDarkMode ? "#B0BEC5" : "#555555", opacity: 0.2 }} aria-hidden="true" />
                    <Typography
                      variant="body1"
                      sx={{
                        mb: 2,
                        fontStyle: "italic",
                        color: isDarkMode ? "#B0BEC5" : "#555555",
                        lineHeight: 1.6,
                        fontSize: "1rem",
                        fontFamily: "'Poppins', sans-serif'",
                      }}
                    >
                      {item.quote}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "'Poppins', sans-serif'" }}>
                      — {item.author}
                    </Typography>
                  </TestimonialCard>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* =============================
          STATS SECTION
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#1A2A44" : "#F5F5F5" }}>
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 8,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            Our Growing Community
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {[
              { value: stats.poolsCreated, label: "Pools Created" },
              { value: stats.usersJoined, label: "Users Joined" },
              { value: stats.gamesPlayed, label: "Games Played" },
            ].map((stat, index) => (
              <Grid item xs={12} sm={4} md={4} key={stat.label}>
                <Fade in timeout={1200 + index * 200}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 700,
                        fontFamily: "'Montserrat', sans-serif'",
                        color: isDarkMode ? "#FFD700" : "#D4A017",
                        mb: 1,
                      }}
                    >
                      {stat.value}
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontFamily: "'Poppins', sans-serif'",
                        color: isDarkMode ? "#B0BEC5" : "#555555",
                      }}
                    >
                      {stat.label}
                    </Typography>
                  </Box>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* =============================
          FAQ SECTION
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#2A3B5A" : "#E0E0E0" }}>
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 8,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            Frequently Asked Questions
          </Typography>
          <Grid container spacing={4}>
            {[
              {
                question: "What types of pools can I create?",
                answer: "BSP supports Pick’em, Survivor, Squares, and Strip Cards. Choose the format that best suits your event, from NFL games to PGA tournaments.",
              },
              {
                question: "Is Bonomo Sports Pools free to use?",
                answer: "Yes! Our Bronze tier is free with ads. Upgrade to Silver or Gold for an ad-free experience and premium features.",
              },
              {
                question: "How do I invite friends to my pool?",
                answer: "After creating a pool, you'll get an invite code and a shareable link to send to your friends or family. They can join using the code!",
              },
            ].map((faq, index) => (
              <Grid item xs={12} key={index}>
                <Fade in timeout={1200 + index * 200}>
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        fontFamily: "'Montserrat', sans-serif'",
                        color: isDarkMode ? "#FFFFFF" : "#0B162A",
                        mb: 1,
                      }}
                    >
                      {faq.question}
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontFamily: "'Poppins', sans-serif'",
                        color: isDarkMode ? "#B0BEC5" : "#555555",
                        lineHeight: 1.6,
                      }}
                    >
                      {faq.answer}
                    </Typography>
                  </Box>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* =============================
          CTA: GET STARTED
      ============================= */}
      <Box
        sx={{
          py: { xs: 12, md: 14 },
          px: { xs: 2, md: 6 },
          background: isDarkMode
            ? "linear-gradient(180deg, #2A3B5A 0%, #1A2A44 100%)"
            : "linear-gradient(180deg, #E0E0E0 0%, #F5F5F5 100%)",
        }}
      >
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 4,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            Ready to Start Your Pool?
          </Typography>
          <Typography
            variant="h6"
            sx={{
              textAlign: "center",
              mb: 6,
              fontWeight: 400,
              maxWidth: 600,
              mx: "auto",
              color: isDarkMode ? "#B0BEC5" : "#555555",
              fontSize: { xs: "1.2rem", md: "1.5rem" },
              lineHeight: 1.5,
              fontFamily: "'Poppins', sans-serif'",
            }}
          >
            Create a pool for your favorite sport—Pick’em, Survivor, Squares, or Strip Cards. It’s free, fun, and takes just seconds!
          </Typography>
          <Box sx={{ textAlign: "center" }}>
            <Button
              component={RouterLink}
              to="/create-pool"
              variant="contained"
              sx={{
                backgroundColor: isDarkMode ? "#FFD700" : "#D4A017",
                color: "#0B162A",
                fontWeight: 600,
                fontSize: { xs: "1.2rem", md: "1.4rem" },
                px: 6,
                py: 2,
                borderRadius: 2,
                boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
                "&:hover": { backgroundColor: isDarkMode ? "#FFEB3B" : "#E0B030", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
              }}
              aria-label="Get started now with a pool"
              onClick={handleGetStartedClick}
            >
              Get Started Now
            </Button>
          </Box>
        </SectionContainer>
      </Box>

      {/* =============================
          NEWSLETTER SIGNUP
      ============================= */}
      <Box sx={{ py: { xs: 10, md: 12 }, px: { xs: 2, md: 6 }, backgroundColor: isDarkMode ? "#1A2A44" : "#F5F5F5" }}>
        <SectionContainer maxWidth="md">
          <Typography
            variant="h3"
            sx={{
              textAlign: "center",
              mb: 4,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif'",
              fontSize: { xs: "2rem", md: "2.5rem" },
              lineHeight: 1.3,
            }}
          >
            Stay in the Game
          </Typography>
          <Typography
            variant="h6"
            sx={{
              textAlign: "center",
              mb: 6,
              fontWeight: 400,
              maxWidth: 600,
              mx: "auto",
              color: isDarkMode ? "#B0BEC5" : "#555555",
              fontSize: { xs: "1.2rem", md: "1.5rem" },
              lineHeight: 1.5,
              fontFamily: "'Poppins', sans-serif'",
            }}
          >
            Sign up for our newsletter to get updates on new pools, sports events, and exclusive features.
          </Typography>
          <Box component="form" onSubmit={handleNewsletterSignup} sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 400, mx: "auto" }}>
            {emailError && (
              <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
                {emailError}
              </Alert>
            )}
            {emailSuccess && (
              <Alert severity="success" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
                {emailSuccess}
              </Alert>
            )}
            <TextField
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
              InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "newsletter-email-label" } }}
              inputProps={{ "aria-label": "Enter your email address for newsletter", "aria-describedby": "newsletter-email-label" }}
              disabled={emailSubmitting}
            />
            <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
              <Button
                type="submit"
                variant="contained"
                sx={{
                  backgroundColor: isDarkMode ? "#FFD700" : "#D4A017",
                  color: "#0B162A",
                  fontWeight: 600,
                  fontSize: "1rem",
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                  "&:hover": { backgroundColor: isDarkMode ? "#FFEB3B" : "#E0B030" },
                }}
                disabled={emailSubmitting}
                aria-label="Sign up for newsletter"
              >
                {emailSubmitting ? <CircularProgress size={24} aria-label="Submitting" /> : "Sign Up"}
              </Button>
              <Button
                variant="outlined"
                onClick={handleNewsletterCancel}
                sx={{
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  borderColor: isDarkMode ? "#FFFFFF" : "#0B162A",
                  fontWeight: 600,
                  fontSize: "1rem",
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                  "&:hover": {
                    backgroundColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                  },
                }}
                disabled={emailSubmitting}
                aria-label="Cancel newsletter signup"
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </SectionContainer>
      </Box>

      {/* Sticky Button */}
      <Fade in={showStickyButton}>
        <StickyButton
          component={RouterLink}
          to="/create-pool"
          aria-label="Start a pool with Bonomo Sports Pools"
          onClick={handleStickyGetStartedClick}
        >
          Start a Pool
        </StickyButton>
      </Fade>
    </Box>
  );
}

export default LandingPage;