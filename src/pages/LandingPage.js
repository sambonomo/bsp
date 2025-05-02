// /src/pages/LandingPage.js
import React, { useEffect, useState, useRef, Fragment } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Paper,
  Fade,
  Dialog,
  DialogContent,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  styled,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SportsFootballIcon from "@mui/icons-material/SportsFootball";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsHockeyIcon from "@mui/icons-material/SportsHockey";
import SportsBaseballIcon from "@mui/icons-material/SportsBaseball";
import SportsGolfIcon from "@mui/icons-material/SportsGolf";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";

import { useAuth } from "../contexts/AuthContext";
import { useThemeContext } from "../contexts/ThemeContext";
import { getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";

/* ---------- styled helpers ---------- */
const HeroBox = styled(Box)(({ theme }) => ({
  position: "relative",
  overflow: "hidden",
  "&:before": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)",
    opacity: 0.4,
  },
}));

const StepBadge = styled(Box)(({ tier }) => ({
  width: 60,
  height: 60,
  borderRadius: "50%",
  backgroundColor:
    tier === "Bronze"
      ? "#CD7F32"
      : tier === "Silver"
      ? "#C0C0C0"
      : "#FFD700",
  color: "#0B162A",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: "1.2rem",
  margin: "0 auto 16px",
}));

const SportCard = styled(Paper)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius * 2,
  transition: "transform .3s, box-shadow .3s",
  "&:hover": {
    transform: "scale(1.05)",
    boxShadow: theme.shadows[6],
  },
}));

const SectionContainer = styled(Container)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius * 3,
  padding: theme.spacing(4),
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
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,.25)",
  "&:hover": {
    backgroundColor: theme.palette.mode === "dark" ? "#FFEB3B" : "#E0B030",
  },
  zIndex: 1100,
}));

