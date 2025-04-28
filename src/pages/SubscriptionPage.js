import React, { useState, useEffect, useRef } from "react";
import { useSubscription } from "../contexts/SubscriptionContext";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getAnalyticsService } from "../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";

// MUI imports
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Stack,
  Grid,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";

/**
 * This page lets users upgrade their subscription tier.
 * The local 'tiers' array defines each plan's name, description, and color.
 */
function SubscriptionPage() {
  const { subscriptionTier, upgradeSubscription } = useSubscription();
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPageView = useRef(false); // Track if subscription_page_viewed has been logged
  const hasLoggedUpgrade = useRef({}); // Track subscription_upgraded per tier

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "subscription_page_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("SubscriptionPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, analytics]); // Added analytics to dependencies

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  // Reset analytics logging flags when user changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedUpgrade.current = {};
  }, [user?.uid]);

  // Retry logic for Firebase operations
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
          console.log(`SubscriptionPage - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase; // Exponential backoff: 1s, 2s, 4s
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const handleUpgrade = async (tier) => {
    if (!user) {
      setError("You must be logged in to upgrade your subscription.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await withRetry(`Upgrade to ${tier}`, () => upgradeSubscription(tier));
      setSuccessMessage(`Upgraded to ${tier} successfully!`);
      // Log subscription upgrade (only once per tier)
      if (!hasLoggedUpgrade.current[tier] && analytics) {
        logEvent(analytics, "subscription_upgraded", {
          userId: user.uid,
          newTier: tier,
          previousTier: subscriptionTier,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionPage - Subscription upgrade logged to Firebase Analytics");
        hasLoggedUpgrade.current[tier] = true;
      }
    } catch (err) {
      console.error("SubscriptionPage - Error upgrading subscription:", err);
      let userFriendlyError = "Failed to upgrade subscription.";
      if (err.code === "permission-denied") {
        userFriendlyError = "You do not have permission to upgrade your subscription.";
      } else if (err.code === "unavailable") {
        userFriendlyError = "Service is currently unavailable. Please try again later.";
      } else {
        userFriendlyError = err.message || "An unexpected error occurred.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "subscription_upgrade_failed", {
          userId: user.uid,
          newTier: tier,
          previousTier: subscriptionTier,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionPage - Subscription upgrade failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  // Example subscription tiers
  const tiers = [
    { name: "Bronze", description: "Free with ads", color: "warning" },
    { name: "Silver", description: "Fewer ads, advanced pools", color: "info" },
    { name: "Gold", description: "No ads, unlimited pools", color: "success" },
  ];

  // Show loading UI while auth state is resolving
  if (authLoading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, textAlign: "center" }}>
        <Typography
          variant="body1"
          sx={{
            mb: 2,
            fontFamily: "'Poppins', sans-serif'",
            color: "text.secondary",
          }}
        >
          Loading authentication state...
        </Typography>
        <CircularProgress sx={{ color: "primary.main" }} aria-label="Loading authentication state" />
      </Container>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return null; // Handled by useEffect redirect
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography
        variant="h4"
        sx={{ mb: 3, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}
      >
        Subscription Management
      </Typography>

      <Typography variant="body1" sx={{ mb: 4, fontFamily: "'Poppins', sans-serif'" }}>
        Current tier: <strong>{subscriptionTier}</strong>
      </Typography>

      {/* Error and Success Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {error}
        </Alert>
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

      {/* Subscription Tier Cards */}
      <Grid container spacing={3}>
        {tiers.map((tier) => (
          <Grid item key={tier.name} xs={12} sm={4}>
            <Card
              variant="outlined"
              sx={{
                transition: "background-color 0.2s ease",
                "&:hover": {
                  backgroundColor: "action.hover",
                },
              }}
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === "Enter" && subscriptionTier !== tier.name) {
                  handleUpgrade(tier.name);
                }
              }}
              role="button"
              aria-label={`Subscription tier: ${tier.name}`}
            >
              <CardContent>
                <Typography
                  variant="h5"
                  sx={{ fontWeight: "bold", mb: 1, fontFamily: "'Montserrat', sans-serif'" }}
                  color={tier.color}
                >
                  {tier.name}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1, fontFamily: "'Poppins', sans-serif'" }}>
                  {tier.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  variant="contained"
                  color={tier.color === "warning" ? "warning" : tier.color}
                  disabled={subscriptionTier === tier.name || loading}
                  onClick={() => handleUpgrade(tier.name)}
                  sx={{ textTransform: "none", fontWeight: 600, fontFamily: "'Poppins', sans-serif'" }}
                  aria-label={subscriptionTier === tier.name ? `Current tier: ${tier.name}` : `Upgrade to ${tier.name}`}
                >
                  {subscriptionTier === tier.name ? "Current Tier" : loading ? "Upgrading..." : "Upgrade"}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Alternate quick selection row (optional) */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
          Quick Selection:
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            onClick={() => handleUpgrade("Bronze")}
            disabled={subscriptionTier === "Bronze" || loading}
            sx={{
              color: (theme) => (subscriptionTier === "Bronze" ? theme.palette.text.disabled : theme.palette.warning.main),
              borderColor: (theme) => theme.palette.warning.main,
              "&:hover": {
                borderColor: (theme) => theme.palette.warning.dark,
              },
              textTransform: "none",
              fontWeight: 600,
              fontFamily: "'Poppins', sans-serif'",
            }}
            aria-label={subscriptionTier === "Bronze" ? "Current tier: Bronze" : "Switch to Bronze"}
          >
            Switch to Bronze
          </Button>
          <Button
            variant="outlined"
            onClick={() => handleUpgrade("Silver")}
            disabled={subscriptionTier === "Silver" || loading}
            sx={{
              color: (theme) => (subscriptionTier === "Silver" ? theme.palette.text.disabled : theme.palette.info.main),
              borderColor: (theme) => theme.palette.info.main,
              "&:hover": {
                borderColor: (theme) => theme.palette.info.dark,
              },
              textTransform: "none",
              fontWeight: 600,
              fontFamily: "'Poppins', sans-serif'",
            }}
            aria-label={subscriptionTier === "Silver" ? "Current tier: Silver" : "Switch to Silver"}
          >
            Switch to Silver
          </Button>
          <Button
            variant="outlined"
            onClick={() => handleUpgrade("Gold")}
            disabled={subscriptionTier === "Gold" || loading}
            sx={{
              color: (theme) => (subscriptionTier === "Gold" ? theme.palette.text.disabled : theme.palette.success.main),
              borderColor: (theme) => theme.palette.success.main,
              "&:hover": {
                borderColor: (theme) => theme.palette.success.dark,
              },
              textTransform: "none",
              fontWeight: 600,
              fontFamily: "'Poppins', sans-serif'",
            }}
            aria-label={subscriptionTier === "Gold" ? "Current tier: Gold" : "Switch to Gold"}
          >
            Switch to Gold
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}

export default SubscriptionPage;