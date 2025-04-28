import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { getDb, getAnalyticsService, getAuthService } from "../firebase/config"; // Updated imports
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { logEvent } from "firebase/analytics";
import {
  Container,
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Stack,
  Snackbar,
  CircularProgress,
  InputAdornment,
  IconButton,
  Checkbox,
  FormControlLabel,
  Link,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    // Load "Remember Me" preference from localStorage on mount
    return localStorage.getItem("rememberMe") === "true";
  });
  const [passwordStrength, setPasswordStrength] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const { signup, loginWithGoogle, currentUser, authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const db = getDb(); // Initialize db with accessor
  const auth = getAuthService(); // Initialize auth with accessor
  const hasLoggedPageView = useRef(false);
  const hasLoggedEmailSignupSuccess = useRef(false);
  const hasLoggedGoogleSignupSuccess = useRef(false);
  const hasLoggedGoogleSignupClick = useRef(false);
  const hasLoggedTermsAccepted = useRef(false);
  const hasLoggedRememberMe = useRef(false); // Track if remember_me_toggled has been logged
  const hasLoggedRetryPerOperation = useRef({}); // Track retry logging per operation
  const redirectTimeoutRef = useRef(null); // Track redirect timeout

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "signup_page_viewed", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("SignupPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [currentUser?.uid, analytics]); // Added analytics to dependencies

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && currentUser) {
      const redirectTo = location.state?.from || "/dashboard";
      navigate(redirectTo, { replace: true });
    }
  }, [authLoading, currentUser, navigate, location.state]);

  // Cleanup redirect timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  // Reset analytics logging flags when user changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedEmailSignupSuccess.current = false;
    hasLoggedGoogleSignupSuccess.current = false;
    hasLoggedGoogleSignupClick.current = false;
    hasLoggedTermsAccepted.current = false;
    hasLoggedRememberMe.current = false;
    hasLoggedRetryPerOperation.current = {};
  }, [currentUser?.uid]);

  // Password strength validation
  const validatePasswordStrength = (password) => {
    if (password.length < 8) return "Weak: Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "Weak: Password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(password)) return "Weak: Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Weak: Password must contain at least one special character.";
    return "Strong";
  };

  const handlePasswordChange = (e) => {
    const passwordValue = e.target.value;
    setPassword(passwordValue);
    setPasswordStrength(validatePasswordStrength(passwordValue));
  };

  // Handle terms checkbox toggle
  const handleTermsToggle = (e) => {
    const checked = e.target.checked;
    setAgreeToTerms(checked);
    if (checked && !hasLoggedTermsAccepted.current && analytics) {
      logEvent(analytics, "terms_accepted", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("SignupPage - Terms accepted logged to Firebase Analytics");
      hasLoggedTermsAccepted.current = true;
    }
  };

  // Handle remember me toggle and persist to localStorage
  const handleRememberMeToggle = (e) => {
    const checked = e.target.checked;
    setRememberMe(checked);
    localStorage.setItem("rememberMe", checked.toString());
    console.log(`SignupPage - Remember Me set to ${checked}`);
    if (!hasLoggedRememberMe.current && analytics) {
      logEvent(analytics, "remember_me_toggled", {
        userId: currentUser?.uid || "anonymous",
        enabled: checked,
        timestamp: new Date().toISOString(),
      });
      console.log("SignupPage - Remember me toggle logged to Firebase Analytics");
      hasLoggedRememberMe.current = true;
    }
  };

  // Retry logic for Firebase operations
  const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        // Log retry event only once per operation
        if (!hasLoggedRetryPerOperation.current[operation] && analytics) {
          logEvent(analytics, "firebase_operation_retry", {
            userId: currentUser?.uid || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`SignupPage - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
          hasLoggedRetryPerOperation.current[operation] = true;
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

  // Email/Password signup
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Basic input validation
    if (!email || !password) {
      setError("Please enter both email and password.");
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    if (passwordStrength.includes("Weak")) {
      setError(passwordStrength);
      setLoading(false);
      return;
    }

    // Check if terms are accepted
    if (!agreeToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to sign up.");
      setLoading(false);
      return;
    }

    try {
      // Set persistence based on "Remember Me" checkbox
      const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await withRetry("Set Persistence (Email)", () => setPersistence(auth, persistenceType));
      console.log(`SignupPage - Set persistence to ${rememberMe ? "LOCAL" : "SESSION"}`);

      // 1. Create the user in Firebase Auth
      const userCredential = await withRetry("Email/Password Signup", () => signup(email, password));

      // 2. Create a corresponding user doc in Firestore
      await withRetry("Create User Doc", () =>
        setDoc(doc(db, "users", userCredential.user.uid), {
          email,
          subscriptionTier: "Bronze",
          createdAt: new Date(),
        })
      );

      // Log email signup success (only once)
      if (!hasLoggedEmailSignupSuccess.current && analytics) {
        logEvent(analytics, "signup_success", {
          method: "email",
          userId: userCredential.user.uid,
          timestamp: new Date().toISOString(),
        });
        console.log("SignupPage - Email signup success logged to Firebase Analytics");
        hasLoggedEmailSignupSuccess.current = true;
      }

      // 3. Show success message and navigate to dashboard
      setSuccessMessage("Account created successfully! Redirecting...");
      redirectTimeoutRef.current = setTimeout(() => {
        navigate("/dashboard");
        redirectTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      let userFriendlyError = "Failed to create an account. Please try again.";
      if (err.code === "auth/email-already-in-use") {
        userFriendlyError = "This email is already in use. Please use a different email.";
      } else if (err.code === "auth/invalid-email") {
        userFriendlyError = "Invalid email address.";
      } else if (err.code === "auth/weak-password") {
        userFriendlyError = "Password is too weak. Please use a stronger password.";
      } else if (err.code === "auth/too-many-requests") {
        userFriendlyError = "Too many attempts. Please try again later.";
      } else if (err.code === "auth/network-request-failed") {
        userFriendlyError = "Network error. Please check your connection and try again.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "signup_failed", {
          method: "email",
          userId: currentUser?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code,
          timestamp: new Date().toISOString(),
        });
        console.log("SignupPage - Email signup failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  // Google sign-up
  const handleGoogleSignUp = async () => {
    setError("");
    setLoading(true);

    // Log Google signup click (only once)
    if (!hasLoggedGoogleSignupClick.current && analytics) {
      logEvent(analytics, "google_signup_clicked", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("SignupPage - Google signup click logged to Firebase Analytics");
      hasLoggedGoogleSignupClick.current = true;
    }

    // Check if terms are accepted for Google signup
    if (!agreeToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to sign up.");
      setLoading(false);
      return;
    }

    try {
      // Set persistence based on "Remember Me" checkbox
      const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await withRetry("Set Persistence (Google)", () => setPersistence(auth, persistenceType));
      console.log(`SignupPage - Set persistence to ${rememberMe ? "LOCAL" : "SESSION"} for Google signup`);

      // loginWithGoogle automatically creates or updates the user doc
      const userCredential = await withRetry("Google Signup", () => loginWithGoogle());

      // Log Google signup success (only once)
      if (!hasLoggedGoogleSignupSuccess.current && analytics) {
        logEvent(analytics, "signup_success", {
          method: "google",
          userId: userCredential.user.uid,
          timestamp: new Date().toISOString(),
        });
        console.log("SignupPage - Google signup success logged to Firebase Analytics");
        hasLoggedGoogleSignupSuccess.current = true;
      }

      setSuccessMessage("Account created successfully! Redirecting...");
      redirectTimeoutRef.current = setTimeout(() => {
        navigate("/dashboard");
        redirectTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      let userFriendlyError = "Failed to sign up with Google. Please try again.";
      if (err.code === "auth/popup-closed-by-user") {
        userFriendlyError = "Google sign-up popup closed. Please try again.";
      } else if (err.code === "auth/too-many-requests") {
        userFriendlyError = "Too many attempts. Please try again later.";
      } else if (err.code === "auth/network-request-failed") {
        userFriendlyError = "Network error. Please check your connection and try again.";
      } else if (err.code === "auth/popup-blocked") {
        userFriendlyError = "Popup blocked by browser. Please allow popups and try again.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "signup_failed", {
          method: "google",
          userId: currentUser?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code,
          timestamp: new Date().toISOString(),
        });
        console.log("SignupPage - Google signup failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading UI while auth state is resolving
  if (authLoading) {
    return (
      <Container maxWidth="xs" sx={{ mt: 8, textAlign: "center" }}>
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

  // Redirect if already authenticated
  if (currentUser) {
    return null; // Handled by useEffect redirect
  }

  return (
    <Container maxWidth="xs" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ textAlign: "center", mb: 2 }}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: "'Montserrat', sans-serif'",
              mb: 1,
              fontWeight: 700,
            }}
          >
            Sign Up
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Create your BSP account and start hosting pools!
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" id="signup-error" aria-live="assertive">
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

        {/* Email/Password Form */}
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField
            type="email"
            label="Email"
            variant="outlined"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            InputProps={{ sx: { fontFamily: "'Poppins', sans-serif'" } }}
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "signup-email-label" } }}
            inputProps={{
              "aria-label": "Enter your email address",
              "aria-describedby": error ? "signup-error signup-email-label" : "signup-email-label",
            }}
            disabled={loading}
          />
          <TextField
            type={showPassword ? "text" : "password"}
            label="Password"
            variant="outlined"
            value={password}
            onChange={handlePasswordChange}
            required
            fullWidth
            helperText={passwordStrength}
            FormHelperTextProps={{
              sx: { fontFamily: "'Poppins', sans-serif'", color: passwordStrength.includes("Weak") ? "error.main" : "success.main" },
              id: "password-helper-text",
            }}
            InputProps={{
              sx: { fontFamily: "'Poppins', sans-serif'" },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "signup-password-label" } }}
            inputProps={{
              "aria-label": "Enter your password",
              "aria-describedby": error ? "signup-error signup-password-label password-helper-text" : "signup-password-label password-helper-text",
            }}
            disabled={loading}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={handleRememberMeToggle}
                color="primary"
                disabled={loading}
                inputProps={{ "aria-label": "Remember me checkbox" }}
              />
            }
            label="Remember Me"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={agreeToTerms}
                onChange={handleTermsToggle}
                color="primary"
                required
                disabled={loading}
                inputProps={{ "aria-label": "Agree to Terms of Service and Privacy Policy checkbox" }}
              />
            }
            label={
              <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                I agree to the{" "}
                <Link component={RouterLink} to="/tos" sx={{ textDecoration: "none" }} aria-label="Terms of Service">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link component={RouterLink} to="/privacy" sx={{ textDecoration: "none" }} aria-label="Privacy Policy">
                  Privacy Policy
                </Link>
              </Typography>
            }
            sx={{ mb: 1 }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            disabled={loading || !agreeToTerms}
            aria-label="Sign up with email and password"
          >
            {loading ? "Signing Up..." : "Sign Up"}
          </Button>
        </Box>

        {/* Google Sign-Up Button */}
        <Stack direction="row" sx={{ mt: 3 }} spacing={2} justifyContent="center">
          <Button
            variant="outlined"
            onClick={handleGoogleSignUp}
            color="secondary"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            disabled={loading || !agreeToTerms}
            aria-label="Sign up with Google"
          >
            Sign Up with Google
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}

export default SignupPage;