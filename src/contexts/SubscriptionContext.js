import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useThemeContext } from "./ThemeContext";
import { getDb, getAnalyticsService } from "../firebase/config"; // Updated imports
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { logEvent } from "firebase/analytics";
import { Box, CircularProgress, Typography, Fade, Alert, Button } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

export const SubscriptionContext = createContext({
  subscriptionTier: "Bronze",
  upgradeSubscription: async () => {},
  downgradeSubscription: async () => {},
  getSubscriptionBenefits: () => ({ adLevel: "full", features: [] }),
  loading: false,
  error: null,
});

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    console.warn("useSubscription must be used within a SubscriptionProvider");
    return {
      subscriptionTier: "Bronze",
      upgradeSubscription: async () => {},
      downgradeSubscription: async () => {},
      getSubscriptionBenefits: () => ({ adLevel: "full", features: [] }),
      loading: false,
      error: null,
    };
  }
  return context;
}

export function SubscriptionProvider({ children }) {
  const { user, authLoading } = useAuth();
  const { theme: muiTheme } = useThemeContext();
  const [subscriptionTier, setSubscriptionTier] = useState("Bronze");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingAnnouncement, setLoadingAnnouncement] = useState("Loading subscription details..."); // State for loading announcements
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const loggedEvents = useRef({
    subscriptionDataLoaded: false,
    upgradeSuccess: false,
    downgradeSuccess: false,
    manualRetry: false,
  }); // Track logged events per user session
  const liveRegionRef = useRef(null); // Reference to live region for accessibility announcements
  const previousUserId = useRef(null); // Track previous user ID to reset refs
  const db = getDb(); // Updated to use accessor

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Create a live region for accessibility announcements
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

  // Announce loading state changes for accessibility
  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.innerText = loadingAnnouncement;
    }
  }, [loadingAnnouncement]);

  // Reset analytics refs when user changes
  useEffect(() => {
    const currentUserId = user?.uid || null;
    if (previousUserId.current !== currentUserId) {
      console.log("SubscriptionProvider - User changed, resetting analytics refs");
      loggedEvents.current = {
        subscriptionDataLoaded: false,
        upgradeSuccess: false,
        downgradeSuccess: false,
        manualRetry: false,
      };
      previousUserId.current = currentUserId;
    }
  }, [user?.uid]);

  // Retry logic for Firebase operations
  const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        if (analytics) {
          logEvent(analytics, "firestore_operation_retry", {
            userId: user?.uid || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`SubscriptionProvider - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  const getFriendlyErrorMessage = (errorCode, defaultMessage) => {
    switch (errorCode) {
      case "permission-denied":
        return "Permission denied to access subscription data. Defaulting to Bronze tier.";
      case "unavailable":
        return "Firestore is currently unavailable. Defaulting to Bronze tier.";
      case "not-found":
        return "User data not found. Defaulting to Bronze tier.";
      default:
        return defaultMessage;
    }
  };

  const fetchSubscriptionTier = async () => {
    console.log("SubscriptionProvider - Fetching subscription tier...");
    if (!user) {
      setSubscriptionTier("Bronze");
      setLoading(false);
      setLoadingAnnouncement("No user logged in, defaulting to Bronze subscription tier");
      console.log("SubscriptionProvider - No user logged in, defaulting to Bronze tier");
      return;
    }

    setLoading(true);
    setError("");
    setLoadingAnnouncement("Loading subscription details for Bonomo Sports Pools...");
    const docRef = doc(db, "users", user.uid);

    try {
      const docSnap = await withRetry("Fetch Subscription Tier", () => getDoc(docRef));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const fetchedTier = data.subscriptionTier || "Bronze";
        // Validate subscription tier
        const validTiers = ["Bronze", "Silver", "Gold"];
        const newTier = validTiers.includes(fetchedTier) ? fetchedTier : "Bronze";
        if (fetchedTier !== newTier) {
          console.warn("SubscriptionProvider - Invalid subscription tier found:", fetchedTier, "Defaulting to Bronze");
          // Optionally update Firestore with the corrected tier
          await withRetry("Correct Invalid Subscription Tier", () =>
            updateDoc(docRef, { subscriptionTier: "Bronze" })
          );
        }
        setSubscriptionTier(newTier);
        console.log("SubscriptionProvider - Subscription tier fetched:", newTier);
      } else {
        setSubscriptionTier("Bronze");
        console.log("SubscriptionProvider - User doc does not exist, defaulting to Bronze tier");
      }
      setError(null);
      setLoading(false);
      setLoadingAnnouncement("Subscription details loaded for Bonomo Sports Pools");

      // Log subscription data load (only once per user session)
      if (!loggedEvents.current.subscriptionDataLoaded && analytics) {
        logEvent(analytics, "subscription_data_loaded", {
          userId: user.uid,
          subscriptionTier: docSnap.exists() ? docSnap.data().subscriptionTier : "Bronze",
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionProvider - Subscription data load logged to Firebase Analytics");
        loggedEvents.current.subscriptionDataLoaded = true;
      }
    } catch (err) {
      console.error("SubscriptionProvider - Error fetching subscription tier:", err);
      let userFriendlyError = getFriendlyErrorMessage(err.code, "Failed to fetch subscription details. Defaulting to Bronze tier.");
      setError(userFriendlyError);
      setSubscriptionTier("Bronze");
      setLoading(false);
      setLoadingAnnouncement("Failed to load subscription details for Bonomo Sports Pools");
      if (analytics) {
        logEvent(analytics, "subscription_fetch_failed", {
          userId: user?.uid || "anonymous",
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionProvider - Subscription data load failure logged to Firebase Analytics");
      }
    }
  };

  useEffect(() => {
    console.log("SubscriptionProvider - Initializing subscription state...");
    console.log("SubscriptionProvider - Current User:", user);

    fetchSubscriptionTier();
  }, [user?.uid, authLoading, analytics]); // Added analytics to dependencies

  const handleManualRetry = () => {
    setLoading(true);
    setError("");
    setLoadingAnnouncement("Retrying to load subscription details for Bonomo Sports Pools...");
    console.log("SubscriptionProvider - Manual retry triggered for user:", user?.uid);
    fetchSubscriptionTier();
    if (analytics) {
      logEvent(analytics, "subscription_manual_retry", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("SubscriptionProvider - Manual retry logged to Firebase Analytics");
      loggedEvents.current.manualRetry = true;
    }
  };

  async function upgradeSubscription(newTier) {
    if (!user) {
      console.warn("upgradeSubscription - No user logged in");
      throw new Error("You must be logged in to upgrade your subscription.");
    }
    if (!["Bronze", "Silver", "Gold"].includes(newTier)) {
      console.warn("upgradeSubscription - Invalid tier:", newTier);
      throw new Error("Invalid subscription tier.");
    }
    try {
      setError(null);
      const docRef = doc(db, "users", user.uid);
      await withRetry("upgradeSubscription - updateDoc", () =>
        updateDoc(docRef, { subscriptionTier: newTier })
      );
      setSubscriptionTier(newTier);
      console.log("upgradeSubscription - Upgraded to tier:", newTier);

      // Log subscription upgrade (only once per user session)
      if (!loggedEvents.current.upgradeSuccess && analytics) {
        logEvent(analytics, "subscription_upgraded", {
          userId: user.uid,
          newTier,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionProvider - Subscription upgrade logged to Firebase Analytics");
        loggedEvents.current.upgradeSuccess = true;
      }
    } catch (err) {
      console.error("upgradeSubscription - Error:", err);
      const message = getFriendlyErrorMessage(err.code, "Failed to upgrade subscription.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "subscription_upgrade_failed", {
          userId: user?.uid || "anonymous",
          newTier,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionProvider - Subscription upgrade failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }

  async function downgradeSubscription(newTier) {
    if (!user) {
      console.warn("downgradeSubscription - No user logged in");
      throw new Error("You must be logged in to downgrade your subscription.");
    }
    if (!["Bronze", "Silver", "Gold"].includes(newTier)) {
      console.warn("downgradeSubscription - Invalid tier:", newTier);
      throw new Error("Invalid subscription tier.");
    }
    try {
      setError(null);
      const docRef = doc(db, "users", user.uid);
      await withRetry("downgradeSubscription - updateDoc", () =>
        updateDoc(docRef, { subscriptionTier: newTier })
      );
      setSubscriptionTier(newTier);
      console.log("downgradeSubscription - Downgraded to tier:", newTier);

      // Log subscription downgrade (only once per user session)
      if (!loggedEvents.current.downgradeSuccess && analytics) {
        logEvent(analytics, "subscription_downgraded", {
          userId: user.uid,
          newTier,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionProvider - Subscription downgrade logged to Firebase Analytics");
        loggedEvents.current.downgradeSuccess = true;
      }
    } catch (err) {
      console.error("downgradeSubscription - Error:", err);
      const message = getFriendlyErrorMessage(err.code, "Failed to downgrade subscription.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "subscription_downgrade_failed", {
          userId: user?.uid || "anonymous",
          newTier,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("SubscriptionProvider - Subscription downgrade failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }

  function getSubscriptionBenefits() {
    switch (subscriptionTier) {
      case "Gold":
        return {
          adLevel: "none",
          features: ["advancedSettings", "customBranding", "prioritySupport"],
        };
      case "Silver":
        return {
          adLevel: "limited",
          features: ["basicSettings", "limitedBranding"],
        };
      case "Bronze":
      default:
        return {
          adLevel: "full",
          features: [],
        };
    }
  }

  const value = {
    subscriptionTier,
    upgradeSubscription,
    downgradeSubscription,
    getSubscriptionBenefits,
    loading,
    error,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {loading ? (
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
            aria-label="Bonomo Sports Pools is loading subscription details"
          >
            {error ? (
              <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'", mb: 2 }}>
                {error}
                <Button
                  onClick={handleManualRetry}
                  sx={{ ml: 2, fontFamily: "'Poppins', sans-serif'" }}
                  startIcon={<RefreshIcon />}
                  aria-label="Retry loading subscription details"
                >
                  Retry
                </Button>
              </Alert>
            ) : (
              <>
                <CircularProgress sx={{ color: muiTheme.palette.secondary.main, mb: 2 }} />
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
                  Loading subscription details...
                </Typography>
              </>
            )}
          </Box>
        </Fade>
      ) : (
        children
      )}
    </SubscriptionContext.Provider>
  );
}