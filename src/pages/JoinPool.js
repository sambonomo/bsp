/* ----------------------------------------------------
   src/pages/JoinPool.js     (full file – copy & paste)
   ---------------------------------------------------- */
   import React, { useState, useEffect, useRef } from "react";
   import { useNavigate, Link as RouterLink } from "react-router-dom";
   import {
     Box,
     Container,
     Paper,
     Typography,
     TextField,
     Button,
     Alert,
     Snackbar,
     Dialog,
     DialogTitle,
     DialogContent,
     DialogActions,
     CircularProgress,
     styled,
     InputAdornment,
     IconButton,
   } from "@mui/material";
   import Visibility from "@mui/icons-material/Visibility";
   import VisibilityOff from "@mui/icons-material/VisibilityOff";
   import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
   
   import { useAuth } from "../contexts/AuthContext";
   import { useThemeContext } from "../contexts/ThemeContext";
   import { getDb, getAnalyticsService } from "../firebase/config";
   import {
     collection,
     query,
     where,
     getDocs,
     doc,
     updateDoc,
     arrayUnion,
     setDoc,
   } from "firebase/firestore";
   import { logEvent } from "firebase/analytics";
   
   /* ---------- styled helpers ---------- */
   const FormContainer = styled(Paper)(({ theme }) => ({
     padding: theme.spacing(3),
     marginTop: theme.spacing(4),
     maxWidth: 500,
     margin: "auto",
     backgroundColor:
       theme.palette.mode === "dark"
         ? theme.palette.grey[800]
         : theme.palette.grey[50],
     borderRadius: theme.shape.borderRadius,
     border: `1px solid ${theme.palette.divider}`,
     boxShadow: theme.shadows[2],
   }));
   
   const BrandButton = styled(Button)(({ theme }) => ({
     fontWeight: 600,
     textTransform: "none",
     borderRadius: 8,
     backgroundColor: theme.palette.brand.main,
     color: theme.palette.brand.contrastText,
     "&:hover": { backgroundColor: theme.palette.brand.dark },
     "&:disabled": { opacity: 0.5 },
   }));
   
   /* ---------- component ---------- */
   export default function JoinPool() {
     const { user, authLoading } = useAuth();
     const { mode } = useThemeContext();
     const isDark = mode === "dark";
     const navigate = useNavigate();
   
     /* state */
     const [inviteCode, setInviteCode] = useState("");
     const [poolPassword, setPoolPassword] = useState("");
     const [showPwd, setShowPwd] = useState(false);
     const [poolDetails, setPoolDetails] = useState(null);
   
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState("");
     const [snack, setSnack] = useState("");
     const [confirmOpen, setConfirmOpen] = useState(false);
     const [qrOpen, setQrOpen] = useState(false); // placeholder modal
   
     /* services */
     const db = getDb();
     const analytics = useRef(getAnalyticsService());
   
     /* log helper */
     const logOnce = (evt, data = {}) => {
       const key = `__${evt}`;
       if (!logOnce[key]) {
         logEvent(analytics.current, evt, {
           userId: user?.uid || "anonymous",
           timestamp: new Date().toISOString(),
           ...data,
         });
         logOnce[key] = true;
       }
     };
   
     /* page view */
     useEffect(() => {
       if (!authLoading) logOnce("join_pool_page_viewed");
     }, [authLoading]);
   
     /* -------- invite code validation (6–8 alphanum) -------- */
     const codeRegex = /^[A-Z0-9]{6,8}$/;
   
     /* -------- retry wrapper -------- */
     const withRetry = async (op, fn, max = 3) => {
       for (let i = 1; i <= max; i++) {
         try {
           return await fn();
         } catch (err) {
           if (i === max) throw err;
           await new Promise((r) => setTimeout(r, 500 * 2 ** (i - 1)));
         }
       }
     };
   
     /* -------- lookup pool -------- */
     const handleLookup = async (e) => {
       e.preventDefault();
       setError("");
       setPoolDetails(null);
   
       if (!user) return setError("You must be logged in.");
       const code = inviteCode.trim().toUpperCase();
       if (!codeRegex.test(code))
         return setError("Invite code must be 6–8 letters/numbers.");
   
       try {
         setLoading(true);
         const snap = await withRetry("lookup", () =>
           getDocs(
             query(collection(db, "pools"), where("inviteCode", "==", code))
           )
         );
         if (snap.empty) return setError("Invalid invite code.");
   
         const docSnap = snap.docs[0];
         const data = docSnap.data();
         if (data.status !== "open") return setError("Pool is not open.");
   
         if (data.memberIds?.includes(user.uid))
           return setError("You’re already in this pool.");
   
         setPoolDetails({ id: docSnap.id, ...data });
         setConfirmOpen(true);
       } catch (err) {
         console.error(err);
         setError("Couldn’t find that pool. Try again.");
       } finally {
         setLoading(false);
       }
     };
   
     /* -------- join pool -------- */
     const handleJoin = async () => {
       if (!poolDetails) return;
       if (poolDetails.poolPassword && poolPassword !== poolDetails.poolPassword)
         return setError("Wrong pool password.");
   
       try {
         setLoading(true);
         await withRetry("join", () =>
           setDoc(
             doc(db, "pools", poolDetails.id, "participants", user.uid),
             {
               joinedAt: new Date().toISOString(),
               displayName: user.displayName || user.email || "Anonymous",
             },
             { merge: true }
           )
         );
         await withRetry("memberIds", () =>
           updateDoc(doc(db, "pools", poolDetails.id), {
             memberIds: arrayUnion(user.uid),
             [`membersMeta.${user.uid}`]: { joinedAt: new Date().toISOString() },
           })
         );
   
         logOnce("pool_joined", { poolId: poolDetails.id });
         setSnack("Joined!");
         setTimeout(() => navigate(`/pool/${poolDetails.id}`), 1500);
       } catch (err) {
         console.error(err);
         setError("Couldn’t join. Please try later.");
       } finally {
         setLoading(false);
         setConfirmOpen(false);
       }
     };
   
     /* -------- auth states -------- */
     if (authLoading)
       return (
         <Container sx={{ textAlign: "center", mt: 4 }}>
           <CircularProgress color="inherit" />
         </Container>
       );
   
     if (!user)
       return (
         <Container maxWidth="sm" sx={{ mt: 4 }}>
           <Paper sx={{ p: 3, textAlign: "center" }}>
             <Typography variant="h5" fontWeight={700} mb={2}>
               Join a Pool
             </Typography>
             <Typography>
               Please{" "}
               <Button component={RouterLink} to="/login" color="brand">
                 log in
               </Button>{" "}
               to continue.
             </Typography>
           </Paper>
         </Container>
       );
   
     /* -------- main form -------- */
     return (
       <Container>
         <FormContainer elevation={3}>
           <Typography variant="h5" fontWeight={700} mb={2}>
             Join a Pool
           </Typography>
   
           {error && (
             <Alert severity="error" sx={{ mb: 2 }}>
               {error}
             </Alert>
           )}
   
           <Snackbar
             open={!!snack}
             autoHideDuration={2500}
             onClose={() => setSnack("")}
             message={snack}
           />
   
           <Box
             component="form"
             onSubmit={handleLookup}
             sx={{ display: "flex", flexDirection: "column", gap: 2 }}
           >
             <TextField
               label="Invite Code"
               value={inviteCode}
               onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
               inputProps={{ maxLength: 8 }}
               required
             />
             <Button
               startIcon={<QrCodeScannerIcon />}
               variant="outlined"
               onClick={() => setQrOpen(true)}
               sx={{ alignSelf: "flex-start" }}
             >
               Scan QR
             </Button>
   
             {poolDetails && (
               <>
                 <Box
                   sx={{
                     p: 2,
                     bgcolor: isDark ? "#2A3B5A" : "#F0F0F0",
                     borderRadius: 2,
                   }}
                 >
                   <Typography>
                     <strong>Pool:</strong> {poolDetails.poolName}
                   </Typography>
                   <Typography>
                     <strong>Sport:</strong> {poolDetails.sport}
                   </Typography>
                   <Typography>
                     <strong>Format:</strong> {poolDetails.format}
                   </Typography>
                 </Box>
   
                 {poolDetails.poolPassword && (
                   <TextField
                     label="Pool Password"
                     type={showPwd ? "text" : "password"}
                     value={poolPassword}
                     onChange={(e) => setPoolPassword(e.target.value)}
                     required
                     InputProps={{
                       endAdornment: (
                         <InputAdornment position="end">
                           <IconButton onClick={() => setShowPwd(!showPwd)}>
                             {showPwd ? <VisibilityOff /> : <Visibility />}
                           </IconButton>
                         </InputAdornment>
                       ),
                     }}
                   />
                 )}
               </>
             )}
   
             <Box sx={{ display: "flex", gap: 2 }}>
               <BrandButton type="submit" disabled={loading}>
                 {loading ? "Searching…" : "Find Pool"}
               </BrandButton>
               <Button onClick={() => navigate("/dashboard")} disabled={loading}>
                 Cancel
               </Button>
             </Box>
           </Box>
         </FormContainer>
   
         {/* ---------- confirm dialog ---------- */}
         <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
           <DialogTitle>Join this pool?</DialogTitle>
           <DialogContent>
             <Typography>
               Join{" "}
               <strong>{poolDetails?.poolName ?? "the selected"} pool</strong>?
             </Typography>
           </DialogContent>
           <DialogActions>
             <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
             <BrandButton onClick={handleJoin} disabled={loading}>
               {loading ? "Joining…" : "Join"}
             </BrandButton>
           </DialogActions>
         </Dialog>
   
         {/* ---------- QR placeholder ---------- */}
         <Dialog open={qrOpen} onClose={() => setQrOpen(false)}>
           <DialogTitle>Scan QR (Coming Soon)</DialogTitle>
           <DialogContent>
             <Typography>
               A camera-based QR scanner will appear here in a future update.
             </Typography>
           </DialogContent>
           <DialogActions>
             <Button onClick={() => setQrOpen(false)}>Close</Button>
           </DialogActions>
         </Dialog>
       </Container>
     );
   }
   