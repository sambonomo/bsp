/* --------------------------------------------------------
   src/pages/ChangePassword.js      (FULL FILE – paste-in)
   -------------------------------------------------------- */
   import React, { useState, useEffect, useRef } from "react";
   import { useNavigate } from "react-router-dom";
   import {
     EmailAuthProvider,
     reauthenticateWithCredential,
     updatePassword,
   } from "firebase/auth";
   
   import { useAuth }         from "../contexts/AuthContext";
   import { logAnalyticsEvent } from "../utils/helpers";
   
   /* ---------- MUI ---------- */
   import {
     Box, Container, Paper, Typography, TextField, Button, Alert,
     Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
     IconButton, InputAdornment, CircularProgress, styled,
   } from "@mui/material";
   import Visibility     from "@mui/icons-material/Visibility";
   import VisibilityOff  from "@mui/icons-material/VisibilityOff";
   
   /* ---------- styled ---------- */
   const FormPaper = styled(Paper)(({ theme }) => ({
     padding: theme.spacing(3),
     marginTop: theme.spacing(4),
     maxWidth: 420,
     margin: "auto",
     backgroundColor: theme.palette.mode === "dark"
       ? theme.palette.grey[800]
       : theme.palette.grey[50],
     borderRadius: theme.shape.borderRadius,
     border: `1px solid ${theme.palette.divider}`,
     boxShadow: theme.shadows[2],
   }));
   
   /* =========================================================
      Component
      ========================================================= */
   export default function ChangePassword() {
     /* ─── 1. hooks (all first) ──────────────────────────── */
     const navigate                      = useNavigate();
     const { user, authLoading }         = useAuth();
   
     const [currentPw, setCurrentPw]     = useState("");
     const [newPw,      setNewPw]        = useState("");
     const [confirmPw,  setConfirmPw]    = useState("");
   
     const [strength,   setStrength]     = useState("");
     const [err,        setErr]          = useState("");
     const [msg,        setMsg]          = useState("");
     const [busy,       setBusy]         = useState(false);
     const [dlg,        setDlg]          = useState(false);
   
     const [showCur,    setShowCur]      = useState(false);
     const [showNew,    setShowNew]      = useState(false);
     const [showConf,   setShowConf]     = useState(false);
   
     /* log page-view only once */
     const loggedRef = useRef(false);
     useEffect(() => {
       if (user && !loggedRef.current) {
         logAnalyticsEvent("change_pw_page", { uid: user.uid });
         loggedRef.current = true;
       }
     }, [user]);
   
     /* ─── 2. helpers ─────────────────────────────────────── */
     const strengthMsg = (pw) => {
       if (pw.length < 8)              return "Weak – at least 8 characters.";
       if (!/[A-Z]/.test(pw))          return "Weak – add an uppercase letter.";
       if (!/[0-9]/.test(pw))          return "Weak – add a number.";
       if (!/[^A-Za-z0-9]/.test(pw))   return "Weak – add a symbol.";
       return "Strong";
     };
   
     const withRetry = async (label, fn, max = 3) => {
       for (let i = 1; i <= max; i += 1) {
         try   { return await fn(); }
         catch (e) {
           logAnalyticsEvent("firebase_retry", { label, i, err:e.message, uid: user?.uid||"anon" });
           if (i === max) throw e;
           await new Promise(r => setTimeout(r, 1_000 * 2 ** (i - 1)));
         }
       }
     };
   
     /* ─── 3. early returns ───────────────────────────────── */
     if (authLoading || !user) return null;   // handled by App splash
   
     /* ─── 4. event handlers ─────────────────────────────── */
     const handleStrength = (e) => {
       const pw = e.target.value;
       setNewPw(pw);
       setStrength(strengthMsg(pw));
     };
   
     const confirmFlow = async () => {
       setErr(""); setMsg(""); setBusy(true);
   
       if (newPw !== confirmPw) {
         setErr("New password and confirmation don’t match."); setBusy(false); return;
       }
       if (strength.startsWith("Weak")) {
         setErr(strength); setBusy(false); return;
       }
   
       try {
         const cred = EmailAuthProvider.credential(user.email, currentPw);
         await withRetry("reauth", () => reauthenticateWithCredential(user, cred));
         await withRetry("update_pw", () => updatePassword(user, newPw));
         setMsg("Password updated!");
         logAnalyticsEvent("password_updated", { uid: user.uid });
         setDlg(false);
       } catch (e) {
         let friendly = "Failed to change password.";
         if (e.code === "auth/wrong-password")        friendly = "Current password is incorrect.";
         else if (e.code === "auth/weak-password")    friendly = "New password is too weak.";
         else if (e.code === "auth/too-many-requests")friendly = "Too many attempts; try later.";
         setErr(friendly);
         logAnalyticsEvent("password_update_failed", { uid:user.uid, code:e.code });
       } finally { setBusy(false); }
     };
   
     /* ─── 5. render ─────────────────────────────────────── */
     return (
       <Container>
         <FormPaper elevation={3}>
           <Typography variant="h5" sx={{ mb:2, fontWeight:700, fontFamily:"'Montserrat', sans-serif" }}>
             Change Password
           </Typography>
   
           {err && <Alert severity="error" sx={{ mb:2 }}>{err}</Alert>}
   
           <Snackbar
             open={!!msg}
             autoHideDuration={3_000}
             onClose={()=>setMsg("")}
             anchorOrigin={{ vertical:"top", horizontal:"center" }}
           >
             <Alert severity="success" action={
               <Button color="inherit" size="small" onClick={()=>navigate("/account")}>
                 Account
               </Button>
             }>
               {msg}
             </Alert>
           </Snackbar>
   
           {/* form */}
           <Box component="form" noValidate
                sx={{ display:"flex", flexDirection:"column", gap:2 }}
                onSubmit={(e)=>{ e.preventDefault(); setDlg(true); }}>
             {/* current */}
             <TextField
               label="Current Password" required
               type={showCur?"text":"password"} value={currentPw}
               onChange={e=>setCurrentPw(e.target.value)}
               InputProps={{
                 endAdornment:(
                   <InputAdornment position="end">
                     <IconButton onClick={()=>setShowCur(p=>!p)}
                       aria-label={showCur?"Hide current password":"Show current password"}>
                       {showCur ? <VisibilityOff/> : <Visibility/>}
                     </IconButton>
                   </InputAdornment>
                 ),
               }}
             />
   
             {/* new */}
             <TextField
               label="New Password" required
               type={showNew?"text":"password"} value={newPw}
               onChange={handleStrength}
               helperText={strength}
               FormHelperTextProps={{
                 sx:{ color: strength.startsWith("Weak") ? "error.main" : "success.main" },
               }}
               InputProps={{
                 endAdornment:(
                   <InputAdornment position="end">
                     <IconButton onClick={()=>setShowNew(p=>!p)}
                       aria-label={showNew?"Hide new password":"Show new password"}>
                       {showNew ? <VisibilityOff/> : <Visibility/>}
                     </IconButton>
                   </InputAdornment>
                 ),
               }}
             />
   
             {/* confirm */}
             <TextField
               label="Confirm New Password" required
               type={showConf?"text":"password"} value={confirmPw}
               onChange={e=>setConfirmPw(e.target.value)}
               InputProps={{
                 endAdornment:(
                   <InputAdornment position="end">
                     <IconButton onClick={()=>setShowConf(p=>!p)}
                       aria-label={showConf?"Hide confirmation":"Show confirmation"}>
                       {showConf ? <VisibilityOff/> : <Visibility/>}
                     </IconButton>
                   </InputAdornment>
                 ),
               }}
             />
   
             {/* buttons */}
             <Box sx={{ display:"flex", gap:2 }}>
               <Button type="submit" variant="contained" disabled={busy}>
                 {busy ? "Updating…" : "Update Password"}
               </Button>
               <Button variant="outlined" disabled={busy}
                       onClick={()=>navigate("/account")}>
                 Cancel
               </Button>
             </Box>
           </Box>
         </FormPaper>
   
         {/* confirm dialog */}
         <Dialog open={dlg} onClose={()=>setDlg(false)}>
           <DialogTitle>Confirm Password Change</DialogTitle>
           <DialogContent>
             <Typography>Are you sure you want to change your password?</Typography>
           </DialogContent>
           <DialogActions>
             <Button onClick={()=>setDlg(false)}>Cancel</Button>
             <Button onClick={confirmFlow}>Confirm</Button>
           </DialogActions>
         </Dialog>
       </Container>
     );
   }
   