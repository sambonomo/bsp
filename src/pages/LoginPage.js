/* --------------------------------------------------------
   src/pages/LoginPage.js       (FULL FILE – paste in)
   -------------------------------------------------------- */
   import React, { useState, useEffect, useRef } from "react";
   import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
   import {
     setPersistence,
     browserLocalPersistence,
     browserSessionPersistence,
   } from "firebase/auth";
   
   import { useAuth }          from "../contexts/AuthContext";
   import { getAuthService }   from "../firebase/config";
   import { logAnalyticsEvent } from "../utils/helpers";
   
   /* ---------- MUI ---------- */
   import {
     Container, Paper, Box, Typography, TextField, Button, Alert, Snackbar,
     Stack, styled, InputAdornment, IconButton, Checkbox, FormControlLabel,
     Link, CircularProgress,
   } from "@mui/material";
   import Visibility      from "@mui/icons-material/Visibility";
   import VisibilityOff   from "@mui/icons-material/VisibilityOff";
   
   /* ---------- styled ---------- */
   const FormPaper = styled(Paper)(({ theme }) => ({
     padding: theme.spacing(3),
     marginTop: theme.spacing(8),
     maxWidth: 420,
     margin: "auto",
     backgroundColor: theme.palette.mode === "dark"
       ? theme.palette.grey[800]
       : theme.palette.grey[50],
     borderRadius: theme.shape.borderRadius,
     border: `1px solid ${theme.palette.divider}`,
     boxShadow: theme.shadows[2],
   }));
   
   const PrimaryBtn = styled(Button)({
     fontWeight: 600, textTransform: "none",
   });
   
   const GoogleBtn = styled(Button)(({ theme }) => ({
     borderColor: theme.palette.secondary.main,
     color: theme.palette.secondary.main,
     textTransform: "none",
   }));
   
   /* =========================================================
      Component
      ========================================================= */
   export default function LoginPage() {
     /* ── 1. hooks ────────────────────────────────────────── */
     const navigate           = useNavigate();
     const location           = useLocation();
     const auth               = getAuthService();
     const { login, loginWithGoogle,
             currentUser, authLoading } = useAuth();
   
     /* ui state */
     const [email, setEmail]          = useState("");
     const [pw, setPw]                = useState("");
     const [showPw, setShowPw]        = useState(false);
     const [remember, setRemember]    = useState(
       localStorage.getItem("rememberMe") === "true"
     );
     const [err, setErr]              = useState("");
     const [msg, setMsg]              = useState("");
     const [busy, setBusy]            = useState(false);
   
     /* refs to avoid dup-logging */
     const loggedRef   = useRef({
       page:false, emailOk:false, gClick:false, forgot:false, signup:false, remember:false,
       retry:{},
     });
     const redirectTimer = useRef(null);
   
     /* ── 2. analytics page-view once ─────────────────────── */
     useEffect(() => {
       if (!loggedRef.current.page) {
         logAnalyticsEvent("login_page_viewed", { uid: currentUser?.uid||"anon" });
         loggedRef.current.page = true;
       }
     }, [currentUser]);
   
     /* ── 3. redirect if already signed in ────────────────── */
     useEffect(() => {
       if (!authLoading && currentUser) {
         const to = location.state?.from || "/dashboard";
         navigate(to, { replace:true });
       }
     }, [authLoading, currentUser, navigate, location.state]);
   
     /* cleanup redirect timer */
     useEffect(() => () => clearTimeout(redirectTimer.current), []);
   
     /* ── 4. retry helper ─────────────────────────────────── */
     const withRetry = async (label, fn, max=3) => {
       for (let i=1;i<=max;i+=1) {
         try { return await fn(); }
         catch(e) {
           if (!loggedRef.current.retry[label]) {
             logAnalyticsEvent("firebase_retry", { label, i, err:e.message });
             loggedRef.current.retry[label] = true;
           }
           if (i===max) throw e;
           await new Promise(r=>setTimeout(r, 1_000*2**(i-1)));
         }
       }
     };
   
     /* ── 5. event handlers ───────────────────────────────── */
     const handleRemember = (e) => {
       const val = e.target.checked;
       setRemember(val);
       localStorage.setItem("rememberMe", val);
       if (!loggedRef.current.remember) {
         logAnalyticsEvent("remember_me_toggle", { enabled:val });
         loggedRef.current.remember = true;
       }
     };
   
     const submitEmail = async (e) => {
       e.preventDefault(); setErr(""); setMsg(""); setBusy(true);
   
       /* quick client validation */
       if (!email || !pw)         { setErr("Enter email and password."); setBusy(false); return; }
       if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
         setErr("Enter a valid email."); setBusy(false); return;
       }
   
       try {
         await setPersistence(auth,
           remember ? browserLocalPersistence : browserSessionPersistence
         );
         await login(email, pw);
   
         setMsg("Login successful! Redirecting…");
         if (!loggedRef.current.emailOk) {
           logAnalyticsEvent("login_success", { method:"email", uid:auth.currentUser.uid });
           loggedRef.current.emailOk = true;
         }
         const to = location.state?.from || "/dashboard";
         redirectTimer.current = setTimeout(()=>navigate(to,{replace:true}), 2_000);
       } catch (e) {
         const map = {
           "auth/invalid-email":     "Invalid email.",
           "auth/wrong-password":    "Incorrect password.",
           "auth/user-not-found":    "No user with this email.",
           "auth/too-many-requests": "Too many attempts – try later.",
           "auth/network-request-failed":"Network error – check connection.",
           "auth/invalid-credential":"Invalid credentials.",
         };
         const msg = map[e.code] || "Failed to log in.";
         setErr(msg);
         logAnalyticsEvent("login_failed", { method:"email", code:e.code, msg });
       } finally { setBusy(false); }
     };
   
     const googleLogin = async () => {
       setErr(""); setMsg(""); setBusy(true);
   
       if (!loggedRef.current.gClick) {
         logAnalyticsEvent("login_click_google");
         loggedRef.current.gClick = true;
       }
   
       try {
         await withRetry("setPersistence(G)", () =>
           setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
         );
         await withRetry("googleLogin", () => loginWithGoogle());
         setMsg("Redirecting to Google…");
       } catch (e) {
         const map = {
           "auth/too-many-requests":      "Too many attempts – try later.",
           "auth/network-request-failed": "Network error.",
           "auth/popup-blocked":          "Popup blocked – allow pop-ups.",
           "auth/popup-closed-by-user":   "Popup closed before completion.",
         };
         const m = map[e.code] || "Google sign-in failed.";
         setErr(m);
         logAnalyticsEvent("login_failed", { method:"google", code:e.code, msg:m });
       } finally { setBusy(false); }
     };
   
     /* link-click helpers */
     const markOnce = (key, evt) => () => {
       if (!loggedRef.current[key]) {
         logAnalyticsEvent(evt); loggedRef.current[key]=true;
       }
     };
   
     /* ── 6. loading splash while auth state unresolved ───── */
     if (authLoading) {
       return (
         <Container maxWidth="sm" sx={{ mt:4, textAlign:"center" }}>
           <Typography sx={{ mb:2 }}>Loading authentication…</Typography>
           <CircularProgress />
         </Container>
       );
     }
   
     /* ── 7. render ───────────────────────────────────────── */
     return (
       <Container>
         <FormPaper>
           <Box sx={{ textAlign:"center", mb:2 }}>
             <Typography variant="h5" sx={{ fontWeight:700, fontFamily:"'Montserrat', sans-serif" }}>
               Log In
             </Typography>
             <Typography variant="body2">Welcome back! Please sign in.</Typography>
           </Box>
   
           {err && <Alert severity="error" sx={{ mb:2 }}>{err}</Alert>}
           <Snackbar
             open={!!msg}
             autoHideDuration={3_000}
             onClose={()=>setMsg("")}
             anchorOrigin={{ vertical:"top", horizontal:"center" }}
           >
             <Alert severity="success">{msg}</Alert>
           </Snackbar>
   
           <Box component="form" onSubmit={submitEmail}
                sx={{ display:"flex", flexDirection:"column", gap:2 }}>
             <TextField
               label="Email" type="email" fullWidth required disabled={busy}
               value={email} onChange={e=>setEmail(e.target.value)}
             />
             <TextField
               label="Password" required fullWidth disabled={busy}
               type={showPw?"text":"password"} value={pw}
               onChange={e=>setPw(e.target.value)}
               InputProps={{
                 endAdornment:(
                   <InputAdornment position="end">
                     <IconButton onClick={()=>setShowPw(p=>!p)}
                       aria-label={showPw?"Hide password":"Show password"}>
                       {showPw ? <VisibilityOff/> : <Visibility/>}
                     </IconButton>
                   </InputAdornment>
                 ),
               }}
             />
   
             <Box sx={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
               <FormControlLabel
                 control={
                   <Checkbox checked={remember} onChange={handleRemember} disabled={busy}/>
                 }
                 label="Remember Me"
               />
               <Link component={RouterLink} to="/forgot-password"
                     onClick={markOnce("forgot","forgot_password_clicked")}>
                 Forgot Password?
               </Link>
             </Box>
   
             <PrimaryBtn variant="contained" type="submit" disabled={busy}>
               {busy ? "Logging in…" : "Log In"}
             </PrimaryBtn>
           </Box>
   
           {/* Google */}
           <Stack direction="row" spacing={2} sx={{ mt:3 }} justifyContent="center">
             <GoogleBtn variant="outlined" onClick={googleLogin} disabled={busy}>
               Sign in with Google
             </GoogleBtn>
           </Stack>
   
           {/* sign-up link */}
           <Box sx={{ textAlign:"center", mt:2 }}>
             <Typography variant="body2">
               Don’t have an account?{" "}
               <Link component={RouterLink} to="/signup"
                     onClick={markOnce("signup","signup_link_clicked")}>
                 Sign Up
               </Link>
             </Typography>
           </Box>
         </FormPaper>
       </Container>
     );
   }
   