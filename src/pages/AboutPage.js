// /src/pages/AboutPage.js
import React, { useEffect, useState, useRef } from "react";
import { Box, Container, Typography, Grid, Paper, Button, TextField, Alert, CircularProgress, Fade } from "@mui/material";
import { styled } from "@mui/system";
import { useThemeContext } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { getDb, getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";

/* ---------- styled helpers ---------- */
const Section = styled(Box)(({ theme }) => ({
  padding: theme.spacing(10, 2),
  backgroundColor: theme.palette.mode === "dark" ? "#1A2A44" : "#F5F5F5",
}));

const SectionInner = styled(Container)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius * 3,
  padding: theme.spacing(4),
  position: "relative",
  zIndex: 1,
  backgroundColor: theme.palette.mode === "dark" ? "#1A2A44" : "#fff",
}));

/* ---------- main component ---------- */
export default function AboutPage() {
  const { mode } = useThemeContext();
  const isDark = mode === "dark";
  const { user } = useAuth();

  /* ---------- analytics ---------- */
  const [analytics] = useState(getAnalyticsService);
  const logged = useRef(false);
  useEffect(() => {
    if (analytics && !logged.current) {
      logEvent(analytics, "about_page_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      logged.current = true;
    }
  }, [analytics, user?.uid]);

  /* ---------- newsletter form ---------- */
  const db = getDb();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const q = query(collection(db, "newsletter_signups"), where("email", "==", email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError("This email is already subscribed.");
        return;
      }
      await addDoc(collection(db, "newsletter_signups"), {
        email,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      setSuccess("Thanks for signing up! We’ll keep you posted.");
      logEvent(analytics, "newsletter_signup", { userId: user?.uid || "anonymous", emailHash: btoa(email).substring(0, 10) });
      setEmail("");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ bgcolor: isDark ? "#1A2A44" : "#F5F5F5", minHeight: "100vh" }}>
      {/* ---------- HERO ---------- */}
      <Section sx={{ bgcolor: isDark ? "#2A3B5A" : "#E0E0E0" }}>
        <SectionInner maxWidth="md">
          <Typography variant="h2" sx={{ fontWeight: 800, mb: 2, textAlign: "center" }}>
            About Bonomo Sports Pools
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, textAlign: "center", color: isDark ? "#B0BEC5" : "#555" }}>
            Learn more about what makes BSP different, read our FAQs, and join the community!
          </Typography>
        </SectionInner>
      </Section>

      {/* ---------- TRUST BAR ---------- */}
      <Section sx={{ bgcolor: isDark ? "#1A2A44" : "#F5F5F5" }}>
        <SectionInner maxWidth="lg">
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 4, textAlign: "center" }}>
            Trusted by Teams & Offices Everywhere
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {[1, 2, 3, 4].map((n) => (
              <Grid item xs={6} sm={3} key={n}>
                <Paper
                  elevation={1}
                  sx={{
                    height: 80,
                    borderRadius: 2,
                    bgcolor: isDark ? "#2A3B5A" : "#E0E0E0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    color: isDark ? "#B0BEC5" : "#555",
                  }}
                >
                  Logo {n}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </SectionInner>
      </Section>

      {/* ---------- FAQ ---------- */}
      <Section sx={{ bgcolor: isDark ? "#2A3B5A" : "#E0E0E0" }}>
        <SectionInner maxWidth="lg">
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 6, textAlign: "center" }}>
            Frequently Asked Questions
          </Typography>
          <Grid container spacing={4}>
            {[
              {
                q: "What types of pools can I create?",
                a: "Pick’em, Survivor, Squares, Strip Cards, and more—across NFL, NBA, NHL, MLB, PGA, NASCAR, and others.",
              },
              {
                q: "Is BSP really free?",
                a: "Yes! Bronze tier is free with ads. You can upgrade anytime for no-ads and premium tools.",
              },
              {
                q: "How do I invite friends?",
                a: "After creating a pool, share your invite link or code. They can join in a click—no hassle.",
              },
            ].map((item, i) => (
              <Grid item xs={12} key={i}>
                <Fade in timeout={800 + i * 150}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {item.q}
                    </Typography>
                    <Typography variant="body1" sx={{ color: isDark ? "#B0BEC5" : "#555" }}>
                      {item.a}
                    </Typography>
                  </Box>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </SectionInner>
      </Section>

      {/* ---------- NEWSLETTER ---------- */}
      <Section sx={{ bgcolor: isDark ? "#1A2A44" : "#F5F5F5" }}>
        <SectionInner maxWidth="sm">
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 4, textAlign: "center" }}>
            Stay in the Game
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, textAlign: "center", color: isDark ? "#B0BEC5" : "#555" }}>
            Sign up for updates on new features, pools, and special promos.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && (
              <Alert severity="error" aria-live="assertive">
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" aria-live="assertive">
                {success}
              </Alert>
            )}

            <TextField
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
            />

            <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
              <Button type="submit" variant="contained" disabled={submitting} sx={{ minWidth: 140 }}>
                {submitting ? <CircularProgress size={24} /> : "Sign Up"}
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setEmail("");
                  setError("");
                  setSuccess("");
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </SectionInner>
      </Section>
    </Box>
  );
}
