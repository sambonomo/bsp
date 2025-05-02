/* ------------------------------------------------------------------
   src/pages/Commissioner/sections/CommissionerExtraToolsSection.js
   ------------------------------------------------------------------ */
   import React, { useState, useEffect } from "react";
   import {
     Card, CardContent, Typography, TextField, Button, Alert,
     Box, Stack, CircularProgress,
   } from "@mui/material";
   import { doc, updateDoc, arrayUnion } from "firebase/firestore";
   import { getDb }         from "../../../firebase/config";
   import { logEvent }      from "firebase/analytics";
   import { shuffleArray }  from "../../../utils/helpers";
   
   /* helper to build shuffled digits 0-9 once */
   const randomDigits = () => shuffleArray([0,1,2,3,4,5,6,7,8,9]);
   
   export default function CommissionerExtraToolsSection({
     user,              // firebase user
     poolId,            // string
     poolData,          // pool doc
     analytics = null,  // firebase analytics instance (optional)
   }) {
     /* ────────────────────────────────────────────────────────────
        1.  HOOKS
        ─────────────────────────────────────────────────────────── */
     const [loading,      setLoading]      = useState(!poolData);
   
     /* feedback */
     const [error,        setError]        = useState("");
     const [success,      setSuccess]      = useState("");
   
     /* offline user */
     const [offlineName,  setOfflineName]  = useState("");
     const [adding,       setAdding]       = useState(false);
   
     /* lock-pool & special settings */
     const [locking,      setLocking]      = useState(false);
     const [startDate,    setStartDate]    = useState(poolData?.startDate || "");
     const [gridSize,     setGridSize]     = useState(poolData?.gridSize  || 100);
     const [savingSpec,   setSavingSpec]   = useState(false);
   
     /* sync with parent when poolData arrives later */
     useEffect(() => { setLoading(!poolData); }, [poolData]);
   
     /* ────────────────────────────────────────────────────────────
        2.  DERIVED VALUES
        ─────────────────────────────────────────────────────────── */
     const db              = getDb();
     const isCommissioner  = poolData?.commissionerId === user?.uid;
   
     /* ────────────────────────────────────────────────────────────
        3.  EARLY RETURNS  (after hooks!)
        ─────────────────────────────────────────────────────────── */
     if (loading) {
       return (
         <Card sx={{ mb:3 }}><CardContent sx={{ textAlign:"center" }}>
           <CircularProgress size={24} />
         </CardContent></Card>
       );
     }
     if (!isCommissioner) return null;
   
     /* ────────────────────────────────────────────────────────────
        4.  HANDLERS
        ─────────────────────────────────────────────────────────── */
   
     /** add a pseudo-member for cash / offline players */
     const handleAddOffline = async () => {
       if (!offlineName.trim()) { setError("Offline user name is required."); return; }
   
       setError(""); setSuccess(""); setAdding(true);
       try {
         const pseudoId = `offline_${Date.now()}`;
   
         await updateDoc(doc(db, "pools", poolId), {
           memberIds   : arrayUnion(pseudoId),
           offlineUsers: arrayUnion({ id:pseudoId, name:offlineName.trim() }),
         });
   
         setSuccess(`Offline user “${offlineName}” added!`);
         setOfflineName("");
   
         analytics && logEvent(analytics, "add_offline_user", {
           userId: user.uid, poolId, pseudoId, ts: Date.now(),
         });
       } catch (e) { setError(e.message || "Failed to add user."); }
       finally    { setAdding(false); }
     };
   
     /** lock pool & optionally assign digits / strip numbers */
     const handleLockPool = async () => {
       if (poolData.status === "locked") { setError("Pool is already locked."); return; }
   
       setError(""); setSuccess(""); setLocking(true);
       try {
         const updates = { status: "locked" };
   
         /* squares → assign axis digits if missing */
         if (poolData.format === "squares" && !poolData.axisNumbers) {
           updates.axisNumbers = { x: randomDigits(), y: randomDigits() };
         }
   
         /* strip cards → assign 10 shuffled digits once */
         if (poolData.format === "strip_cards" && !poolData.stripNumbers) {
           updates.stripNumbers = randomDigits();
         }
   
         await updateDoc(doc(db, "pools", poolId), updates);
         setSuccess("Pool locked and numbers revealed!");
   
         analytics && logEvent(analytics, "lock_pool", {
           userId: user.uid, poolId, format: poolData.format, ts: Date.now(),
         });
       } catch (e) { setError(e.message || "Failed to lock pool."); }
       finally    { setLocking(false); }
     };
   
     /** save miscellaneous “special” fields */
     const handleSaveSpecial = async () => {
       setError(""); setSuccess(""); setSavingSpec(true);
       try {
         await updateDoc(doc(db, "pools", poolId), {
           startDate: startDate || "",
           gridSize : parseInt(gridSize, 10),
         });
         setSuccess("Special settings saved.");
       } catch (e) { setError(e.message || "Update failed."); }
       finally    { setSavingSpec(false); }
     };
   
     /* ────────────────────────────────────────────────────────────
        5.  UI
        ─────────────────────────────────────────────────────────── */
     return (
       <Card sx={{ mb:3, borderRadius:2, boxShadow:3 }}>
         <CardContent>
           <Typography variant="h6" sx={{ mb:2, fontWeight:600 }}>
             Extra&nbsp;Commissioner&nbsp;Tools
           </Typography>
   
           {error   && <Alert severity="error"   sx={{ mb:2 }}>{error}</Alert>}
           {success && <Alert severity="success" sx={{ mb:2 }}>{success}</Alert>}
   
           {/* ── Offline user ─────────────────────────────────────── */}
           <Box sx={{ mb:4 }}>
             <Typography variant="subtitle1" sx={{ mb:1, fontWeight:500 }}>
               Add&nbsp;Offline&nbsp;User
             </Typography>
             <Stack direction="row" spacing={2} alignItems="center">
               <TextField
                 size="small" label="Name"
                 value={offlineName}
                 onChange={(e)=>setOfflineName(e.target.value)}
               />
               <Button
                 variant="contained" disabled={adding}
                 onClick={handleAddOffline}
               >
                 {adding ? "Adding…" : "Add Offline User"}
               </Button>
             </Stack>
           </Box>
   
           {/* ── Lock pool ────────────────────────────────────────── */}
           {poolData.status !== "locked" ? (
             <Box sx={{ mb:4 }}>
               <Typography variant="subtitle1" sx={{ mb:1, fontWeight:500 }}>
                 Lock&nbsp;Pool
               </Typography>
               <Button variant="contained" disabled={locking} onClick={handleLockPool}>
                 {locking ? "Locking…" : "Lock Pool & Reveal"}
               </Button>
             </Box>
           ) : (
             <Alert severity="info" sx={{ mb:4 }}>Pool is already locked.</Alert>
           )}
   
           {/* ── Misc “special” settings ─────────────────────────── */}
           <Box>
             <Typography variant="subtitle1" sx={{ mb:1, fontWeight:500 }}>
               Special&nbsp;Settings
             </Typography>
             <Stack
               spacing={2}
               direction={{ xs:"column", sm:"row" }}
               alignItems="center"
             >
               <TextField
                 label="Start Date" type="date" size="small"
                 value={startDate}
                 onChange={(e)=>setStartDate(e.target.value)}
                 InputLabelProps={{ shrink:true }}
               />
               <TextField
                 label="Grid Size" type="number" size="small"
                 value={gridSize}
                 onChange={(e)=>setGridSize(e.target.value)}
               />
               <Button
                 variant="contained"
                 disabled={savingSpec}
                 onClick={handleSaveSpecial}
               >
                 {savingSpec ? "Saving…" : "Save Settings"}
               </Button>
             </Stack>
           </Box>
         </CardContent>
       </Card>
     );
   }
   