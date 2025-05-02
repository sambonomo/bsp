/* ------------------------------------------------------------------
   src/pages/SignupPage.js          (FULL FILE – ready to paste)
   ------------------------------------------------------------------ */
   import React, {
    useState, useEffect, useRef, useCallback, useMemo,
  } from "react";
  import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
  import {
    Container, Paper, Box, Typography, TextField, Button, Alert, Stack,
    Snackbar, CircularProgress, InputAdornment, IconButton, Checkbox,
    FormControlLabel, Link,
  } from "@mui/material";
  import Visibility               from "@mui/icons-material/Visibility";
  import VisibilityOff            from "@mui/icons-material/VisibilityOff";
  
  import {
    browserLocalPersistence, browserSessionPersistence, setPersistence,
  } from "firebase/auth";
  import { doc, setDoc }          from "firebase/firestore";
  import { logEvent }             from "firebase/analytics";
  
  import { useAuth }              from "../contexts/AuthContext";
  import { getDb, getAuthService, getAnalyticsService } from "../firebase/config";
  
  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  const passwordStrengthMsg = (pwd = "") => {
    if (pwd.length < 8)               return "Weak: min 8 characters.";
    if (!/[A-Z]/.test(pwd))           return "Weak: add an uppercase letter.";
    if (!/[0-9]/.test(pwd))           return "Weak: add a number.";
    if (!/[^A-Za-z0-9]/.test(pwd))    return "Weak: add a special char.";
    return "Strong";
  };
  
  /* ------------------------------------------------------------------ */
  /* component                                                          */
  /* ------------------------------------------------------------------ */
  export default function SignupPage() {
    /* services & hooks */
    const {
      signup, loginWithGoogle, currentUser, authLoading,
    } = useAuth();
    const navigate      = useNavigate();
    const location      = useLocation();
    const db            = getDb();
    const auth          = getAuthService();
    const analyticsRef  = useRef(getAnalyticsService());
  
    /* local state */
    const [email,      setEmail]      = useState("");
    const [password,   setPassword]   = useState("");
    const [showPwd,    setShowPwd]    = useState(false);
    const [rememberMe, setRememberMe] = useState(
      localStorage.getItem("rememberMe") === "true",
    );
    const [agree,      setAgree]      = useState(false);
    const [pwdMsg,     setPwdMsg]     = useState("");
    const [error,      setError]      = useState("");
    const [success,    setSuccess]    = useState("");
    const [loading,    setLoading]    = useState(false);
  
    /* once-per-event logger */
    const logged = useRef({});
    const logOnce = useCallback((evt, data = {}) => {
      if (!logged.current[evt] && analyticsRef.current) {
        logEvent(analyticsRef.current, evt, {
          userId: currentUser?.uid || "anonymous",
          ts: Date.now(),
          ...data,
        });
        logged.current[evt] = true;
      }
    }, [currentUser?.uid]);
  
    /* page view */
    useEffect(() => { logOnce("signup_page_viewed"); }, [logOnce]);
  
    /* redirect */
    useEffect(() => {
      if (!authLoading && currentUser) {
        navigate(location.state?.from || "/dashboard", { replace: true });
      }
    }, [authLoading, currentUser, navigate, location.state]);
  
    /* timer cleanup */
    const timerRef = useRef(null);
    useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);
  
    /* handlers */
    const handlePwdChange = (e) => {
      const val = e.target.value;
      setPassword(val);
      setPwdMsg(passwordStrengthMsg(val));
    };
  
    const toggleRemember = (e) => {
      const val = e.target.checked;
      setRememberMe(val);
      localStorage.setItem("rememberMe", String(val));
      logOnce("remember_me_toggled", { enabled: val });
    };
  
    const toggleAgree = (e) => {
      const val = e.target.checked;
      setAgree(val);
      if (val) logOnce("terms_accepted");
    };
  
    /* retry helper (simplified JS) */
    const withRetry = useCallback(
      async (op, fn, retries = 3) => {
        for (let i = 1; i <= retries; i += 1) {
          try { return await fn(); }
          catch (err) {
            logOnce("firebase_retry", { op, attempt: i, code: err?.code });
            if (i === retries) throw err;
            await new Promise((r) => setTimeout(r, 2 ** (i - 1) * 1_000));
          }
        }
        // eslint-disable-next-line consistent-return
        return null;
      },
      [logOnce],
    );
  
    /* EMAIL SIGN-UP -------------------------------------------------- */
    const handleEmailSignup = async (e) => {
      e.preventDefault();
      setError(""); setSuccess("");
  
      if (!emailRegex.test(email))            return setError("Enter a valid email.");
      if (pwdMsg.startsWith("Weak"))          return setError(pwdMsg);
      if (!agree)                             return setError("Please accept the terms.");
  
      setLoading(true);
      try {
        const persist = rememberMe ? browserLocalPersistence : browserSessionPersistence;
        await withRetry("setPersistence", () => setPersistence(auth, persist));
  
        const cred = await withRetry("signup", () => signup(email, password));
  
        await withRetry("createUserDoc", () => setDoc(
          doc(db, "users", cred.user.uid),
          { email, subscriptionTier: "Bronze", createdAt: new Date() },
        ));
  
        logOnce("signup_success", { method: "email" });
        setSuccess("Account created! Redirecting…");
        timerRef.current = setTimeout(() => navigate("/dashboard"), 1_500);
      } catch (err) {
        const map = {
          "auth/email-already-in-use": "Email already in use.",
          "auth/weak-password":        "Password too weak.",
          "auth/invalid-email":        "Invalid email address.",
        };
        setError(map[err.code] || "Unable to sign up.");
        logOnce("signup_failed", { method: "email", code: err.code });
      } finally { setLoading(false); }
    };
  
    /* GOOGLE SIGN-UP ------------------------------------------------- */
    const handleGoogleSignup = async () => {
      setError(""); setSuccess(""); setLoading(true);
      if (!agree) { setError("Please accept the terms."); setLoading(false); return; }
  
      logOnce("google_signup_clicked");
      try {
        const persist = rememberMe ? browserLocalPersistence : browserSessionPersistence;
        await withRetry("setPersistence", () => setPersistence(auth, persist));
  
        await withRetry("googleSignup", loginWithGoogle);
  
        logOnce("signup_success", { method: "google" });
        setSuccess("Account created! Redirecting…");
        timerRef.current = setTimeout(() => navigate("/dashboard"), 1_200);
      } catch (err) {
        const map = {
          "auth/popup-closed-by-user": "Google popup closed.",
          "auth/popup-blocked":        "Popup blocked – enable pop-ups.",
        };
        setError(map[err.code] || "Google signup failed.");
        logOnce("signup_failed", { method: "google", code: err.code });
      } finally { setLoading(false); }
    };
  
    /* derived */
    const btnDisabled = useMemo(
      () => loading || !agree || !email || !password,
      [loading, agree, email, password],
    );
  
    /* render ---------------------------------------------------------------- */
    if (authLoading) {
      return (
        <Container maxWidth="xs" sx={{ mt: 10, textAlign: "center" }}>
          <CircularProgress />
        </Container>
      );
    }
    if (currentUser) return null;
  
    return (
      <Container maxWidth="xs" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
          <Box textAlign="center" mb={2}>
            <Typography variant="h5" fontWeight={700} mb={1}>
              Sign&nbsp;Up
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create your BSP account and start hosting pools!
            </Typography>
          </Box>
  
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} aria-live="assertive">
              {error}
            </Alert>
          )}
          <Snackbar
            open={!!success}
            autoHideDuration={3_000}
            onClose={() => setSuccess("")}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
          >
            <Alert severity="success" sx={{ width: "100%" }}>
              {success}
            </Alert>
          </Snackbar>
  
          {/* form */}
          <Box component="form" onSubmit={handleEmailSignup} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              type="email" label="Email" required fullWidth value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              type={showPwd ? "text" : "password"} label="Password" required fullWidth
              value={password} onChange={handlePwdChange} helperText={pwdMsg}
              FormHelperTextProps={{
                sx: { color: pwdMsg.startsWith("Weak") ? "error.main" : "success.main" },
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPwd((p) => !p)}
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
  
            <FormControlLabel
              control={<Checkbox checked={rememberMe} onChange={toggleRemember} />}
              label="Remember Me"
            />
            <FormControlLabel
              control={<Checkbox checked={agree} onChange={toggleAgree} required />}
              label={(
                <Typography variant="body2">
                  I agree to the&nbsp;
                  <Link component={RouterLink} to="/tos">Terms of Service</Link>
                  &nbsp;and&nbsp;
                  <Link component={RouterLink} to="/privacy">Privacy Policy</Link>
                </Typography>
              )}
            />
  
            <Button
              type="submit" variant="contained" disabled={btnDisabled}
              aria-label="Email signup"
            >
              {loading ? "Signing Up…" : "Sign Up"}
            </Button>
          </Box>
  
          {/* google */}
          <Stack direction="row" justifyContent="center" mt={3}>
            <Button
              variant="outlined" color="secondary" disabled={loading || !agree}
              onClick={handleGoogleSignup}
            >
              Sign&nbsp;Up&nbsp;with&nbsp;Google
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }
  