import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, CssBaseline, Container, Typography, Alert, CircularProgress, Fade, Button } from "@mui/material";
import { AuthContext } from "./contexts/AuthContext";
import { SubscriptionContext, SubscriptionProvider } from "./contexts/SubscriptionContext";
import { ThemeContext, ThemeProvider } from "./contexts/ThemeContext";
import { getAnalyticsService } from "./firebase/config";
import { logEvent } from "firebase/analytics";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import AdBanner from "./components/common/AdBanner";
import AppRoutes from "./routes/AppRoutes";

// Error Boundary Component
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    const analytics = getAnalyticsService();
    if (analytics) {
      logEvent(analytics, "error_boundary_caught", {
        error_message: error.message,
        error_stack: error.stack,
        component_stack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Error logged to Firebase Analytics");
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
            Something went wrong: {this.state.error?.message || "Unknown error"}
          </Alert>
          <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Please try refreshing the page, or contact{" "}
            <Box
              component="a"
              href="mailto:support@bonomosportspools.com"
              sx={{ color: (theme) => theme.palette.primary.main, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
              aria-label="Contact support via email"
            >
              support@bonomosportspools.com
            </Box>{" "}
            for assistance.
          </Typography>
        </Box>
      );
    }
    return this.props.children;
  }
}

/**
 * Main application component that handles navigation, context, and analytics.
 * Manages loading states, error handling, and ad banner display based on subscription tier.
 * @returns {JSX.Element} The rendered main application layout.
 */
function MainApp() {
  const { theme: muiTheme } = useContext(ThemeContext);
  const { user, authLoading } = useContext(AuthContext);
  const { subscriptionTier, loading: subLoading } = useContext(SubscriptionContext);
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeoutReached, setTimeoutReached] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const maxRetries = 3;
  const hasLoggedAppLoad = useRef(false);
  const hasLoggedAdBanner = useRef(false);
  const hasLoggedRetry = useRef(false);
  const hasLoggedTimeout = useRef(false);
  const loadStartTime = useRef(Date.now());

  // Initialize Firebase Analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Global error handling for uncaught errors
  useEffect(() => {
    const handleError = (event) => {
      console.error("Global Error:", event.error);
      const message = "An unexpected error occurred. Please try refreshing the page.";
      setError(message);

      if (analytics) {
        logEvent(analytics, "global_error", {
          userId: user?.uid || "anonymous",
          error_message: event.error?.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("App - Global error logged to Firebase Analytics");
      }
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, [user, analytics]);

  // Log app load event (only once per session)
  useEffect(() => {
    if (!isLoading && analytics && !hasLoggedAppLoad.current) {
      logEvent(analytics, "app_loaded", {
        userId: user?.uid || "anonymous",
        subscriptionTier,
        load_duration: Date.now() - loadStartTime.current,
        timestamp: new Date().toISOString(),
      });
      console.log("App - App load logged to Firebase Analytics");
      hasLoggedAppLoad.current = true;
    }
  }, [isLoading, user?.uid, subscriptionTier, analytics]);

  // Reset analytics logging flags when user changes
  useEffect(() => {
    hasLoggedAppLoad.current = false;
    hasLoggedAdBanner.current = false;
    hasLoggedRetry.current = false;
    hasLoggedTimeout.current = false;
    setRetryCount(0);
    loadStartTime.current = Date.now();
  }, [user?.uid]);

  // Handle loading state with timeout and automatic retry
  useEffect(() => {
    if (!authLoading && !subLoading) {
      setIsLoading(false);
      setRetryCount(0);
    } else {
      if (authLoading) console.log("App - Waiting for auth context to load...");
      if (subLoading) console.log("App - Waiting for subscription context to load...");
    }

    const timeoutDuration = 10000;
    const timeout = setTimeout(() => {
      if (isLoading) {
        setTimeoutReached(true);
        const failedContext = authLoading && subLoading ? "both auth and subscription" : authLoading ? "auth" : "subscription";
        const loadDuration = Date.now() - loadStartTime.current;
        const errorMessage = `Loading pool data timed out after ${timeoutDuration / 1000} seconds (${failedContext} context). Load duration: ${loadDuration / 1000} seconds. Retrying...`;
        setError(errorMessage);

        if (analytics && !hasLoggedTimeout.current) {
          logEvent(analytics, "loading_timeout", {
            userId: user?.uid || "anonymous",
            timeout_duration: timeoutDuration,
            load_duration: loadDuration,
            failed_context: failedContext,
            retry_count: retryCount,
            timestamp: new Date().toISOString(),
          });
          console.log("App - Loading timeout logged to Firebase Analytics");
          hasLoggedTimeout.current = true;
        }

        if (retryCount < maxRetries) {
          setRetryCount((prev) => {
            const newCount = prev + 1;
            console.log(`App - Automatic retry attempt ${newCount} of ${maxRetries}`);
            if (analytics) {
              logEvent(analytics, "auto_retry_loading", {
                userId: user?.uid || "anonymous",
                retry_count: newCount,
                max_retries: maxRetries,
                timestamp: new Date().toISOString(),
              });
              console.log("App - Auto retry loading logged to Firebase Analytics");
            }
            setIsLoading(true);
            setError(null);
            setTimeoutReached(false);
            loadStartTime.current = Date.now();
            window.location.reload();
            return newCount;
          });
        } else {
          setIsLoading(false);
          setError(
            "Maximum retry attempts reached. Please check your network connection or contact support at support@bonomosportspools.com."
          );
          if (analytics) {
            logEvent(analytics, "retry_failed", {
              userId: user?.uid || "anonymous",
              retry_count: retryCount,
              max_retries: maxRetries,
              timestamp: new Date().toISOString(),
            });
            console.log("App - Retry failed (max attempts reached) logged to Firebase Analytics");
          }
        }
      }
    }, timeoutDuration);

    return () => clearTimeout(timeout);
  }, [authLoading, subLoading, isLoading, user?.uid, retryCount, analytics]);

  /**
   * Handles manual retry of loading contexts when a timeout occurs.
   * @returns {void}
   */
  const handleRetry = useCallback(() => {
    if (retryCount >= maxRetries) {
      setError(
        "Maximum retry attempts reached. Please check your network connection or contact support at support@bonomosportspools.com."
      );
      if (analytics) {
        logEvent(analytics, "retry_failed", {
          userId: user?.uid || "anonymous",
          retry_count: retryCount,
          max_retries: maxRetries,
          timestamp: new Date().toISOString(),
        });
        console.log("App - Retry failed (max attempts reached) logged to Firebase Analytics");
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setTimeoutReached(false);
    const newRetryCount = retryCount + 1;
    setRetryCount(newRetryCount);
    loadStartTime.current = Date.now();

    if (analytics && !hasLoggedRetry.current) {
      logEvent(analytics, "retry_loading", {
        userId: user?.uid || "anonymous",
        retry_count: newRetryCount,
        timestamp: new Date().toISOString(),
      });
      console.log("App - Retry loading logged to Firebase Analytics");
      hasLoggedRetry.current = true;
    }

    window.location.reload();
  }, [retryCount, user?.uid, analytics]);

  // Log ad banner display (only once per session)
  const showAds = user && subscriptionTier === "Bronze";
  useEffect(() => {
    if (showAds && analytics && !hasLoggedAdBanner.current) {
      logEvent(analytics, "ad_banner_displayed", {
        userId: user?.uid || "anonymous",
        subscriptionTier,
        timestamp: new Date().toISOString(),
      });
      console.log("App - Ad banner display logged to Firebase Analytics");
      hasLoggedAdBanner.current = true;
    }
  }, [showAds, subscriptionTier, user?.uid, analytics]);

  // Render loading state
  if (isLoading) {
    return (
      <Fade in timeout={1000}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            bgcolor: muiTheme.palette.background.default,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading the application data"
        >
          {error ? (
            <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'", mb: 2 }} role="alert" aria-live="assertive">
              {error}
              {retryCount < maxRetries ? (
                <Button
                  onClick={handleRetry}
                  sx={{ ml: 2, fontFamily: "'Poppins', sans-serif'" }}
                  aria-label="Retry loading application data"
                >
                  Retry
                </Button>
              ) : (
                <Typography
                  variant="body2"
                  sx={{
                    mt: 1,
                    fontFamily: "'Poppins', sans-serif'",
                    color: muiTheme.palette.text.secondary,
                  }}
                >
                  Need help?{" "}
                  <Box
                    component="a"
                    href="mailto:support@bonomosportspools.com"
                    sx={{
                      color: muiTheme.palette.primary.main,
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" },
                    }}
                    aria-label="Contact support via email"
                  >
                    Contact Support
                  </Box>
                </Typography>
              )}
            </Alert>
          ) : (
            <>
              <CircularProgress sx={{ color: muiTheme.palette.secondary.main, mb: 2 }} aria-label="Loading application data" />
              <Typography
                variant="h6"
                sx={{
                  fontFamily: "'Montserrat', sans-serif'",
                  fontWeight: 700,
                  color: muiTheme.palette.text.primary,
                }}
              >
                Bonomo Sports Pools
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  fontFamily: "'Poppins', sans-serif'",
                  color: muiTheme.palette.text.secondary,
                }}
              >
                {timeoutReached ? "Loading timed out. Retrying..." : "Loading application..."}
              </Typography>
            </>
          )}
        </Box>
      </Fade>
    );
  }

  // Render main application layout
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        bgcolor: muiTheme.palette.background.default,
      }}
      role="application"
      aria-label="Bonomo Sports Pools Application"
    >
      <CssBaseline />
      <header role="banner">
        <Navbar />
      </header>

      <Box
        component="main"
        role="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {error ? (
          <Container maxWidth="lg" sx={{ py: 4 }}>
            <Alert
              severity="error"
              sx={{ mb: 2, borderRadius: 2, fontFamily: "'Poppins', sans-serif'" }}
              role="alert"
              aria-live="assertive"
            >
              {error}
            </Alert>
            <Typography
              variant="body1"
              sx={{
                textAlign: "center",
                fontFamily: "'Poppins', sans-serif'",
                color: muiTheme.palette.text.secondary,
              }}
            >
              If the issue persists, please contact support at{" "}
              <Box
                component="a"
                href="mailto:support@bonomosportspools.com"
                sx={{
                  color: muiTheme.palette.primary.main,
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
                aria-label="Contact support via email"
              >
                support@bonomosportspools.com
              </Box>
              .
            </Typography>
          </Container>
        ) : (
          <Container maxWidth="lg" sx={{ flex: 1, py: 2 }}>
            <AppRoutes />
            {showAds && (
              <Box sx={{ mt: 2 }} role="complementary" aria-label="Advertisement">
                <AdBanner />
              </Box>
            )}
          </Container>
        )}
      </Box>

      <footer role="contentinfo">
        <Footer />
      </footer>
    </Box>
  );
}

/**
 * Root component that renders the MainApp with necessary providers.
 * @returns {JSX.Element} The rendered application.
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SubscriptionProvider>
          <MainApp />
        </SubscriptionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;