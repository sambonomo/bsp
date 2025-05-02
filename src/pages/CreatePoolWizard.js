/* ------------------------------------------------------------------
   src/pages/CreatePoolWizard.js   (FULL FILE – ready to paste)
   ------------------------------------------------------------------ */
   import React, { useState, useEffect, useRef } from "react";
   import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
   import {
     Box, Container, Typography, TextField, Alert, Button,
     Stepper, Step, StepLabel, Card, Grid, Fade, Snackbar,
     CircularProgress, styled,
   } from "@mui/material";
   import ShareIcon               from "@mui/icons-material/Share";
   import SportsFootballIcon      from "@mui/icons-material/SportsFootball";
   import SportsBaseballIcon      from "@mui/icons-material/SportsBaseball";
   import SportsBasketballIcon    from "@mui/icons-material/SportsBasketball";
   import SportsHockeyIcon        from "@mui/icons-material/SportsHockey";
   import SchoolIcon              from "@mui/icons-material/School";
   import SportsGolfIcon          from "@mui/icons-material/SportsGolf";
   import DirectionsCarIcon       from "@mui/icons-material/DirectionsCar";
   import MoreHorizIcon           from "@mui/icons-material/MoreHoriz";
   
   import { useThemeContext }     from "../contexts/ThemeContext";
   import { useAuth }             from "../contexts/AuthContext";
   import { getDb }               from "../firebase/config";
   import {
     runTransaction, doc, collection, serverTimestamp,
     writeBatch, updateDoc, arrayUnion,
   } from "firebase/firestore";
   import { validatePoolName as validatePoolNameFn } from "../utils/validations";
   import {
     generateInviteCode,
     logAnalyticsEvent,
   } from "../utils/helpers";
   
   /* ────────────────────────────────────────────────────────────────
      1.  Styled helpers
      ─────────────────────────────────────────────────────────────── */
   const WizardContainer = styled(Box)(({ theme }) => ({
     background: theme.palette.mode === "dark"
       ? "linear-gradient(180deg,#1A2A44 0%,#2A3B5A 100%)"
       : "linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)",
     minHeight: "100vh",
     padding   : theme.spacing(6, 2, 8),
   }));
   
   const StyledStepper = styled(Stepper)(({ theme }) => ({
     "& .MuiStepLabel-label.Mui-active"    : { color: theme.palette.brand.main, fontWeight: 600 },
     "& .MuiStepLabel-label.Mui-completed" : { color: theme.palette.brand.main },
     "& .MuiStepIcon-root.Mui-active"      : { color: theme.palette.brand.main },
     "& .MuiStepIcon-root.Mui-completed"   : { color: theme.palette.brand.main },
   }));
   
   const SelectionCard = styled(Card)(({ theme, selected }) => ({
     cursor : "pointer",
     padding: theme.spacing(3),
     textAlign : "center",
     borderRadius: theme.shape.borderRadius * 2,
     border     : selected
       ? `2px solid ${theme.palette.brand.main}`
       : `1px solid ${theme.palette.divider}`,
     transition : "transform .3s, box-shadow .3s",
     "&:hover"  : { transform: "scale(1.04)", boxShadow: theme.shadows[6] },
   }));
   
   const StyledButton = styled(Button)(({ theme }) => ({
     backgroundColor: theme.palette.brand.main,
     color: theme.palette.brand.contrastText,
     fontWeight: 600,
     "&:hover": { backgroundColor: theme.palette.brand.dark },
   }));
   
   /* ────────────────────────────────────────────────────────────────
      2.  Constants
      ─────────────────────────────────────────────────────────────── */
   const STEPS   = ["Sport", "Format", "Name", "Review", "Invite"];
   const SPORTS  = [
     { key:"nfl",   name:"NFL",        icon:SportsFootballIcon },
     { key:"mlb",   name:"MLB",        icon:SportsBaseballIcon },
     { key:"nba",   name:"NBA",        icon:SportsBasketballIcon },
     { key:"nhl",   name:"NHL",        icon:SportsHockeyIcon },
     { key:"ncaaf", name:"College FB", icon:SchoolIcon },
     { key:"ncaab", name:"College BB", icon:SchoolIcon },
     { key:"golf",  name:"PGA",        icon:SportsGolfIcon },
     { key:"nascar",name:"NASCAR",     icon:DirectionsCarIcon },
     { key:"other", name:"Other",      icon:MoreHorizIcon },
   ];
   const FORMATS = [
     { key:"squares",     name:"Squares",     desc:"Classic 10×10 grid." },
     { key:"strip_cards", name:"Strip Cards", desc:"Number strip pool." },
     { key:"pickem",      name:"Pick’Em",     desc:"Pick winners weekly." },
     { key:"survivor",    name:"Survivor",    desc:"One pick per week." },
   ];
   
   /* ────────────────────────────────────────────────────────────────
      3.  Main component
      ─────────────────────────────────────────────────────────────── */
   export default function CreatePoolWizard() {
     /* — context / services — */
     const { mode }    = useThemeContext();
     const { user, authLoading } = useAuth();
     const navigate    = useNavigate();
     const location    = useLocation();
     const db          = getDb();
     const isDark      = mode === "dark";
   
     /* — UI state — */
     const [step,  setStep]     = useState(0);
     const [sport,setSport]     = useState(null);
     const [format,setFormat]   = useState(null);
     const [poolName,setPoolName]=useState("");
     const [error,setError]     = useState("");
     const [snack,setSnack]     = useState("");
     const [creating,setCreating]= useState(false);
     const [poolId,setPoolId]   = useState(null);
     const [inviteCode,setInviteCode] = useState(null);
   
     /* — navigation guard — */
     useEffect(() => {
       if (!authLoading && !user) navigate("/login");
     }, [authLoading, user, navigate]);
   
     /* — pre-select sport (optional) — */
     useEffect(() => {
       const pre = location.state?.sport;
       if (pre && !sport) {
         const found = SPORTS.find((s) => s.key === pre);
         if (found) {
           setSport(found);
           setStep(1);
           logAnalyticsEvent("sport_preselected", { sport: pre });
         }
       }
     }, [location.state, sport]);
   
     /* ────────────────────────────────────────────────────────────
        3A.  step navigation helpers
     ──────────────────────────────────────────────────────────── */
     const next = () => setStep((p)=>p+1);
     const back = () => setStep((p)=>p-1);
   
     const validateAndNext = () => {
       setError("");
       if (step === 0 && !sport)  return setError("Pick a sport first.");
       if (step === 1 && !format) return setError("Select a format.");
       if (step === 2) {
         const clean = poolName.trim();
         const err   = validatePoolNameFn(clean);
         if (err) return setError(err);
         setPoolName(clean);
       }
       next();
     };
   
     /* ────────────────────────────────────────────────────────────
        4.  Create Pool (Firestore)
     ──────────────────────────────────────────────────────────── */
     const createPool = async () => {
       if (!user) return setError("You must be logged in.");
       setCreating(true); setError("");
   
       try {
         /* a) generate invite code locally (crypto-safe) */
         let code;
         try { code = generateInviteCode(); }
         catch { code = Math.random().toString(36).slice(2,8).toUpperCase(); }
   
         setInviteCode(code);
   
         /* b) assemble doc */
         const poolRef = doc(collection(db, "pools"));
         const poolDoc = {
           poolName, sport: sport.key, format: format.key,
           createdAt: serverTimestamp(),
           commissionerId: user.uid,
           memberIds: [user.uid],
           inviteCode: code,
           status: "open",
         };
   
         /* c) write in one transaction */
         await runTransaction(db, (tx) => { tx.set(poolRef, poolDoc); });
   
         /* d) pre-seed squares grid if needed */
         if (format.key === "squares") {
           const batch = writeBatch(db);
           const squaresCol = collection(db, "pools", poolRef.id, "squares");
           for (let r=0;r<10;r+=1)
             for (let c=0;c<10;c+=1)
               batch.set(doc(squaresCol), { row:r, col:c, status:"available" });
           await batch.commit();
         }
   
         /* e) mark commissioner badge on user */
         await updateDoc(doc(db,"users",user.uid), {
           badges: arrayUnion("commissioner"),
         }).catch(()=>{});
   
         setPoolId(poolRef.id);
         logAnalyticsEvent("pool_created", { sport:sport.key, format:format.key });
         next();
       } catch (e) {
         console.error(e);
         setError("Couldn’t create the pool, please retry.");
       } finally { setCreating(false); }
     };
   
     /* ────────────────────────────────────────────────────────────
        5.  Invite helpers
     ──────────────────────────────────────────────────────────── */
     const inviteURL = inviteCode
       ? `${window.location.origin}/join?code=${inviteCode}`
       : "";
   
     const shareInvite = () => {
       if (!inviteCode) return;
       const data = {
         title:`Join my ${format.name} pool!`,
         text :`Hop in my ${sport.name} ${format.name} pool.`,
         url  :inviteURL,
       };
       if (navigator.share) {
         navigator.share(data)
           .then(()=>logAnalyticsEvent("invite_shared",{via:"web_share"}))
           .catch(()=>{});
       } else {
         navigator.clipboard.writeText(inviteURL)
           .then(()=>setSnack("Link copied!"))
           .then(()=>logAnalyticsEvent("invite_shared",{via:"clipboard"}))
           .catch(()=>setError("Copy failed – copy manually."));
       }
     };
   
     /* ────────────────────────────────────────────────────────────
        6.  Per-step UI blocks
     ──────────────────────────────────────────────────────────── */
     const stepContent = () => {
       switch(step){
         /* sport */
         case 0:
           return (
             <Grid container spacing={3} justifyContent="center">
               {SPORTS.map((s)=>(
                 <Grid item xs={6} sm={4} md={3} key={s.key}>
                   <Fade in timeout={500}>
                     <SelectionCard
                       role="button" aria-label={`Select ${s.name}`}
                       selected={sport?.key===s.key}
                       onClick={()=>{ setSport(s); logAnalyticsEvent("sport_selected",{sport:s.key}); next(); }}
                     >
                       <s.icon sx={{ fontSize:40, mb:1, color:"brand.main" }} />
                       <Typography fontWeight={600}>{s.name}</Typography>
                     </SelectionCard>
                   </Fade>
                 </Grid>
               ))}
             </Grid>
           );
   
         /* format */
         case 1:
           return (
             <Grid container spacing={3} justifyContent="center">
               {FORMATS.map((f)=>(
                 <Grid item xs={6} sm={4} md={3} key={f.key}>
                   <Fade in timeout={500}>
                     <SelectionCard
                       role="button" aria-label={`Select ${f.name}`}
                       selected={format?.key===f.key}
                       onClick={()=>{ setFormat(f); logAnalyticsEvent("format_selected",{format:f.key}); next(); }}
                     >
                       <Typography variant="h6" fontWeight={700} color="brand.main">{f.name}</Typography>
                       <Typography variant="body2">{f.desc}</Typography>
                     </SelectionCard>
                   </Fade>
                 </Grid>
               ))}
             </Grid>
           );
   
         /* name */
         case 2:
           return (
             <TextField
               autoFocus fullWidth
               label="Pool Name" value={poolName}
               onChange={(e)=>setPoolName(e.target.value)}
               helperText="Keep it short & memorable."
             />
           );
   
         /* review */
         case 3:
           return (
             <Box>
               <Typography><strong>Sport:</strong> {sport.name}</Typography>
               <Typography><strong>Format:</strong> {format.name}</Typography>
               <Typography sx={{ mb:2 }}><strong>Name:</strong> {poolName}</Typography>
               <Alert severity="info">You can tweak advanced rules later in the Commissioner Dashboard.</Alert>
             </Box>
           );
   
         /* invite */
         case 4:
           return (
             <Box textAlign="center">
               <Typography variant="h4" fontWeight={700} mb={2}>Pool Created!</Typography>
               {inviteCode && (
                 <>
                   <Typography mb={1}>Share this link or QR code:</Typography>
                   <TextField fullWidth value={inviteURL} InputProps={{readOnly:true}} sx={{ mb:2 }} />
                   <img
                     src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteURL)}`}
                     alt="Pool invite QR"
                     style={{ marginBottom:16 }}
                   />
                   <StyledButton startIcon={<ShareIcon />} onClick={shareInvite}>
                     Share Invite
                   </StyledButton>
                 </>
               )}
               <Box mt={3} display="flex" gap={2} justifyContent="center">
                 <StyledButton component={RouterLink} to="/dashboard">Dashboard</StyledButton>
                 {poolId && (
                   <StyledButton component={RouterLink} to={`/pool/${poolId}`}>
                     Go to Pool
                   </StyledButton>
                 )}
               </Box>
             </Box>
           );
   
         default: return null;
       }
     };
   
     /* ────────────────────────────────────────────────────────────
        7.  Top-level render
     ──────────────────────────────────────────────────────────── */
     if (authLoading) {
       return (
         <WizardContainer>
           <Container sx={{ textAlign:"center", py:4 }}>
             <CircularProgress />
           </Container>
         </WizardContainer>
       );
     }
   
     return (
       <WizardContainer>
         <Container maxWidth="md">
           <Fade in timeout={500}>
             <Box>
               <Typography variant="h4" fontWeight={700} mb={4} textAlign="center">
                 Create a Pool
               </Typography>
   
               <StyledStepper activeStep={step} alternativeLabel sx={{ mb:4 }}>
                 {STEPS.map((label)=>(<Step key={label}><StepLabel>{label}</StepLabel></Step>))}
               </StyledStepper>
   
               {error && <Alert severity="error" sx={{ mb:3 }}>{error}</Alert>}
   
               {/* content card */}
               <Box sx={{
                 p:4, borderRadius:3,
                 bgcolor: isDark ? "#2A3B5A" : "#fff",
                 border:`1px solid ${isDark?"#3A4B6A":"#E0E0E0"}`,
               }}>
                 {stepContent()}
               </Box>
   
               {/* nav buttons */}
               {step < 4 && (
                 <Box mt={4} display="flex" justifyContent="space-between">
                   {step>0 ? (
                     <Button variant="outlined" onClick={back} aria-label="Go to previous step">Back</Button>
                   ) : <span/>}
   
                   {step===3 ? (
                     <StyledButton disabled={creating} onClick={createPool} aria-label="Create pool">
                       {creating ? <>Creating…&nbsp;<CircularProgress size={18} sx={{ ml:1 }}/></> : "Create Pool"}
                     </StyledButton>
                   ) : (
                     <StyledButton onClick={validateAndNext} aria-label="Go to next step">
                       Next
                     </StyledButton>
                   )}
                 </Box>
               )}
             </Box>
           </Fade>
         </Container>
   
         <Snackbar open={!!snack} autoHideDuration={3000} onClose={()=>setSnack("")} message={snack} />
       </WizardContainer>
     );
   }
   