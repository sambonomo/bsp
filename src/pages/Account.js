/* --------------------------------------------------------
   src/pages/Account.js        (FULL FILE – ready to paste)
   -------------------------------------------------------- */
   import React, { useState, useEffect, useRef } from "react";
   import { Link as RouterLink, useNavigate }  from "react-router-dom";
   import { doc, getDoc, updateDoc }           from "firebase/firestore";
   import { deleteUser }                       from "firebase/auth";
   
   import { getDb }                 from "../firebase/config";
   import { useAuth }               from "../contexts/AuthContext";
   import { useSubscription }       from "../contexts/SubscriptionContext";
   import { logAnalyticsEvent }     from "../utils/helpers";
   
   /* ---------- MUI ---------- */
   import {
     Box, Typography, Button, Link, Stack, Container, Paper,
     CircularProgress, Alert, Snackbar, Dialog, DialogTitle,
     DialogContent, DialogActions, TextField, Avatar, styled,
   } from "@mui/material";
   
   /* ---------- constants / helpers ---------- */
   const db = getDb();
   
   const StyledAvatar = styled(Avatar)(({ theme }) => ({
     width:  theme.spacing(10),
     height: theme.spacing(10),
     marginBottom: theme.spacing(2),
     backgroundColor: theme.palette.primary.main,
     fontSize: "2rem",
   }));
   
   /* =========================================================
      Component
      ========================================================= */
   export default function Account() {
     /* ─── 1. hooks (all first) ──────────────────────────── */
     const navigate                    = useNavigate();
     const { user, logout, authLoading } = useAuth();
     const {
       subscriptionTier,
       getSubscriptionBenefits,
       upgradeSubscription,
     }                                 = useSubscription();
   
     const [userDoc, setUserDoc]              = useState(null);
     const [error, setError]                  = useState("");
     const [success, setSuccess]              = useState("");
     const [loading, setLoading]              = useState(true);
   
     const [logoutDlg,  setLogoutDlg]  = useState(false);
     const [deleteDlg,  setDeleteDlg]  = useState(false);
     const [editDlg,    setEditDlg]    = useState(false);
     const [newName,    setNewName]    = useState("");
   
     /* ref-flags so we only log once per mount */
     const logged               = useRef({
       page: false,
       logout: false,
       subUpgrade: false,
       name: false,
       delete: false,
     });
   
     /* ---------- retry helper ---------- */
     const withRetry = async (label, fn, max = 3, base = 1_000) => {
       for (let i = 1; i <= max; i += 1) {
         try { return await fn(); }
         catch (err) {
           logAnalyticsEvent("firestore_op_retry", {
             op: label, attempt: i, err: err.message, uid: user?.uid || "anon",
           });
           if (i === max) throw err;
           await new Promise(r => setTimeout(r, base * 2 ** (i - 1)));
         }
       }
     };
   
     /* ─── 2. fetch user-doc ─────────────────────────────── */
     useEffect(() => {
       if (!user) { setLoading(false); return; }
   
       const fetchDoc = async () => {
         try {
           const snap = await withRetry("get_user_doc",
             () => getDoc(doc(db, "users", user.uid)));
           if (snap.exists()) setUserDoc(snap.data());
         } catch (err) {
           setError(`Failed to load profile: ${err.message}`);
           logAnalyticsEvent("get_user_doc_failed", { uid:user.uid, err:err.message });
         } finally {
           setLoading(false);
         }
       };
       fetchDoc();
     }, [user]);
   
     /* log page-view once */
     useEffect(() => {
       if (user && !logged.current.page) {
         logAnalyticsEvent("account_page", { uid: user.uid, tier: subscriptionTier });
         logged.current.page = true;
       }
     }, [user, subscriptionTier]);
   
     /* ─── 3. guards before render ───────────────────────── */
     if (authLoading)             return null;             // App shows splash
     if (!user)                   return null;
     if (loading)                 return (
       <Container maxWidth="sm" sx={{ mt:4, textAlign:"center" }}>
         <CircularProgress size={24} />
       </Container>
     );
   
     /* ─── 4. handlers ──────────────────────────────────── */
     const handleLogout = async () => {
       setError("");
       try {
         await logout();
         if (!logged.current.logout) {
           logAnalyticsEvent("logout", { uid: user.uid });
           logged.current.logout = true;
         }
         navigate("/login");
       } catch (err) {
         setError(`Logout failed: ${err.message}`);
         logAnalyticsEvent("logout_failed", { uid:user.uid, err:err.message });
       }
     };
   
     const handleUpgrade = async (tier) => {
       setError(""); setSuccess("");
       try {
         await upgradeSubscription(tier);
         setSuccess(`Subscription upgraded to ${tier}!`);
         if (!logged.current.subUpgrade) {
           logAnalyticsEvent("sub_upgrade", { uid:user.uid, tier });
           logged.current.subUpgrade = true;
         }
       } catch (err) {
         setError(`Upgrade failed: ${err.message}`);
         logAnalyticsEvent("sub_upgrade_failed", { uid:user.uid, tier, err:err.message });
       }
     };
   
     const handleSaveName = async () => {
       if (!newName.trim()) return setError("Display name cannot be empty.");
       try {
         await withRetry("update_display_name",
           () => updateDoc(doc(db,"users",user.uid), { displayName:newName.trim() }));
         setUserDoc(prev => ({ ...prev, displayName:newName.trim() }));
         setSuccess("Display name updated!");
         setEditDlg(false);
         if (!logged.current.name) {
           logAnalyticsEvent("display_name_updated", { uid:user.uid });
           logged.current.name = true;
         }
       } catch (err) {
         setError(`Update failed: ${err.message}`);
         logAnalyticsEvent("display_name_failed", { uid:user.uid, err:err.message });
       }
     };
   
     const handleDelete = async () => {
       setError("");
       try {
         await withRetry("soft_delete",
           () => updateDoc(doc(db,"users",user.uid), { deletedAt: new Date().toISOString() }));
         await deleteUser(user);
         if (!logged.current.delete) {
           logAnalyticsEvent("account_deleted", { uid:user.uid });
           logged.current.delete = true;
         }
         navigate("/login");
       } catch (err) {
         setError(`Delete failed: ${err.message}`);
         logAnalyticsEvent("account_delete_failed", { uid:user.uid, err:err.message });
       }
     };
   
     /* convenience */
     const benefits = getSubscriptionBenefits();
   
     /* ─── 5. render ─────────────────────────────────────── */
     return (
       <Container maxWidth="sm" sx={{ mt:4 }}>
         <Paper sx={{ p:3 }}>
           <Typography variant="h4" sx={{ mb:2, fontWeight:700, fontFamily:"'Montserrat', sans-serif" }}>
             My Account
           </Typography>
   
           {error   && <Alert severity="error"   sx={{ mb:2 }}>{error}</Alert>}
           <Snackbar
             open={!!success}
             autoHideDuration={3_000}
             onClose={() => setSuccess("")}
             anchorOrigin={{ vertical:"top", horizontal:"center" }}
           >
             <Alert severity="success">{success}</Alert>
           </Snackbar>
   
           {/* profile */}
           <Box sx={{ textAlign:"center", mb:3 }}>
             <StyledAvatar>
               {userDoc?.displayName ? userDoc.displayName[0] : user.email[0]}
             </StyledAvatar>
             <Typography sx={{ mb:1 }}>
               <strong>Display Name:</strong> {userDoc?.displayName || "Not set"}
             </Typography>
             <Button variant="outlined" onClick={()=>{
                 setNewName(userDoc?.displayName || ""); setEditDlg(true);
               }}>
               Edit Display Name
             </Button>
           </Box>
   
           {/* email / sub tier */}
           <Box sx={{ mb:2 }}>
             <Typography><strong>Email:</strong> {user.email}</Typography>
           </Box>
   
           <Box sx={{ mb:2 }}>
             <Typography><strong>Subscription Tier:</strong> {subscriptionTier}</Typography>
             <Typography sx={{ mt:1 }}><strong>Benefits:</strong></Typography>
             <Typography>- Ad Level: {benefits.adLevel}</Typography>
             {benefits.features.length
               ? benefits.features.map(f=> <Typography key={f}>- {f}</Typography>)
               : <Typography>- No additional features</Typography>}
           </Box>
   
           {/* upgrade buttons */}
           <Box sx={{ mb:2 }}>
             <Typography sx={{ mb:1 }}>Upgrade / change tier:</Typography>
             <Stack direction="row" spacing={2}>
               {["Bronze","Silver","Gold"].map(tier=>(
                 <Button key={tier} variant="contained"
                   disabled={subscriptionTier===tier}
                   onClick={()=>handleUpgrade(tier)}>
                   {tier}
                 </Button>
               ))}
             </Stack>
           </Box>
   
           {/* actions */}
           <Box sx={{ mb:2 }}>
             <Typography variant="subtitle1" sx={{ mb:1 }}>Actions</Typography>
             <Stack direction="row" spacing={2}>
               <Button component={RouterLink} to="/change-password" variant="outlined">
                 Change Password
               </Button>
               <Button color="error" variant="outlined" onClick={()=>setDeleteDlg(true)}>
                 Delete Account
               </Button>
               <Button variant="outlined" onClick={()=>setLogoutDlg(true)}>
                 Log Out
               </Button>
             </Stack>
           </Box>
   
           <Box sx={{ mt:3 }}>
             <Typography variant="body2" color="text.secondary">
               Reminder: Bonomo Sports Pools is for entertainment purposes only.
               No real money is exchanged on this site. See our{" "}
               <Link component={RouterLink} to="/tos" underline="hover">
                 Terms & Disclaimers
               </Link>.
             </Typography>
           </Box>
         </Paper>
   
         {/* dialogs */}
         {/* edit name */}
         <Dialog open={editDlg} onClose={()=>setEditDlg(false)}>
           <DialogTitle>Edit Display Name</DialogTitle>
           <DialogContent>
             <TextField fullWidth label="New Display Name" value={newName}
                        onChange={e=>setNewName(e.target.value)} sx={{ mt:1 }}/>
           </DialogContent>
           <DialogActions>
             <Button onClick={()=>setEditDlg(false)}>Cancel</Button>
             <Button onClick={handleSaveName}>Save</Button>
           </DialogActions>
         </Dialog>
   
         {/* logout */}
         <Dialog open={logoutDlg} onClose={()=>setLogoutDlg(false)}>
           <DialogTitle>Confirm Logout</DialogTitle>
           <DialogContent>
             <Typography>Are you sure you want to log out?</Typography>
           </DialogContent>
           <DialogActions>
             <Button onClick={()=>setLogoutDlg(false)}>Cancel</Button>
             <Button onClick={handleLogout}>Log Out</Button>
           </DialogActions>
         </Dialog>
   
         {/* delete */}
         <Dialog open={deleteDlg} onClose={()=>setDeleteDlg(false)}>
           <DialogTitle>Confirm Delete</DialogTitle>
           <DialogContent>
             <Typography>
               Delete your account? <br/>This action cannot be undone.
             </Typography>
           </DialogContent>
           <DialogActions>
             <Button onClick={()=>setDeleteDlg(false)}>Cancel</Button>
             <Button color="error" onClick={handleDelete}>Delete</Button>
           </DialogActions>
         </Dialog>
       </Container>
     );
   }
   