import React, { createContext, useState, useEffect, useContext, useMemo, useRef, useCallback } from "react";
import { ThemeContext } from "./ThemeContext";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
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
  const [loadingAnnouncement, setLoadingAnnouncement] = useState("Loading authentication state...");
  const { theme: muiTheme } = useContext(ThemeContext);
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
  const liveRegionRef = useRef(null);
  const auth = getAuthService();
  const db = getDb();

  // ✅ Define isMobile at the top-level of AuthProvider:
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Log version to confirm file update
  console.log("AuthContext.js - Version: 2025-04-29-v4 - isMobile fix applied");

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

  // Clear error after a delay
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Announce loading state changes for accessibility
  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.innerText = loadingAnnouncement;
    }
  }, [loadingAnnouncement]);

  // Retry logic for Firebase operations
  const withRetry = useCallback(async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
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
          console.log(`AuthProvider - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [analytics, user?.uid]);

  // Initialize auth state with Firebase
  useEffect(() => {
    console.log("AuthProvider - Initializing auth state...");
    const startTime = Date.now();
    let authTimeout;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (authUser) => {
        const duration = Date.now() - startTime;
        console.log("AuthProvider - onAuthStateChanged completed in", duration, "ms");
        clearTimeout(authTimeout);

        if (authUser) {
          try {
            await authUser.getIdToken(true);
            setUser(authUser);
            console.log("AuthProvider - Auth State Changed:", authUser);
            if (!loggedEvents.current.userLogin && analytics) {
              logEvent(analytics, "user_login", {
                userId: authUser.uid,
                timestamp: new Date().toISOString(),
                auth_duration_ms: duration,
              });
              console.log("AuthProvider - User login logged to Firebase Analytics");
              loggedEvents.current.userLogin = true;
            }
          } catch (error) {
            console.error("AuthProvider - Token refresh error:", error);
            setUser(null);
            setError("Failed to verify authentication. Please log in again.");
            if (analytics) {
              logEvent(analytics, "token_refresh_failed", {
                userId: authUser?.uid || "anonymous",
                error_message: error.message,
                timestamp: new Date().toISOString(),
              });
              console.log("AuthProvider - Token refresh failure logged to Firebase Analytics");
            }
          }
        } else {
          setUser(null);
          loggedEvents.current = {
            userLogin: false,
            signupSuccess: false,
            loginSuccess: false,
            logoutSuccess: false,
            googleLoginSuccess: false,
            passwordResetSuccess: false,
            reauthenticateSuccess: false,
            addOfflineUserSuccess: false,
          };
        }
        setAuthLoading(false);
        setLoadingAnnouncement("Authentication state loaded");
      },
      (error) => {
        const duration = Date.now() - startTime;
        console.error("AuthProvider - Auth State Error:", error);
        setError("Failed to initialize authentication. Please try refreshing the page.");
        setUser(null);
        setAuthLoading(false);
        setLoadingAnnouncement("Authentication state failed to load");
        if (analytics) {
          logEvent(analytics, "auth_state_error", {
            userId: user?.uid || "anonymous",
            error_message: error.message || "Unknown error",
            timestamp: new Date().toISOString(),
            auth_duration_ms: duration,
          });
          console.log("AuthProvider - Auth state error logged to Firebase Analytics");
        }
      }
    );

    authTimeout = setTimeout(() => {
      if (authLoading) {
        const duration = Date.now() - startTime;
        console.warn("AuthProvider - onAuthStateChanged timed out after", duration, "ms");
        setError("Authentication timed out. Please try refreshing the page.");
        setUser(null);
        setAuthLoading(false);
        setLoadingAnnouncement("Authentication state timed out");
        if (analytics) {
          logEvent(analytics, "auth_state_timeout", {
            userId: user?.uid || "anonymous",
            timeout_duration_ms: duration,
            timestamp: new Date().toISOString(),
          });
          console.log("AuthProvider - Auth state timeout logged to Firebase Analytics");
        }
      }
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(authTimeout);
    };
  }, [analytics, auth, authLoading, user?.uid]);

  // Handle redirect results for Google sign-in
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
          const newUser = result.user;
          const userRef = doc(db, "users", newUser.uid);
          const snapshot = await withRetry("loginWithGoogleRedirect - getDoc", () => getDoc(userRef));

          if (!snapshot.exists()) {
            await withRetry("loginWithGoogleRedirect - setDoc (new user)", () =>
              setDoc(userRef, {
                email: newUser.email,
                displayName: newUser.displayName || newUser.email.split("@")[0],
                subscriptionTier: "Bronze",
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              }, { merge: true })
            );
            console.log("Google Sign-In Redirect - New user doc created:", newUser.uid);
          } else {
            await withRetry("loginWithGoogleRedirect - setDoc (existing user)", () =>
              setDoc(userRef, {
                lastLoginAt: serverTimestamp(),
              }, { merge: true })
            );
            console.log("Google Sign-In Redirect - User logged in:", newUser.uid);
          }

          if (!loggedEvents.current.googleLoginSuccess && analytics) {
            logEvent(analytics, "google_login_success", {
              userId: newUser.uid,
              email: newUser.email,
              method: "redirect",
              timestamp: new Date().toISOString(),
            });
            console.log("AuthProvider - Google login (redirect) logged to Firebase Analytics");
            loggedEvents.current.googleLoginSuccess = true;
          }
        }
      })
      .catch((error) => {
        console.error("Google Sign-In Redirect Error:", error);
        const message = getFriendlyErrorMessage(error.code, "Google sign-in failed.");
        setError(message);
        if (analytics) {
          logEvent(analytics, "google_login_failure", {
            userId: user?.uid || "anonymous",
            error_message: message,
            error_code: error.code,
            method: "redirect",
            timestamp: new Date().toISOString(),
          });
          console.log("AuthProvider - Google login (redirect) failure logged to Firebase Analytics");
        }
      });
  }, [analytics, user?.uid]);

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

  const signup = useCallback(async (email, password, displayName = "") => {
    try {
      setError(null);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      const userRef = doc(db, "users", newUser.uid);
      await withRetry("signup - setDoc", () =>
        setDoc(userRef, {
          email: newUser.email,
          displayName: displayName || newUser.email.split("@")[0],
          subscriptionTier: "Bronze",
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        }, { merge: true })
      );

      console.log("User signed up and Firestore doc created:", newUser.uid);

      if (!loggedEvents.current.signupSuccess && analytics) {
        logEvent(analytics, "signup_success", {
          userId: newUser.uid,
          email: newUser.email,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Signup logged to Firebase Analytics");
        loggedEvents.current.signupSuccess = true;
      }

      return newUser;
    } catch (error) {
      console.error("Signup Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Failed to sign up.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "signup_failure", {
          userId: user?.uid || "anonymous",
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Signup failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, user?.uid, auth, db]);

  const login = useCallback(async (email, password) => {
    try {
      setError(null);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const loggedInUser = userCredential.user;

      const userRef = doc(db, "users", loggedInUser.uid);
      await withRetry("login - setDoc", () =>
        setDoc(userRef, {
          lastLoginAt: serverTimestamp(),
        }, { merge: true })
      );

      console.log("User logged in:", loggedInUser.uid);

      if (!loggedEvents.current.loginSuccess && analytics) {
        logEvent(analytics, "login_success", {
          userId: loggedInUser.uid,
          email,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Login logged to Firebase Analytics");
        loggedEvents.current.loginSuccess = true;
      }

      return loggedInUser;
    } catch (error) {
      console.error("Login Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Failed to log in.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "login_failure", {
          userId: user?.uid || "anonymous",
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Login failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, user?.uid, auth, db]);

  const logout = useCallback(async () => {
    try {
      setError(null);
      await signOut(auth);
      setUser(null);
      console.log("User logged out");

      if (!loggedEvents.current.logoutSuccess && analytics) {
        logEvent(analytics, "logout_success", {
          userId: user?.uid || "anonymous",
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Logout logged to Firebase Analytics");
        loggedEvents.current.logoutSuccess = true;
      }
    } catch (error) {
      console.error("Logout Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Failed to log out.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "logout_failure", {
          userId: user?.uid || "anonymous",
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Logout failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, user?.uid, auth]);

  const loginWithGoogle = useCallback(async () => {
    const googleProvider = new GoogleAuthProvider();
    try {
      setError(null);
      // Use popup for desktop, redirect for mobile to avoid COOP issues
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, googleProvider);
        console.log("Google Sign-In - Initiated redirect");
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        const newUser = result.user;
        const userRef = doc(db, "users", newUser.uid);
        const snapshot = await withRetry("loginWithGoogle - getDoc", () => getDoc(userRef));

        if (!snapshot.exists()) {
          await withRetry("loginWithGoogle - setDoc (new user)", () =>
            setDoc(userRef, {
              email: newUser.email,
              displayName: newUser.displayName || newUser.email.split("@")[0],
              subscriptionTier: "Bronze",
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            }, { merge: true })
          );
          console.log("Google Sign-In - New user doc created:", newUser.uid);
        } else {
          await withRetry("loginWithGoogle - setDoc (existing user)", () =>
            setDoc(userRef, {
              lastLoginAt: serverTimestamp(),
            }, { merge: true })
          );
          console.log("Google Sign-In - User logged in:", newUser.uid);
        }

        if (!loggedEvents.current.googleLoginSuccess && analytics) {
          logEvent(analytics, "google_login_success", {
            userId: newUser.uid,
            email: newUser.email,
            method: "popup",
            timestamp: new Date().toISOString(),
          });
          console.log("AuthProvider - Google login logged to Firebase Analytics");
          loggedEvents.current.googleLoginSuccess = true;
        }
        return newUser;
      }
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Google sign-in failed.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "google_login_failure", {
          userId: user?.uid || "anonymous",
          error_message: message,
          error_code: error.code,
          method: isMobile ? "redirect" : "popup",
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Google login failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, user?.uid, auth, db]);

  const resetPassword = useCallback(async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
      console.log("Password reset email sent to:", email);

      if (!loggedEvents.current.passwordResetSuccess && analytics) {
        logEvent(analytics, "password_reset_success", {
          email,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Password reset logged to Firebase Analytics");
        loggedEvents.current.passwordResetSuccess = true;
      }

      return true;
    } catch (error) {
      console.error("Password Reset Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Failed to send password reset email.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "password_reset_failure", {
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Password reset failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, auth]);

  const reauthenticate = useCallback(async (email, password) => {
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

      if (!loggedEvents.current.reauthenticateSuccess && analytics) {
        logEvent(analytics, "reauthenticate_success", {
          userId: auth.currentUser.uid,
          email,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Reauthentication logged to Firebase Analytics");
        loggedEvents.current.reauthenticateSuccess = true;
      }

      return true;
    } catch (error) {
      console.error("Reauthentication Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Failed to reauthenticate.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "reauthenticate_failure", {
          userId: user?.uid || "anonymous",
          email,
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Reauthentication failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, user?.uid, auth]);

  const addOfflineUser = useCallback(async (poolId, offlineUserData) => {
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

      console.log("Offline user added to pool:", poolId, "ID:", newOfflineUser.id);

      if (!loggedEvents.current.addOfflineUserSuccess && analytics) {
        logEvent(analytics, "add_offline_user_success", {
          poolId,
          offlineUserId: newOfflineUser.id,
          userId: user?.uid || "anonymous",
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Add offline user logged to Firebase Analytics");
        loggedEvents.current.addOfflineUserSuccess = true;
      }

      return newOfflineUser.id;
    } catch (error) {
      console.error("Add Offline User Error:", error);
      const message = getFriendlyErrorMessage(error.code, "Failed to add offline user to the pool.");
      setError(message);

      if (analytics) {
        logEvent(analytics, "add_offline_user_failure", {
          poolId,
          userId: user?.uid || "anonymous",
          error_message: message,
          timestamp: new Date().toISOString(),
        });
        console.log("AuthProvider - Add offline user failure logged to Firebase Analytics");
      }

      throw new Error(message);
    }
  }, [analytics, user?.uid, db]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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
    [user, authLoading, error, signup, login, logout, loginWithGoogle, resetPassword, reauthenticate, clearError, addOfflineUser]
  );

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
              <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }}>
                {error}
              </Alert>
            )}
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