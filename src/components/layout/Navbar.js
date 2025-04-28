import React, { useState, useContext, useEffect, useRef } from "react";
import { Link as RouterLink, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { ThemeContext } from "../../contexts/ThemeContext";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Switch,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Fade,
  styled,
  useMediaQuery,
  Avatar,
  Tooltip,
  Alert,
  Snackbar,
} from "@mui/material";
import SportsFootballIcon from "@mui/icons-material/SportsFootball";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import { getAuthService, getAnalyticsService } from "../../firebase/config";
import { logEvent } from "firebase/analytics";

// Styled components for polished UI
const StyledAppBar = styled(AppBar)(({ theme }) => ({
  background: theme.palette.mode === "dark"
    ? "linear-gradient(90deg, #1A2A44 0%, #2A3B5A 100%)"
    : "linear-gradient(90deg, #F5F5F5 0%, #E0E0E0 100%)",
  boxShadow: theme.shadows[4],
  transition: theme.transitions.create("background", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const NavButton = styled(Button)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? theme.palette.text.primary : theme.palette.text.primary,
  fontWeight: 500,
  fontFamily: "'Poppins', sans-serif",
  fontSize: "1rem",
  padding: theme.spacing(1, 2),
  borderRadius: theme.shape.borderRadius,
  transition: theme.transitions.create(["color", "background-color", "transform"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    color: theme.palette.secondary.main,
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.25)",
    transform: "scale(1.05)",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const ThemeToggleBox = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.background.paper : theme.palette.grey[100],
  borderRadius: 20,
  padding: theme.spacing(0.5, 1),
  boxShadow: theme.shadows[2],
  transition: theme.transitions.create("background-color", {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[200],
  },
  "&:focus-within": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const DrawerList = styled(List)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.background.default : theme.palette.grey[50],
  color: theme.palette.mode === "dark" ? theme.palette.text.primary : theme.palette.text.primary,
  width: 250,
  height: "100%",
  padding: theme.spacing(2),
}));

function Navbar() {
  const { user, error, clearError } = useContext(AuthContext);
  const { mode, theme: muiTheme, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const [themeChangeAnnouncement, setThemeChangeAnnouncement] = useState("");
  const [analytics, setAnalytics] = useState(null); // State for Firebase Analytics
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md"));
  const hasLoggedPageView = useRef(false); // Track navbar view event logging
  const hasLoggedDrawerClose = useRef(false); // Track drawer close event logging
  const liveRegionRef = useRef(null); // Ref for accessibility live region
  const menuButtonRef = useRef(null); // Ref for menu button focus management
  const firstDrawerItemRef = useRef(null); // Ref for first drawer item focus management
  const lastDrawerItemRef = useRef(null); // Ref for last drawer item focus management
  const auth = getAuthService(); // Firebase Auth service

  const isDarkMode = mode === "dark";

  // Initialize Firebase Analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Create a persistent live region for accessibility announcements
  useEffect(() => {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    liveRegion.style.position = "absolute";
    liveRegion.style.width = "1px";
    liveRegion.style.height = "1px";
    liveRegion.style.overflow = "hidden";
    liveRegion.style.clip = "rect(0, 0, 0, 0)";
    document.body.appendChild(liveRegion);
    liveRegionRef.current = liveRegion;

    return () => {
      if (liveRegionRef.current) {
        document.body.removeChild(liveRegionRef.current);
      }
    };
  }, []);

  // Log navbar view on mount (only once per session)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "navbar_viewed", {
        userId: user?.uid || "anonymous",
        currentPath: location.pathname,
        themeMode: mode,
        timestamp: new Date().toISOString(),
      });
      console.log("Navbar - Navbar viewed logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, location.pathname, mode, analytics]);

  // Handle user logout with error handling and analytics logging
  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate("/login");
      if (analytics) {
        logEvent(analytics, "navbar_logout_success", {
          userId: user?.uid || "anonymous",
          themeMode: mode,
          timestamp: new Date().toISOString(),
        });
        console.log("Navbar - Logout success logged to Firebase Analytics");
      }
    } catch (err) {
      let userFriendlyError = "Failed to log out. Please try again.";
      if (err.code === "auth/network-request-failed") {
        userFriendlyError = "Network error. Please check your connection and try again.";
      } else if (err.code === "auth/too-many-requests") {
        userFriendlyError = "Too many attempts. Please try again later.";
      }
      setLogoutError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "navbar_logout_failure", {
          userId: user?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code,
          themeMode: mode,
          timestamp: new Date().toISOString(),
        });
        console.log("Navbar - Logout failure logged to Firebase Analytics");
      }
    }
    if (drawerOpen) {
      setDrawerOpen(false);
    }
  };

  // Handle navigation link clicks with analytics logging
  const handleNavClick = (label) => {
    if (analytics) {
      logEvent(analytics, "navbar_link_click", {
        label,
        userId: user?.uid || "anonymous",
        currentPath: location.pathname,
        themeMode: mode,
        timestamp: new Date().toISOString(),
      });
      console.log(`Navbar - ${label} link click logged to Firebase Analytics`);
    }
  };

  // Handle theme toggle with accessibility announcement and analytics logging
  const handleThemeToggle = () => {
    const newMode = mode === "light" ? "dark" : "light";
    toggleTheme();
    setThemeChangeAnnouncement(`Theme changed to ${newMode} mode`);
    if (analytics) {
      logEvent(analytics, "navbar_theme_toggle", {
        newMode,
        userId: user?.uid || "anonymous",
        themeMode: mode,
        timestamp: new Date().toISOString(),
      });
      console.log("Navbar - Theme toggle logged to Firebase Analytics");
    }
  };

  // Announce theme changes for accessibility
  useEffect(() => {
    if (themeChangeAnnouncement && liveRegionRef.current) {
      liveRegionRef.current.innerText = themeChangeAnnouncement;
    }
  }, [themeChangeAnnouncement]);

  // Handle drawer toggle with focus management and analytics logging
  const toggleDrawer = (open) => (event) => {
    if (event.type === "keydown" && (event.key === "Tab" || event.key === "Shift")) {
      // Handle Tab and Shift+Tab for accessibility
      if (open) {
        if (event.key === "Tab" && !event.shiftKey && document.activeElement === lastDrawerItemRef.current) {
          event.preventDefault();
          firstDrawerItemRef.current.focus();
        } else if (event.key === "Tab" && event.shiftKey && document.activeElement === firstDrawerItemRef.current) {
          event.preventDefault();
          lastDrawerItemRef.current.focus();
        }
      }
      return;
    }
    setDrawerOpen(open);
    if (open) {
      if (analytics) {
        logEvent(analytics, "navbar_drawer_open", {
          userId: user?.uid || "anonymous",
          themeMode: mode,
          timestamp: new Date().toISOString(),
        });
        console.log("Navbar - Drawer opened logged to Firebase Analytics");
      }
      setTimeout(() => {
        if (firstDrawerItemRef.current) {
          firstDrawerItemRef.current.focus();
        }
      }, 300);
    } else {
      if (analytics && !hasLoggedDrawerClose.current) {
        logEvent(analytics, "navbar_drawer_close", {
          userId: user?.uid || "anonymous",
          themeMode: mode,
          timestamp: new Date().toISOString(),
        });
        console.log("Navbar - Drawer closed logged to Firebase Analytics");
        hasLoggedDrawerClose.current = true;
      }
      if (menuButtonRef.current) {
        menuButtonRef.current.focus();
      }
    }
  };

  // Reset drawer close logging flag when drawer reopens
  useEffect(() => {
    if (drawerOpen) {
      hasLoggedDrawerClose.current = false;
    }
  }, [drawerOpen]);

  // Navigation links configuration
  const navLinks = [
    { to: "/", label: "Home", public: true },
    { to: "/login", label: "Login", public: true, hideIfAuth: true },
    { to: "/signup", label: "Sign Up", public: true, hideIfAuth: true },
    { to: "/dashboard", label: "Dashboard", protected: true },
    { to: "/create-pool", label: "Create Pool", protected: true },
    { to: "/join", label: "Join Pool", protected: true },
    { to: "/account", label: "Account", protected: true },
    { onClick: handleLogout, label: "Logout", protected: true },
  ];

  // Filter navigation links based on user authentication status
  const filteredNavLinks = navLinks.filter((link) => {
    if (link.public && !user && !link.hideIfAuth) return true;
    if (link.public && link.hideIfAuth && !user) return true;
    if (link.protected && user) return true;
    return false;
  });

  const userInitial = user?.email?.charAt(0)?.toUpperCase() || "U";
  const userDisplayName = user?.displayName || user?.email?.split("@")[0] || "User";

  return (
    <>
      <StyledAppBar position="sticky" role="banner" aria-label="Main navigation">
        <Toolbar sx={{ py: 1.5, px: { xs: 2, md: 4 } }}>
          <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center" }}>
            <SportsFootballIcon sx={{ fontSize: 32, mr: 1, color: theme => theme.palette.secondary.main }} />
            <Typography
              variant="h6"
              component={RouterLink}
              to="/"
              sx={{
                fontWeight: 700,
                fontFamily: "'Montserrat', sans-serif",
                fontSize: { xs: "1.2rem", md: "1.5rem" },
                color: isDarkMode ? "#FFFFFF" : "#0B162A",
                textDecoration: "none",
                transition: theme => theme.transitions.create("color", {
                  duration: theme.transitions.duration.standard,
                  easing: theme.transitions.easing.easeInOut,
                }),
                "&:hover": { color: theme => theme.palette.secondary.main },
                "&:focus": {
                  outline: `2px solid ${theme => theme.palette.secondary.main}`,
                  outlineOffset: 2,
                },
              }}
              aria-label="Bonomo Sports Pools Home"
              tabIndex={0}
              onClick={() => handleNavClick("Home")}
            >
              Bonomo Sports Pools
            </Typography>
          </Box>

          {/* Desktop Navigation */}
          {!isMobile && (
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              {filteredNavLinks.map((link) => (
                <Tooltip key={link.label} title={link.label} arrow>
                  <NavButton
                    component={link.to ? RouterLink : "button"}
                    to={link.to}
                    onClick={() => {
                      if (link.onClick) {
                        link.onClick();
                      }
                      handleNavClick(link.label);
                    }}
                    aria-label={
                      link.label === "Account"
                        ? `View account for ${userDisplayName}`
                        : link.label === "Logout"
                        ? "Log out of your account"
                        : `Navigate to ${link.label} page`
                    }
                    aria-current={link.to && location.pathname === link.to ? "page" : undefined}
                    tabIndex={0}
                  >
                    {link.label === "Account" && user ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Tooltip title={user.email} arrow>
                          <Avatar sx={{ width: 28, height: 28, bgcolor: theme => theme.palette.secondary.main, color: theme => theme.palette.secondary.contrastText, fontSize: "1rem" }}>
                            {userInitial}
                          </Avatar>
                        </Tooltip>
                        <span>{userDisplayName}</span>
                      </Box>
                    ) : (
                      link.label
                    )}
                  </NavButton>
                </Tooltip>
              ))}
              <ThemeToggleBox role="group" aria-label="Theme toggle control">
                <Fade in={mode === "light"} timeout={300}>
                  <LightModeIcon sx={{ fontSize: 20, color: mode === "light" ? theme => theme.palette.secondary.main : theme => theme.palette.text.secondary }} />
                </Fade>
                <Switch
                  checked={mode === "dark"}
                  onChange={handleThemeToggle}
                  color="default"
                  inputProps={{
                    "aria-label": `Current theme is ${mode} mode, switch to ${mode === "light" ? "dark" : "light"} mode`,
                  }}
                  sx={{
                    "& .MuiSwitch-thumb": { backgroundColor: theme => theme.palette.secondary.main },
                    "& .MuiSwitch-track": { backgroundColor: mode === "dark" ? theme => theme.palette.text.secondary : theme => theme.palette.grey[500] },
                  }}
                />
                <Fade in={mode === "dark"} timeout={300}>
                  <DarkModeIcon sx={{ fontSize: 20, color: mode === "dark" ? theme => theme.palette.secondary.main : theme => theme.palette.text.secondary }} />
                </Fade>
              </ThemeToggleBox>
            </Box>
          )}

          {/* Mobile Navigation Toggle */}
          {isMobile && (
            <IconButton
              edge="end"
              onClick={toggleDrawer(true)}
              aria-label="Open navigation menu"
              sx={{ color: theme => theme.palette.secondary.main }}
              ref={menuButtonRef}
            >
              <MenuIcon sx={{ fontSize: 28 }} />
            </IconButton>
          )}
        </Toolbar>
      </StyledAppBar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={toggleDrawer(false)}
        sx={{ display: { xs: "block", md: "none" } }}
        PaperProps={{ sx: { width: 250 } }}
        transitionDuration={{ enter: 300, exit: 200 }}
      >
        <DrawerList role="navigation" aria-label="Mobile navigation menu">
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <IconButton
              onClick={toggleDrawer(false)}
              aria-label="Close navigation menu"
              sx={{ color: isDarkMode ? "#E0E0E0" : "#333333" }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          {filteredNavLinks.map((link, index) => (
            <ListItem
              button
              key={link.label}
              component={link.to ? RouterLink : "button"}
              to={link.to}
              onClick={() => {
                if (link.onClick) {
                  link.onClick();
                } else {
                  setDrawerOpen(false);
                }
                handleNavClick(link.label);
              }}
              sx={{
                borderRadius: theme => theme.shape.borderRadius,
                mb: 1,
                transition: theme => theme.transitions.create(["background-color", "transform"], {
                  duration: theme.transitions.duration.standard,
                  easing: theme.transitions.easing.easeInOut,
                }),
                "&:hover": {
                  backgroundColor: isDarkMode ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.25)",
                  "& .MuiListItemText-primary": { color: theme => theme.palette.secondary.main },
                  transform: "scale(1.02)",
                },
                "&:focus": {
                  outline: `2px solid ${theme => theme.palette.secondary.main}`,
                  outlineOffset: 2,
                },
              }}
              aria-label={
                link.label === "Account"
                  ? `View account for ${userDisplayName}`
                  : link.label === "Logout"
                  ? "Log out of your account"
                  : `Navigate to ${link.label} page`
              }
              aria-current={link.to && location.pathname === link.to ? "page" : undefined}
              tabIndex={0}
              ref={index === 0 ? firstDrawerItemRef : index === filteredNavLinks.length - 1 ? lastDrawerItemRef : null}
            >
              {link.label === "Account" && user ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Tooltip title={user.email} arrow>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: theme => theme.palette.secondary.main, color: theme => theme.palette.secondary.contrastText, fontSize: "1rem" }}>
                      {userInitial}
                    </Avatar>
                  </Tooltip>
                  <ListItemText
                    primary={userDisplayName}
                    primaryTypographyProps={{ fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
                  />
                </Box>
              ) : (
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{ fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
                />
              )}
            </ListItem>
          ))}
          <ListItem sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <ThemeToggleBox role="group" aria-label="Theme toggle control">
              <Fade in={mode === "light"} timeout={300}>
                <LightModeIcon sx={{ fontSize: 20, color: mode === "light" ? theme => theme.palette.secondary.main : theme => theme.palette.text.secondary }} />
              </Fade>
              <Switch
                checked={mode === "dark"}
                onChange={handleThemeToggle}
                color="default"
                inputProps={{
                  "aria-label": `Current theme is ${mode} mode, switch to ${mode === "light" ? "dark" : "light"} mode`,
                }}
                sx={{
                  "& .MuiSwitch-thumb": { backgroundColor: theme => theme.palette.secondary.main },
                  "& .MuiSwitch-track": { backgroundColor: mode === "dark" ? theme => theme.palette.text.secondary : theme => theme.palette.grey[500] },
                }}
              />
              <Fade in={mode === "dark"} timeout={300}>
                <DarkModeIcon sx={{ fontSize: 20, color: mode === "dark" ? theme => theme.palette.secondary.main : theme => theme.palette.text.secondary }} />
              </Fade>
            </ThemeToggleBox>
          </ListItem>
        </DrawerList>
      </Drawer>

      {/* Error Snackbar */}
      <Snackbar
        open={!!error || !!logoutError}
        autoHideDuration={5000}
        onClose={() => {
          clearError();
          setLogoutError(null);
        }}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity="error"
          onClose={() => {
            clearError();
            setLogoutError(null);
          }}
          sx={{ width: "100%", fontFamily: "'Poppins', sans-serif" }}
        >
          {error || logoutError}
        </Alert>
      </Snackbar>
    </>
  );
}

export default Navbar;