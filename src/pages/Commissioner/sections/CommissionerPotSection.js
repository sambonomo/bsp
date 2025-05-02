/* ------------------------------------------------------------------
   src/pages/Commissioner/sections/CommissionerPotSection.js
   ------------------------------------------------------------------ */
   import React, { useState, useEffect } from "react";
   import { doc, updateDoc }            from "firebase/firestore";
   import {
     Card, CardContent, Typography, Stack, TextField,
     Button, Alert, Box, CircularProgress,
   } from "@mui/material";
   
   import { getDb }                     from "../../../firebase/config";
   import {
     validateBuyInAmount,
     validatePayoutStructure,
   }                                   from "../../../utils/validations";
   
   export default function CommissionerPotSection({
     user,      // firebase user
     poolId,    // string
     poolData,  // pool document
   }) {
     /* ────────────────────────────────────────────────────────────
        1.  HOOKS
        ─────────────────────────────────────────────────────────── */
     const [loading, setLoading] = useState(!poolData);
   
     /* editable fields */
     const [totalPot, setTotalPot] = useState(
       poolData?.totalPot ? String(poolData.totalPot) : ""
     );
     const [q1,    setQ1]    = useState(poolData?.payoutStructure?.q1 ?? 0.2);
     const [q2,    setQ2]    = useState(poolData?.payoutStructure?.q2 ?? 0.2);
     const [q3,    setQ3]    = useState(poolData?.payoutStructure?.q3 ?? 0.2);
     const [final, setFinal] = useState(poolData?.payoutStructure?.final ?? 0.4);
   
     /* feedback */
     const [error, setError] = useState("");
     const [msg,   setMsg]   = useState("");
   
     /* derived */
     const db          = getDb();
     const isCommish   = poolData?.commissionerId === user?.uid;
   
     /* when parent hands poolData later */
     useEffect(() => {
       if (poolData) {
         setTotalPot(poolData.totalPot ? String(poolData.totalPot) : "");
         setQ1(poolData.payoutStructure?.q1 ?? 0.2);
         setQ2(poolData.payoutStructure?.q2 ?? 0.2);
         setQ3(poolData.payoutStructure?.q3 ?? 0.2);
         setFinal(poolData.payoutStructure?.final ?? 0.4);
         setLoading(false);
       }
     }, [poolData]);
   
     /* ────────────────────────────────────────────────────────────
        2.  EARLY RETURNS (after hooks)
        ─────────────────────────────────────────────────────────── */
     if (!isCommish) return null;               // hide for non-commissioners
   
     if (loading) {
       return (
         <Card sx={{ mb:3, borderRadius:2 }}>
           <CardContent sx={{ textAlign:"center" }}>
             <CircularProgress size={24} />
           </CardContent>
         </Card>
       );
     }
   
     /* ────────────────────────────────────────────────────────────
        3.  HANDLERS
        ─────────────────────────────────────────────────────────── */
     const handleUpdatePot = async () => {
       setError(""); setMsg("");
   
       /* validation */
       const valErr = validateBuyInAmount(totalPot);
       if (valErr) return setError(valErr);
   
       /* parse   (allow literal "donations only") */
       const value =
         totalPot.trim().toLowerCase() === "donations only"
           ? "donations only"
           : parseFloat(totalPot);
   
       try {
         await updateDoc(doc(db, "pools", poolId), { totalPot: value });
         setMsg("Total pot updated!");
       } catch (e) {
         setError(e.message || "Failed to update pot.");
       }
     };
   
     const handleUpdatePayouts = async () => {
       setError(""); setMsg("");
   
       const structure = {
         q1   : parseFloat(q1),
         q2   : parseFloat(q2),
         q3   : parseFloat(q3),
         final: parseFloat(final),
       };
   
       const valErr = validatePayoutStructure(structure);
       if (valErr) return setError(valErr);
   
       try {
         await updateDoc(doc(db, "pools", poolId), { payoutStructure: structure });
         setMsg("Payout structure updated!");
       } catch (e) {
         setError(e.message || "Failed to update payouts.");
       }
     };
   
     /* ────────────────────────────────────────────────────────────
        4.  UI
        ─────────────────────────────────────────────────────────── */
     return (
       <Card sx={{ mb:3, borderRadius:2, boxShadow:3 }}>
         <CardContent>
   
           <Typography variant="h6" sx={{ mb:2, fontWeight:600 }}>
             Pot&nbsp;&amp;&nbsp;Payouts
           </Typography>
   
           {error && <Alert severity="error"   sx={{ mb:2 }}>{error}</Alert>}
           {msg   && <Alert severity="success" sx={{ mb:2 }}>{msg}</Alert>}
   
           {/* ── Total Pot ─────────────────────────────────────── */}
           <Box sx={{ mb:3 }}>
             <Typography variant="subtitle1" sx={{ mb:1 }}>Total&nbsp;Pot</Typography>
             <Stack direction="row" spacing={2} alignItems="center">
               <TextField
                 size="small"
                 value={totalPot}
                 onChange={(e) => setTotalPot(e.target.value)}
                 placeholder='e.g. "100" or "Donations only"'
               />
               <Button variant="contained" onClick={handleUpdatePot}>
                 Update&nbsp;Pot
               </Button>
             </Stack>
           </Box>
   
           {/* ── Payout Structure ──────────────────────────────── */}
           <Typography variant="subtitle1" sx={{ mb:1 }}>
             Payouts (fractions of&nbsp;1.0)
           </Typography>
   
           <Stack
             direction={{ xs:"column", sm:"row" }}
             spacing={2}
             sx={{ mb:2 }}
           >
             <TextField label="Q1"    size="small" type="number"
                        value={q1}    onChange={(e)=>setQ1(e.target.value)} />
             <TextField label="Q2"    size="small" type="number"
                        value={q2}    onChange={(e)=>setQ2(e.target.value)} />
             <TextField label="Q3"    size="small" type="number"
                        value={q3}    onChange={(e)=>setQ3(e.target.value)} />
             <TextField label="Final" size="small" type="number"
                        value={final} onChange={(e)=>setFinal(e.target.value)} />
           </Stack>
   
           <Button variant="contained" onClick={handleUpdatePayouts}>
             Update&nbsp;Payouts
           </Button>
         </CardContent>
       </Card>
     );
   }
   