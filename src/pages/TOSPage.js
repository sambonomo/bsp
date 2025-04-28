import React, { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Container, Typography, Button } from "@mui/material";
import { getAnalyticsService } from "../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";

function TOSPage() {
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPageView = useRef(false); // Track if tos_page_viewed has been logged

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "tos_page_viewed", {
        timestamp: new Date().toISOString(),
      });
      console.log("TOSPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [analytics]); // Added analytics to dependencies

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box
        sx={{
          p: 3,
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 1,
          border: "1px solid",
          borderColor: "divider",
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
              : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
        }}
        role="document"
        aria-label="Terms of Service and Disclaimers"
      >
        <Typography
          variant="h4"
          sx={{ mb: 3, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}
        >
          Terms of Service & Disclaimers
        </Typography>

        <Typography
          variant="body2"
          sx={{ mb: 3, fontStyle: "italic", fontFamily: "'Poppins', sans-serif'", color: "text.secondary" }}
        >
          Last Updated: April 25, 2025
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            sx={{ mb: 1, fontWeight: 600, fontFamily: "'Montserrat', sans-serif'" }}
          >
            Introduction
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
            Welcome to Bonomo Sports Pools (BSP). This site is for entertainment purposes only. No real money is exchanged, and we do not take any responsibility for offline buy-ins, payouts, or donations. All money transactions occur solely between the commissioner and participants, offline.
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            sx={{ mb: 1, fontWeight: 600, fontFamily: "'Montserrat', sans-serif'" }}
          >
            Disclaimer
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
            <strong>Entertainment Only:</strong> This service is for entertainment purposes only. No house cut or rake is taken. All offline money handling is user-driven. Void where prohibited by local laws. Users are responsible for compliance with any applicable legal requirements in their jurisdiction.
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            sx={{ mb: 1, fontWeight: 600, fontFamily: "'Montserrat', sans-serif'" }}
          >
            Age Requirement
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
            By using this site, you acknowledge that you are at least 18 years old (or the age of majority in your jurisdiction) and agree to these terms.
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            sx={{ mb: 1, fontWeight: 600, fontFamily: "'Montserrat', sans-serif'" }}
          >
            Privacy Policy
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
            Your privacy is important to us. Please review our{" "}
            <Typography
              component={RouterLink}
              to="/privacy-policy"
              sx={{
                color: (theme) => theme.palette.primary.main,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
                fontFamily: "'Poppins', sans-serif'",
              }}
              aria-label="View Privacy Policy"
            >
              Privacy Policy
            </Typography>{" "}
            to understand how we collect, use, and protect your information.
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            sx={{ mb: 1, fontWeight: 600, fontFamily: "'Montserrat', sans-serif'" }}
          >
            Changes to These Terms
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
            We may update these Terms of Service from time to time to reflect changes in our practices or legal requirements. We will notify users of significant changes by posting the updated terms on this page with a new "Last Updated" date. Your continued use of the site after such changes constitutes your acceptance of the updated terms.
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h6"
            sx={{ mb: 1, fontWeight: 600, fontFamily: "'Montserrat', sans-serif'" }}
          >
            Contact Us
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
            If you have any questions about these Terms of Service, please contact us at{" "}
            <Typography
              component="a"
              href="mailto:support@bonomosportspools.com"
              sx={{
                color: (theme) => theme.palette.primary.main,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
                fontFamily: "'Poppins', sans-serif'",
              }}
              aria-label="Email support"
            >
              support@bonomosportspools.com
            </Typography>
            .
          </Typography>
        </Box>

        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Button
            component={RouterLink}
            to="/"
            variant="outlined"
            sx={{
              fontFamily: "'Poppins', sans-serif'",
              textTransform: "none",
              fontWeight: 600,
            }}
            aria-label="Return to home page"
          >
            Back to Home
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

export default TOSPage;