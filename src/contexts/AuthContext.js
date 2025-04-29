import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { ThemeContext } from "./ThemeContext";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  // Removed signInWithRedirect, getRedirectResult
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
} from "firebase/firestore";
import { getAuthService, getDb, getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";
import { Box, Typography, CircularProgress, Fade, Alert } from "@mui/material";

// Create and export the context with a defined shape
export const AuthContext = createContext({
  user: null,
  authLoading: true,
  error: null,
  signup: async () => {},
  login: async () => {},
  logout: async () => {},
  loginWithGoogle: async () => {},
  resetPassword: async () => {},
  reauthenticate: async () => {},
  clearError: () => {},
  addOfflineUser: async () => {},
});

// Custom hook to access AuthContext
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Provider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnnouncement, setLoadingAnnouncement] = useState(
    "Loading authentication state..."
  );
  const { theme: muiTheme } = useContext(ThemeContext);

  // Track analytics events so they're not duplicated
  const loggedEvents = useRef({
    userLogin: false,
    signupSuccess: false,
    loginSuccess: false,
    logoutSuccess: false,
    googleLoginSuccess: false,
    passwordResetSuccess: false,
    reauthenticateSuccess: false,
    addOfflineUserSuccess: false,
  });

  // Live region for A11y announcements
  const liveRegionRef = useRef(null);

  const auth = getAuthService();
  const db = getDb();

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Helper function to log events
  const logAnalyticsEvent = useCallback(
    (eventName, data, logKey = null) => {
      if (!analytics) return;
      if (logKey && loggedEvents.current[logKey]) return; // Avoid duplicates
      logEvent(analytics, eventName, data);
      console.log(`AuthProvider - Logged event: ${eventName}`, data);
      if (logKey) loggedEvents.current[logKey] = true;
    },
    [analytics]
  );

  // Create a live region for A11y announcements
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

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Announce loading states
  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.innerText = loadingAnnouncement;
    }
  }, [loadingAnnouncement]);

  // Retry logic for Firebase calls
  const withRetry = useCallback(
    async (operationName, callback, maxRetries = 3, retryDelayBase = 1000) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await callback();
        } catch (retryError) {
          logAnalyticsEvent("firestore_operation_retry", {
            userId: user?.uid || "anonymous",
            operationName,
            attempt,
            error_message: retryError.message,
            timestamp: new Date().toISOString(),
          });
          if (attempt === maxRetries) {
            throw retryError;
          }
          const delay = Math.pow(2, attempt - 1) * retryDelayBase;
          console.log(
            `${operationName} - Attempt ${attempt} failed: ${retryError.message}. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    },
    [logAnalyticsEvent, user?.uid]
  );

  // Subscribe to onAuthStateChanged
  useEffect(() => {
    console.log("AuthProvider - Initializing auth state...");
    const startTime = Date.now();
    let authTimeout;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (authUser) => {
        const duration = Date.now() - startTime;
        console.log(
          "AuthProvider - onAuthStateChanged completed in",
          duration,
          "ms"
        );
        clearTimeout(authTimeout);

        if (authUser) {
          try {
            // Refresh token
            await authUser.getIdToken(true);
            setUser(authUser);
            console.log("AuthProvider - Auth State Changed:", authUser);

            // Log user login once
            logAnalyticsEvent(
              "user_login",
              {
                userId: authUser.uid,
                timestamp: new Date().toISOString(),
                auth_duration_ms: duration,
              },
              "userLogin"
            );
          } catch (tokenError) {
            console.error("AuthProvider - Token refresh error:", tokenError);
            setUser(null);
            setError("Failed to verify authentication. Please log in again.");
            logAnalyticsEvent("token_refresh_failed", {
              userId: authUser.uid,
              error_message: tokenError.message,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          // Not signed in
          setUser(null);
          // Reset event logs
          Object.keys(loggedEvents.current).forEach(
            (key) => (loggedEvents.current[key] = false)
          );
        }
        setAuthLoading(false);
        setLoadingAnnouncement("Authentication state loaded");
      },
      (authError) => {
        const duration = Date.now() - startTime;
        console.error("AuthProvider - Auth State Error:", authError);
        setError(
          "Failed to initialize authentication. Please try refreshing the page."
        );
        setUser(null);
        setAuthLoading(false);
        setLoadingAnnouncement("Authentication state failed to load");
        logAnalyticsEvent("auth_state_error", {
          userId: user?.uid || "anonymous",
          error_message: authError.message || "Unknown error",
          timestamp: new Date().toISOString(),
          auth_duration_ms: duration,
        });
      }
    );

    // Timeout for auth init
    authTimeout = setTimeout(() => {
      if (authLoading) {
        const duration = Date.now() - startTime;
        console.warn(
          "AuthProvider - onAuthStateChanged timed out after",
          duration,
          "ms"
        );
        setError("Authentication timed out. Please try refreshing the page.");
        setUser(null);
        setAuthLoading(false);
        setLoadingAnnouncement("Authentication state timed out");
        logAnalyticsEvent("auth_state_timeout", {
          userId: user?.uid || "anonymous",
          timeout_duration_ms: duration,
          timestamp: new Date().toISOString(),
        });
      }
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(authTimeout);
    };
  }, [auth, authLoading, user?.uid, logAnalyticsEvent]);

  // No more getRedirectResult or signInWithRedirect used

  // Friendly error messages
  const getFriendlyErrorMessage = (errorCode, defaultMessage) => {
    switch (errorCode) {
      case "auth/invalid-email":
        return "The email address is not valid.";
      case "auth/user-not-found":
        return "No account found with this email.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/weak-password":
        return "Password must be at least 6 characters long.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      case "auth/popup-blocked":
        return "Sign-in popup was blocked. Please allow popups and try again.";
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed. Please try again.";
      case "auth/network-request-failed":
        return "Network error. Please check your internet connection and try again.";
      case "firestore/unavailable":
        return "Database unavailable. Please try again later.";
      case "firestore/permission-denied":
        return "You do not have permission to perform this action.";
      case "firestore/not-found":
        return "The requested resource was not found.";
      default:
        return defaultMessage;
    }
  };

  // Signup
  const signup = useCallback(
    async (email, password, displayName = "") => {
      try {
        setError(null);
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const newUser = userCredential.user;

        const userRef = doc(db, "users", newUser.uid);
        await withRetry("signup - setDoc", () =>
          setDoc(
            userRef,
            {
              email: newUser.email,
              displayName: displayName || newUser.email.split("@")[0],
              subscriptionTier: "Bronze",
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          )
        );

        console.log("User signed up and Firestore doc created:", newUser.uid);

        logAnalyticsEvent(
          "signup_success",
          {
            userId: newUser.uid,
            email: newUser.email,
            timestamp: new Date().toISOString(),
          },
          "signupSuccess"
        );

        return newUser;
      } catch (signupError) {
        console.error("Signup Error:", signupError);
        const message = getFriendlyErrorMessage(
          signupError.code,
          "Failed to sign up."
        );
        setError(message);
        logAnalyticsEvent("signup_failure", {
          userId: user?.uid || "anonymous",
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        throw new Error(message);
      }
    },
    [auth, db, user?.uid, withRetry, logAnalyticsEvent]
  );

  // Login
  const login = useCallback(
    async (email, password) => {
      try {
        setError(null);
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        const loggedInUser = userCredential.user;

        const userRef = doc(db, "users", loggedInUser.uid);
        await withRetry("login - setDoc", () =>
          setDoc(
            userRef,
            {
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          )
        );

        console.log("User logged in:", loggedInUser.uid);

        logAnalyticsEvent(
          "login_success",
          {
            userId: loggedInUser.uid,
            email,
            timestamp: new Date().toISOString(),
          },
          "loginSuccess"
        );

        return loggedInUser;
      } catch (loginError) {
        console.error("Login Error:", loginError);
        const message = getFriendlyErrorMessage(
          loginError.code,
          "Failed to log in."
        );
        setError(message);
        logAnalyticsEvent("login_failure", {
          userId: user?.uid || "anonymous",
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        throw new Error(message);
      }
    },
    [auth, db, user?.uid, withRetry, logAnalyticsEvent]
  );

  // Logout
  const logout = useCallback(async () => {
    try {
      setError(null);
      await signOut(auth);
      setUser(null);
      console.log("User logged out");

      logAnalyticsEvent(
        "logout_success",
        {
          userId: user?.uid || "anonymous",
          timestamp: new Date().toISOString(),
        },
        "logoutSuccess"
      );
    } catch (logoutError) {
      console.error("Logout Error:", logoutError);
      const message = getFriendlyErrorMessage(
        logoutError.code,
        "Failed to log out."
      );
      setError(message);
      logAnalyticsEvent("logout_failure", {
        userId: user?.uid || "anonymous",
        error_message: message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(message);
    }
  }, [auth, user?.uid, logAnalyticsEvent]);

  // Login with Google - Always uses Popup now
  const loginWithGoogle = useCallback(async () => {
    const googleProvider = new GoogleAuthProvider();
    try {
      setError(null);

      // Always popup
      const result = await signInWithPopup(auth, googleProvider);
      const newUser = result.user;
      const userRef = doc(db, "users", newUser.uid);

      const snapshot = await withRetry("loginWithGoogle - getDoc", () =>
        getDoc(userRef)
      );

      if (!snapshot.exists()) {
        await withRetry("loginWithGoogle - setDoc (new user)", () =>
          setDoc(
            userRef,
            {
              email: newUser.email,
              displayName: newUser.displayName || newUser.email.split("@")[0],
              subscriptionTier: "Bronze",
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          )
        );
        console.log("Google Sign-In - New user doc created:", newUser.uid);
      } else {
        await withRetry("loginWithGoogle - setDoc (existing user)", () =>
          setDoc(
            userRef,
            {
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          )
        );
        console.log("Google Sign-In - User logged in:", newUser.uid);
      }

      logAnalyticsEvent(
        "google_login_success",
        {
          userId: newUser.uid,
          email: newUser.email,
          method: "popup",
          timestamp: new Date().toISOString(),
        },
        "googleLoginSuccess"
      );

      return newUser;
    } catch (googleError) {
      // Specifically handle the user closing the popup
      if (googleError.code === "auth/popup-closed-by-user") {
        console.log(
          "AuthContext - User closed Google sign-in popup before completing."
        );
        // No alert, no error. Return null
        return null;
      }

      // For other errors
      console.error("Google Sign-In Error:", googleError);
      const friendlyMessage = getFriendlyErrorMessage(
        googleError.code,
        "Google sign-in failed."
      );

      if (googleError.code === "auth/popup-blocked") {
        alert("Please enable pop-ups in your browser and try again.");
      } else {
        alert(friendlyMessage);
      }

      setError(friendlyMessage);
      logAnalyticsEvent("google_login_failure", {
        userId: user?.uid || "anonymous",
        error_message: friendlyMessage,
        error_code: googleError.code,
        method: "popup",
        timestamp: new Date().toISOString(),
      });
      throw new Error(friendlyMessage);
    }
  }, [auth, db, user?.uid, withRetry, logAnalyticsEvent]);

  // Reset password
  const resetPassword = useCallback(
    async (email) => {
      try {
        setError(null);
        await sendPasswordResetEmail(auth, email);
        console.log("Password reset email sent to:", email);

        logAnalyticsEvent(
          "password_reset_success",
          {
            email,
            timestamp: new Date().toISOString(),
          },
          "passwordResetSuccess"
        );

        return true;
      } catch (resetError) {
        console.error("Password Reset Error:", resetError);
        const message = getFriendlyErrorMessage(
          resetError.code,
          "Failed to send password reset email."
        );
        setError(message);
        logAnalyticsEvent("password_reset_failure", {
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        throw new Error(message);
      }
    },
    [auth, logAnalyticsEvent]
  );

  // Reauthenticate
  const reauthenticate = useCallback(
    async (email, password) => {
      try {
        setError(null);
        if (!auth.currentUser) {
          const message = "No authenticated user found. Please log in again.";
          setError(message);
          throw new Error(message);
        }
        const credential = EmailAuthProvider.credential(email, password);
        await reauthenticateWithCredential(auth.currentUser, credential);
        console.log("User reauthenticated:", auth.currentUser.uid);

        logAnalyticsEvent(
          "reauthenticate_success",
          {
            userId: auth.currentUser.uid,
            email,
            timestamp: new Date().toISOString(),
          },
          "reauthenticateSuccess"
        );

        return true;
      } catch (reauthError) {
        console.error("Reauthentication Error:", reauthError);
        const message = getFriendlyErrorMessage(
          reauthError.code,
          "Failed to reauthenticate."
        );
        setError(message);
        logAnalyticsEvent("reauthenticate_failure", {
          userId: user?.uid || "anonymous",
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        throw new Error(message);
      }
    },
    [auth, user?.uid, logAnalyticsEvent]
  );

  // Add an offline user to a given pool
  const addOfflineUser = useCallback(
    async (poolId, offlineUserData) => {
      try {
        setError(null);
        const offlineUsersRef = collection(db, "pools", poolId, "offlineUsers");
        const newOfflineUser = await withRetry("addOfflineUser - addDoc", () =>
          addDoc(offlineUsersRef, {
            ...offlineUserData,
            createdAt: serverTimestamp(),
            addedBy: user ? user.uid : "anonymous",
          })
        );

        console.log(
          "Offline user added to pool:",
          poolId,
          "ID:",
          newOfflineUser.id
        );

        logAnalyticsEvent(
          "add_offline_user_success",
          {
            poolId,
            offlineUserId: newOfflineUser.id,
            userId: user?.uid || "anonymous",
            timestamp: new Date().toISOString(),
          },
          "addOfflineUserSuccess"
        );

        return newOfflineUser.id;
      } catch (offlineError) {
        console.error("Add Offline User Error:", offlineError);
        const message = getFriendlyErrorMessage(
          offlineError.code,
          "Failed to add offline user to the pool."
        );
        setError(message);
        logAnalyticsEvent("add_offline_user_failure", {
          poolId,
          userId: user?.uid || "anonymous",
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        throw new Error(message);
      }
    },
    [db, user?.uid, withRetry, logAnalyticsEvent]
  );

  // Clears error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Memoize context value
  const value = useMemo(
    () => ({
      user,
      authLoading,
      error,
      signup,
      login,
      logout,
      loginWithGoogle,
      resetPassword,
      reauthenticate,
      clearError,
      addOfflineUser,
    }),
    [
      user,
      authLoading,
      error,
      signup,
      login,
      logout,
      loginWithGoogle,
      resetPassword,
      reauthenticate,
      clearError,
      addOfflineUser,
    ]
  );

  // If still loading
  return (
    <AuthContext.Provider value={value}>
      {authLoading ? (
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
            aria-label="Bonomo Sports Pools is loading authentication state"
          >
            {error && (
              <Alert
                severity="error"
                sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}
              >
                {error}
              </Alert>
            )}
            <CircularProgress
              sx={{ color: muiTheme.palette.secondary.main, mb: 2 }}
            />
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
              Loading authentication state...
            </Typography>
          </Box>
        </Fade>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
