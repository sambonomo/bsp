import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import { getAuthService, getAnalyticsService } from "../firebase/config";
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
  styled,
  InputAdornment,
  IconButton,
  Checkbox,
  FormControlLabel,
  Link,
  CircularProgress,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

// Styled components for polished UI
const FormContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginTop: theme.spacing(8),
  maxWidth: 400,
  margin: "auto",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  boxShadow: theme.shadows[2],
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

const GoogleButton = styled(Button)(({ theme }) => ({
  borderColor: theme.palette.secondary.main,
  color: theme.palette.secondary.main,
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  "&:hover": {
    borderColor: theme.palette.secondary.dark,
    color: theme.palette.secondary.dark,
    backgroundColor: theme.palette.secondary.light,
  },
  "&:disabled": {
    borderColor: theme.palette.grey[400],
    color: theme.palette.grey[400],
  },
}));

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("rememberMe") === "true";
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const { login, loginWithGoogle, currentUser, authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuthService();
  const hasLoggedPageView = useRef(false);
  const hasLoggedEmailLoginSuccess = useRef(false);
  const hasLoggedGoogleLoginClick = useRef(false);
  const hasLoggedForgotPasswordClick = useRef(false);
  const hasLoggedSignupClick = useRef(false);
  const hasLoggedRememberMe = useRef(false);
  const hasLoggedRetryPerOperation = useRef({}); // Track retry logging per operation
  const redirectTimeoutRef = useRef(null);

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "login_page_viewed", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LoginPage - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [currentUser?.uid, analytics]);

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
    hasLoggedEmailLoginSuccess.current = false;
    hasLoggedGoogleLoginClick.current = false;
    hasLoggedForgotPasswordClick.current = false;
    hasLoggedSignupClick.current = false;
    hasLoggedRememberMe.current = false;
    hasLoggedRetryPerOperation.current = {};
  }, [currentUser?.uid]);

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
          console.log(`LoginPage - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Email/Password submit
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

    try {
      // Set persistence
      const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistenceType);
      console.log(`LoginPage - Set persistence to ${rememberMe ? "LOCAL" : "SESSION"}`);

      await login(email, password);
      setSuccessMessage("Login successful! Redirecting...");
      if (!hasLoggedEmailLoginSuccess.current && analytics) {
        logEvent(analytics, "login_success", {
          method: "email",
          userId: currentUser?.uid || "anonymous",
          timestamp: new Date().toISOString(),
        });
        console.log("LoginPage - Email/Password login success logged to Firebase Analytics");
        hasLoggedEmailLoginSuccess.current = true;
      }
      const redirectTo = location.state?.from || "/dashboard";
      redirectTimeoutRef.current = setTimeout(() => {
        navigate(redirectTo, { replace: true });
        redirectTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      let userFriendlyError = "Failed to log in. Please try again.";
      if (err.code === "auth/invalid-email") {
        userFriendlyError = "Invalid email address.";
      } else if (err.code === "auth/wrong-password") {
        userFriendlyError = "Incorrect password.";
      } else if (err.code === "auth/user-not-found") {
        userFriendlyError = "No user found with this email.";
      } else if (err.code === "auth/too-many-requests") {
        userFriendlyError = "Too many attempts. Please try again later.";
      } else if (err.code === "auth/network-request-failed") {
        userFriendlyError = "Network error. Please check your connection and try again.";
      } else if (err.code === "auth/invalid-credential") {
        userFriendlyError = "Invalid credentials provided.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "login_failed", {
          method: "email",
          userId: currentUser?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code,
          timestamp: new Date().toISOString(),
        });
        console.log("LoginPage - Email/Password login failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  // Google sign-in
  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);

    if (!hasLoggedGoogleLoginClick.current && analytics) {
      logEvent(analytics, "login_click_google", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LoginPage - Google login click logged to Firebase Analytics");
      hasLoggedGoogleLoginClick.current = true;
    }

    try {
      // Set persistence with retry
      const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await withRetry("Set Persistence (Google)", () => setPersistence(auth, persistenceType));
      console.log(`LoginPage - Set persistence to ${rememberMe ? "LOCAL" : "SESSION"} for Google login`);

      // Use loginWithGoogle from AuthContext, which now uses signInWithRedirect
      await withRetry("Google Login", () => loginWithGoogle());
      // Note: No further action needed here; redirect result is handled in AuthContext.js
    } catch (err) {
      let userFriendlyError = "Failed to log in with Google. Please try again.";
      if (err.code === "auth/too-many-requests") {
        userFriendlyError = "Too many attempts. Please try again later.";
      } else if (err.code === "auth/network-request-failed") {
        userFriendlyError = "Network error. Please check your connection and try again.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "login_failed", {
          method: "google",
          userId: currentUser?.uid || "anonymous",
          error_message: userFriendlyError,
          error_code: err.code,
          timestamp: new Date().toISOString(),
        });
        console.log("LoginPage - Google login failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle forgot password click
  const handleForgotPasswordClick = () => {
    if (!hasLoggedForgotPasswordClick.current && analytics) {
      logEvent(analytics, "forgot_password_clicked", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LoginPage - Forgot password click logged to Firebase Analytics");
      hasLoggedForgotPasswordClick.current = true;
    }
  };

  // Handle signup link click
  const handleSignupClick = () => {
    if (!hasLoggedSignupClick.current && analytics) {
      logEvent(analytics, "signup_link_clicked", {
        userId: currentUser?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("LoginPage - Signup link click logged to Firebase Analytics");
      hasLoggedSignupClick.current = true;
    }
  };

  // Handle remember me toggle and persist to localStorage
  const handleRememberMeToggle = (e) => {
    const checked = e.target.checked;
    setRememberMe(checked);
    localStorage.setItem("rememberMe", checked.toString());
    console.log(`LoginPage - Remember Me set to ${checked}`);
    if (!hasLoggedRememberMe.current && analytics) {
      logEvent(analytics, "remember_me_toggled", {
        userId: currentUser?.uid || "anonymous",
        enabled: checked,
        timestamp: new Date().toISOString(),
      });
      console.log("LoginPage - Remember me toggle logged to Firebase Analytics");
      hasLoggedRememberMe.current = true;
    }
  };

  // Show loading UI while auth state is resolving
  if (authLoading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: "center" }}>
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

  return (
    <Container>
      <FormContainer elevation={3}>
        <Box sx={{ textAlign: "center", mb: 2 }}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: "'Montserrat', sans-serif'",
              mb: 1,
              fontWeight: 700,
            }}
          >
            Log In
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Welcome back! Please enter your credentials.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" id="login-error" aria-live="assertive">
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
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "login-email-label" } }}
            inputProps={{
              "aria-label": "Enter your email address",
              "aria-describedby": error ? "login-error login-email-label" : "login-email-label",
            }}
            disabled={loading}
          />
          <TextField
            type={showPassword ? "text" : "password"}
            label="Password"
            variant="outlined"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
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
            InputLabelProps={{ sx: { fontFamily: "'Poppins', sans-serif'", id: "login-password-label" } }}
            inputProps={{
              "aria-label": "Enter your password",
              "aria-describedby": error ? "login-error login-password-label" : "login-password-label",
            }}
            disabled={loading}
          />
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            <Link
              component={RouterLink}
              to="/forgot-password"
              sx={{ fontFamily: "'Poppins', sans-serif'", textDecoration: "none" }}
              onClick={handleForgotPasswordClick}
              aria-label="Forgot password"
              aria-describedby={error ? "login-error" : undefined}
            >
              Forgot Password?
            </Link>
          </Box>
          <StyledButton type="submit" variant="contained" disabled={loading} aria-label="Log in with email and password">
            {loading ? "Logging In..." : "Log In"}
          </StyledButton>
        </Box>

        <Stack direction="row" sx={{ mt: 3 }} spacing={2} justifyContent="center">
          <GoogleButton
            variant="outlined"
            onClick={handleGoogleLogin}
            disabled={loading}
            aria-label="Sign in with Google"
          >
            Sign in with Google
          </GoogleButton>
        </Stack>

        <Box sx={{ textAlign: "center", mt: 2 }}>
          <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Don’t have an account?{" "}
            <Link
              component={RouterLink}
              to="/signup"
              sx={{ textDecoration: "none" }}
              onClick={handleSignupClick}
              aria-label="Sign up"
              aria-describedby={error ? "login-error" : undefined}
            >
              Sign Up
            </Link>
          </Typography>
        </Box>
      </FormContainer>
    </Container>
  );
}

export default LoginPage;