import React, { useEffect, useRef, useState } from "react"; // Added useState for analytics
import { Link as RouterLink } from "react-router-dom";
import { useThemeContext } from "../../contexts/ThemeContext";
import {
  Box,
  Container,
  Typography,
  Divider,
  Link,
  Grid,
  IconButton,
  Fade,
  styled,
  Tooltip,
} from "@mui/material";
import TwitterIcon from "@mui/icons-material/Twitter";
import InstagramIcon from "@mui/icons-material/Instagram";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { getAnalyticsService } from "../../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";

// Social Media Links from environment variables
const TWITTER_URL = process.env.REACT_APP_TWITTER_URL || "https://twitter.com/bonomosportspools";
const INSTAGRAM_URL = process.env.REACT_APP_INSTAGRAM_URL || "https://instagram.com/bonomosportspools";

// Styled components for polished UI
const FooterBox = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === "dark"
    ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
    : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
  boxShadow: "0 -4px 12px rgba(0,0,0,0.2)",
  borderTop: "1px solid",
  borderColor: theme.palette.divider,
  padding: theme.spacing(6, 2),
  [theme.breakpoints.up("md")]: {
    padding: theme.spacing(8, 4),
  },
  marginTop: "auto",
}));

const FooterLink = styled(Link)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? theme.palette.text.secondary : theme.palette.text.secondary,
  fontFamily: "'Poppins', sans-serif",
  fontWeight: 500,
  fontSize: "0.95rem",
  textDecoration: "none",
  transition: theme.transitions.create("color", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    color: theme.palette.secondary.main,
    textDecoration: "underline",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const SocialIconButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? theme.palette.text.secondary : theme.palette.text.secondary,
  transition: theme.transitions.create("color", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    color: theme.palette.secondary.main,
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
  "&:disabled": {
    color: theme.palette.action.disabled,
  },
}));

const SocialIconsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  mb: 2,
  [theme.breakpoints.down("xs")]: {
    gap: theme.spacing(1),
    justifyContent: "center",
  },
}));