/* ---------- component ---------- */
export default function LandingPage() {
  const { user } = useAuth();
  const { mode } = useThemeContext();
  const isDark = mode === "dark";
  const navigate = useNavigate();

  /* ---------- UI state ---------- */
  const [showSticky, setShowSticky] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  /* ---------- analytics helpers ---------- */
  const analytics = useRef(null);
  const logged = useRef({}); // { eventName: true }

  const logOnce = (event) => {
    if (!logged.current[event] && analytics.current) {
      logEvent(analytics.current, event, {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      logged.current[event] = true;
    }
  };

  /* ---------- mount ---------- */
  useEffect(() => {
    analytics.current = getAnalyticsService();
    logOnce("landing_page_viewed");
  }, []);

  /* ---------- scroll listener ---------- */
  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- refs ---------- */
  const howItWorksRef = useRef(null);
  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
    logOnce("learn_more_clicked");
  };

  /* ---------- sport quick-select ---------- */
  const handleSport = (sport) => {
    logOnce(`sport_${sport}_selected`);
    navigate("/create-pool", { state: { sport } });
  };

  return (
    <Box sx={{ bgcolor: isDark ? "#1A2A44" : "#F5F5F5", minHeight: "100vh" }}>
      {/* ================================= HERO */}
      <HeroBox
        sx={{
          textAlign: "center",
          py: { xs: 10, md: 14 },
          px: { xs: 3, md: 5 },
          background: isDark
            ? "linear-gradient(90deg,#1A2A44 0%,#2A3B5A 100%)"
            : "linear-gradient(90deg,#F5F5F5 0%,#E0E0E0 100%)",
        }}
      >
        <Fade in timeout={800}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "2.5rem", md: "4rem" },
                mb: 2,
              }}
            >
              The Simplest Way to Run Sports & Office Pools
            </Typography>

            <Typography
              variant="h6"
              sx={{
                maxWidth: 720,
                mx: "auto",
                mb: 4,
                color: isDark ? "#B0BEC5" : "#555",
              }}
            >
              Create your pool in seconds. Invite friends. Play all season —
              free.
            </Typography>

            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <Button
                component={RouterLink}
                to="/create-pool"
                variant="contained"
                sx={{
                  bgcolor: isDark ? "#FFD700" : "#D4A017",
                  color: "#0B162A",
                  fontWeight: 600,
                  px: 4,
                  py: 1.5,
                  "&:hover": { bgcolor: isDark ? "#FFEB3B" : "#E0B030" },
                }}
                onClick={() => logOnce("create_pool_clicked")}
              >
                Create Pool
              </Button>

              <Button
                component={RouterLink}
                to="/join"
                variant="outlined"
                sx={{
                  color: isDark ? "#fff" : "#0B162A",
                  borderColor: isDark ? "#fff" : "#0B162A",
                  fontWeight: 600,
                  px: 4,
                  py: 1.5,
                  "&:hover": {
                    bgcolor: isDark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.05)",
                  },
                }}
                onClick={() => logOnce("join_pool_clicked")}
              >
                Join Pool
              </Button>

              <Button
                variant="text"
                sx={{ fontWeight: 600 }}
                onClick={() => {
                  setVideoOpen(true);
                  logOnce("watch_demo_clicked");
                }}
              >
                Watch Demo
              </Button>
            </Box>

            <Tooltip title="Scroll to How It Works" arrow>
              <IconButton
                onClick={scrollToHowItWorks}
                sx={{ mt: 6, color: isDark ? "#FFD700" : "#D4A017" }}
                aria-label="Scroll to how it works"
              >
                <ArrowDownwardIcon fontSize="large" />
              </IconButton>
            </Tooltip>
          </Container>
        </Fade>
      </HeroBox>

      {/* ================================= HOW IT WORKS */}
      <Box
        ref={howItWorksRef}
        sx={{
          bgcolor: isDark ? "#2A3B5A" : "#E0E0E0",
          py: { xs: 8, md: 10 },
          px: 2,
        }}
      >
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{ textAlign: "center", fontWeight: 700, mb: 6 }}
          >
            How It Works
          </Typography>

          <Grid container spacing={4} justifyContent="center">
            {[
              {
                tier: "Bronze",
                title: "Sign Up",
                desc: "Sign up and join free with email or Google.",
                icon: <PersonAddIcon sx={{ fontSize: 50, color: "#CD7F32" }} />,
              },
              {
                tier: "Silver",
                title: "Create or Join",
                desc: "Launch a pool or jump into one in seconds.",
                icon: <GroupAddIcon sx={{ fontSize: 50, color: "#C0C0C0" }} />,
              },
              {
                tier: "Gold",
                title: "Compete & Win",
                desc: "Live scores, leaderboards, bragging rights.",
                icon: (
                  <EmojiEventsIcon
                    sx={{ fontSize: 50, color: isDark ? "#FFD700" : "#D4A017" }}
                  />
                ),
              },
            ].map((s, i) => (
              <Grid item xs={12} sm={4} key={s.title}>
                <Fade in timeout={800 + i * 200}>
                  <Paper
                    sx={{
                      p: 4,
                      textAlign: "center",
                      bgcolor: isDark ? "#1A2A44" : "#fff",
                    }}
                    elevation={3}
                  >
                    <StepBadge tier={s.tier}>{i + 1}</StepBadge>
                    {s.icon}
                    <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                      {s.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#B0BEC5" }}>
                      {s.desc}
                    </Typography>
                  </Paper>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* ================================= WHY BSP & COMPARISON */}
      <Box
        sx={{
          bgcolor: isDark ? "#1A2A44" : "#F5F5F5",
          py: { xs: 8, md: 10 },
          px: 2,
        }}
      >
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{ textAlign: "center", fontWeight: 700, mb: 6 }}
          >
            Why Choose BSP?
          </Typography>

          <Grid container spacing={4}>
            {[
              {
                icon: (
                  <SportsFootballIcon
                    sx={{ fontSize: 50, color: isDark ? "#FFD700" : "#D4A017" }}
                  />
                ),
                title: "All Major Sports",
                desc: "NFL, NBA, NHL, MLB, PGA, NASCAR & more.",
              },
              {
                icon: (
                  <EmojiEventsIcon
                    sx={{ fontSize: 50, color: isDark ? "#FFD700" : "#D4A017" }}
                  />
                ),
                title: "Gamification",
                desc: "Badges, streaks & achievements built-in.",
              },
              {
                icon: (
                  <GroupAddIcon
                    sx={{ fontSize: 50, color: isDark ? "#FFD700" : "#D4A017" }}
                  />
                ),
                title: "Free Forever Tier",
                desc: "Host up to 3 pools with ads — no credit card.",
              },
            ].map((f, i) => (
              <Grid item xs={12} sm={4} key={f.title}>
                <Fade in timeout={800 + i * 200}>
                  <Paper
                    sx={{
                      p: 4,
                      textAlign: "center",
                      bgcolor: isDark ? "#2A3B5A" : "#fff",
                    }}
                    elevation={2}
                  >
                    {f.icon}
                    <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                      {f.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#B0BEC5" }}>
                      {f.desc}
                    </Typography>
                  </Paper>
                </Fade>
              </Grid>
            ))}
          </Grid>

          {/* comparison micro-table */}
          <Box sx={{ mt: 8, overflowX: "auto" }}>
            <Table size="small" aria-label="Feature comparison table">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    BSP
                  </TableCell>
                  <TableCell align="center">RunYourPool</TableCell>
                  <TableCell align="center">EasyOfficePools</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  ["Free Tier", "✅", "❌", "❌"],
                  ["Built-in Gamification", "✅", "❌", "❌"],
                  ["AI Bracket Insights*", "🚀", "❌", "❌"],
                  ["Live Score API", "✅", "✅", "✅"],
                  ["Unlimited Members (Paid)", "✅", "✅", "✅"],
                ].map((row) => (
                  <TableRow key={row[0]}>
                    {row.map((cell, idx) => (
                      <TableCell
                        key={idx}
                        align={idx === 0 ? "left" : "center"}
                        sx={{ fontWeight: idx === 0 ? 600 : 400 }}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography
              variant="caption"
              sx={{ mt: 1, display: "block", textAlign: "right" }}
            >
              *Coming soon
            </Typography>
          </Box>
        </SectionContainer>
      </Box>

      {/* ================================= SPORT QUICK SELECT */}
      <Box
        sx={{
          bgcolor: isDark ? "#2A3B5A" : "#E0E0E0",
          py: { xs: 8, md: 10 },
          px: 2,
        }}
      >
        <SectionContainer maxWidth="lg">
          <Typography
            variant="h3"
            sx={{ textAlign: "center", fontWeight: 700, mb: 6 }}
          >
            Pick Your Sport & Go
          </Typography>

          <Grid container spacing={3} justifyContent="center">
            {[
              { name: "NFL", key: "nfl", icon: SportsFootballIcon },
              { name: "NBA", key: "nba", icon: SportsBasketballIcon },
              { name: "NHL", key: "nhl", icon: SportsHockeyIcon },
              { name: "MLB", key: "mlb", icon: SportsBaseballIcon },
              { name: "PGA", key: "pga", icon: SportsGolfIcon },
              { name: "NASCAR", key: "nascar", icon: DirectionsCarIcon },
            ].map((s, i) => (
              <Grid item xs={6} sm={4} md={2} key={s.key}>
                <Fade in timeout={600 + i * 150}>
                  <SportCard
                    onClick={() => handleSport(s.key)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Start a ${s.name} pool`}
                  >
                    <Box
                      sx={{
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        bgcolor: isDark ? "#3A4B6A" : "#F0F0F0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        mb: 2,
                      }}
                    >
                      <s.icon
                        sx={{ fontSize: 36, color: isDark ? "#FFD700" : "#D4A017" }}
                      />
                    </Box>
                    <Typography variant="body2">{s.name}</Typography>
                  </SportCard>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionContainer>
      </Box>

      {/* ================================= GAMIFICATION BANNER */}
      <Box
        sx={{
          bgcolor: isDark ? "#FFD700" : "#D4A017",
          color: "#0B162A",
          py: { xs: 6, md: 8 },
          textAlign: "center",
        }}
      >
        <Container maxWidth="sm">
          <EmojiEventsIcon sx={{ fontSize: 60, mb: 2 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Unlock the “Commissioner” Badge!
          </Typography>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Create your first pool today and earn your first achievement.
          </Typography>
          <Button
            component={RouterLink}
            to="/create-pool"
            variant="contained"
            sx={{
              bgcolor: "#0B162A",
              color: "#fff",
              fontWeight: 600,
              "&:hover": { bgcolor: "#14284a" },
            }}
            onClick={() => logOnce("commissioner_badge_cta")}
          >
            Create My Pool
          </Button>
        </Container>
      </Box>

      {/* ================================= STICKY “START A POOL” */}
      <Fade in={showSticky}>
        <StickyButton
          component={RouterLink}
          to="/create-pool"
          onClick={() => logOnce("sticky_cta_clicked")}
        >
          Start a Pool
        </StickyButton>
      </Fade>

      {/* ================================= DEMO VIDEO MODAL */}
      <Dialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        maxWidth="md"
        fullWidth
        aria-labelledby="demo-video-title"
      >
        <DialogContent
          sx={{ p: 0, position: "relative", bgcolor: "#000" }}
        >
          <IconButton
            aria-label="Close"
            onClick={() => setVideoOpen(false)}
            sx={{ position: "absolute", top: 8, right: 8, color: "#fff", zIndex: 1 }}
          >
            <CloseIcon />
          </IconButton>
          {/* Placeholder video – swap src when ready */}
          <Box
            component="iframe"
            src="https://player.vimeo.com/video/000000000?h=placeholder&autoplay=1&muted=1"
            title="BSP demo video"
            sx={{ width: "100%", height: { xs: 250, sm: 400, md: 500 } }}
            allow="autoplay; fullscreen"
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