const BackToTopButton = styled(IconButton)(({ theme }) => ({
  position: "fixed",
  bottom: theme.spacing(2.5),
  right: theme.spacing(2.5),
  backgroundColor: theme.palette.secondary.main,
  color: theme.palette.secondary.contrastText,
  boxShadow: theme.shadows[4],
  transition: theme.transitions.create(["background-color", "box-shadow", "transform"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    backgroundColor: theme.palette.secondary.light,
    boxShadow: theme.shadows[6],
    transform: "scale(1.1)",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

function Footer() {
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";
  const topRef = useRef(null);
  const [analytics, setAnalytics] = useState(null); // State for analytics

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Validate URLs
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch (_) {
      return false;
    }
  };

  const isTwitterValid = isValidUrl(TWITTER_URL);
  const isInstagramValid = isValidUrl(INSTAGRAM_URL);

  // Create a hidden element at the top for focus management
  useEffect(() => {
    const topElement = document.createElement("div");
    topElement.setAttribute("tabIndex", "-1");
    topElement.style.position = "absolute";
    topElement.style.top = "0";
    topElement.style.left = "0";
    topElement.style.width = "1px";
    topElement.style.height = "1px";
    topElement.style.overflow = "hidden";
    document.body.insertBefore(topElement, document.body.firstChild);
    topRef.current = topElement;

    return () => {
      if (topRef.current) {
        document.body.removeChild(topRef.current);
      }
    };
  }, []);

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (analytics) {
      logEvent(analytics, "footer_back_to_top_click", {
        timestamp: new Date().toISOString(),
      });
      console.log("Footer - Back to Top click logged to Firebase Analytics");
    }
    setTimeout(() => {
      if (topRef.current) {
        topRef.current.focus();
      }
    }, 500);
  };

  const handleSocialClick = (platform) => {
    if (analytics) {
      logEvent(analytics, "footer_social_click", {
        platform,
        timestamp: new Date().toISOString(),
      });
      console.log(`Footer - ${platform} click logged to Firebase Analytics`);
    }
  };

  const handleFooterLinkClick = (label) => {
    if (analytics) {
      logEvent(analytics, "footer_link_click", {
        label,
        timestamp: new Date().toISOString(),
      });
      console.log(`Footer - ${label} link click logged to Firebase Analytics`);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <FooterBox role="contentinfo" aria-label="Footer navigation and contact information">
      <Container maxWidth="lg">
        <Fade in timeout={1000}>
          <Grid container spacing={4}>
            {/* Navigation Links */}
            <Grid item xs={12} sm={4} md={3}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: { xs: "1.2rem", md: "1.5rem" },
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  mb: 2,
                }}
              >
                Navigation
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <FooterLink
                  component={RouterLink}
                  to="/"
                  tabIndex={0}
                  aria-label="Navigate to Home page"
                  onClick={() => handleFooterLinkClick("Home")}
                >
                  Home
                </FooterLink>
                <FooterLink
                  component={RouterLink}
                  to="/create-pool"
                  tabIndex={0}
                  aria-label="Navigate to Create Pool page"
                  onClick={() => handleFooterLinkClick("Create Pool")}
                >
                  Create Pool
                </FooterLink>
                <FooterLink
                  component={RouterLink}
                  to="/join"
                  tabIndex={0}
                  aria-label="Navigate to Join Pool page"
                  onClick={() => handleFooterLinkClick("Join Pool")}
                >
                  Join Pool
                </FooterLink>
                <FooterLink
                  component={RouterLink}
                  to="/dashboard"
                  tabIndex={0}
                  aria-label="Navigate to Dashboard page"
                  onClick={() => handleFooterLinkClick("Dashboard")}
                >
                  Dashboard
                </FooterLink>
              </Box>
            </Grid>

            {/* Support Links */}
            <Grid item xs={12} sm={4} md={3}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: { xs: "1.2rem", md: "1.5rem" },
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  mb: 2,
                }}
              >
                Support
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <FooterLink
                  component={RouterLink}
                  to="/faq"
                  tabIndex={0}
                  aria-label="Navigate to FAQ page"
                  onClick={() => handleFooterLinkClick("FAQ")}
                >
                  FAQ
                </FooterLink>
                <FooterLink
                  component={RouterLink}
                  to="/support"
                  tabIndex={0}
                  aria-label="Navigate to Support page"
                  onClick={() => handleFooterLinkClick("Support")}
                >
                  Support
                </FooterLink>
                <FooterLink
                  component={RouterLink}
                  to="/contact"
                  tabIndex={0}
                  aria-label="Navigate to Contact page"
                  onClick={() => handleFooterLinkClick("Contact")}
                >
                  Contact
                </FooterLink>
              </Box>
            </Grid>

            {/* Legal Links */}
            <Grid item xs={12} sm={4} md={3}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: { xs: "1.2rem", md: "1.5rem" },
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  mb: 2,
                }}
              >
                Legal
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <FooterLink
                  component={RouterLink}
                  to="/tos"
                  tabIndex={0}
                  aria-label="Navigate to Terms of Service page"
                  onClick={() => handleFooterLinkClick("Terms of Service")}
                >
                  Terms of Service
                </FooterLink>
                <FooterLink
                  component={RouterLink}
                  to="/privacy"
                  tabIndex={0}
                  aria-label="Navigate to Privacy Policy page"
                  onClick={() => handleFooterLinkClick("Privacy Policy")}
                >
                  Privacy Policy
                </FooterLink>
              </Box>
            </Grid>

            {/* Social Media and Contact */}
            <Grid item xs={12} sm={12} md={3}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: { xs: "1.2rem", md: "1.5rem" },
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                  mb: 2,
                }}
              >
                Connect With Us
              </Typography>
              <SocialIconsContainer>
                <Tooltip title={isTwitterValid ? "Follow us on Twitter" : "Twitter link unavailable"} arrow>
                  <span>
                    <SocialIconButton
                      component={isTwitterValid ? "a" : "button"}
                      href={isTwitterValid ? TWITTER_URL : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleSocialClick("Twitter")}
                      aria-label="Follow us on Twitter"
                      disabled={!isTwitterValid}
                    >
                      <TwitterIcon />
                    </SocialIconButton>
                  </span>
                </Tooltip>
                <Tooltip title={isInstagramValid ? "Follow us on Instagram" : "Instagram link unavailable"} arrow>
                  <span>
                    <SocialIconButton
                      component={isInstagramValid ? "a" : "button"}
                      href={isInstagramValid ? INSTAGRAM_URL : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleSocialClick("Instagram")}
                      aria-label="Follow us on Instagram"
                      disabled={!isInstagramValid}
                    >
                      <InstagramIcon />
                    </SocialIconButton>
                  </span>
                </Tooltip>
              </SocialIconsContainer>
              <Typography
                variant="body2"
                sx={{
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                Email:{" "}
                <FooterLink
                  href="mailto:support@bonomosportspools.com"
                  tabIndex={0}
                  aria-label="Email support at support@bonomosportspools.com"
                  onClick={() => handleFooterLinkClick("Support Email")}
                >
                  support@bonomosportspools.com
                </FooterLink>
              </Typography>
            </Grid>
          </Grid>
        </Fade>

        <Divider sx={{ my: 4, backgroundColor: isDarkMode ? "#3A4B6A" : "#E0E0E0" }} />

        <Fade in timeout={1200}>
          <Typography
            variant="body2"
            align="center"
            sx={{
              color: isDarkMode ? "#B0BEC5" : "#555555",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            © {currentYear} Bonomo Sports Pools. For entertainment purposes only.
          </Typography>
        </Fade>
      </Container>

      {/* Back to Top Button */}
      <Fade in timeout={1500}>
        <Tooltip title="Scroll to top" arrow>
          <BackToTopButton onClick={handleBackToTop} aria-label="Scroll back to top">
            <ArrowUpwardIcon />
          </BackToTopButton>
        </Tooltip>
      </Fade>
    </FooterBox>
  );
}

export default Footer;