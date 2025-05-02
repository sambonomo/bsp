/* ------------------------------------------------------------------
   src/pages/Commissioner/sections/CommissionerRulesSection.js
   ------------------------------------------------------------------ */
   import React, { useState, useEffect } from "react";
   import {
     Card, CardContent, Typography, Alert,
     FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
     Button, CircularProgress, Box,
   } from "@mui/material";
   import { doc, updateDoc } from "firebase/firestore";
   
   import { getDb }       from "../../../firebase/config";
   import { shuffleArray} from "../../../utils/helpers";
   
   /* ────────────────────────────────────────────────────────────
      Commissioner  •  Rules Section
      ─────────────────────────────────────────────────────────── */
   export default function CommissionerRulesSection({
     user,
     poolId,
     poolData,
   }) {
     /* ── 1. HOOKS ───────────────────────────────────────────── */
     const [loading, setLoading] = useState(!poolData);
   
     /* form fields (default to existing rules or sensible fallbacks) */
     const [winCondition, setWinCondition] =
       useState(poolData?.rules?.winCondition ?? "lastDigit");
   
     const [matchRule,    setMatchRule] =
       useState(poolData?.rules?.matchRule    ?? "sumLastDigit");
   
     /* feedback */
     const [err, setErr] = useState("");
     const [msg, setMsg] = useState("");
     const [busy,setBusy]= useState(false);
   
     /* derived */
     const db         = getDb();
     const isCommish  = poolData?.commissionerId === user?.uid;
   
     /* parent might pass poolData later */
     useEffect(() => {
       if (poolData) {
         setWinCondition(poolData.rules?.winCondition ?? "lastDigit");
         setMatchRule(poolData.rules?.matchRule     ?? "sumLastDigit");
         setLoading(false);
       }
     }, [poolData]);
   
     /* ── 2. EARLY RETURNS ── (after hooks) ──────────────────── */
     if (!isCommish) return null;
   
     if (loading) {
       return (
         <Card sx={{ mb:3 }}><CardContent sx={{textAlign:"center"}}>
           <CircularProgress size={24}/>
         </CardContent></Card>
       );
     }
   
     /* ── 3. HANDLERS ────────────────────────────────────────── */
     const saveRules = async () => {
       setErr(""); setMsg(""); setBusy(true);
       try {
         await updateDoc(doc(db,"pools",poolId),{
           rules:{ winCondition, matchRule },
         });
         setMsg("Rules saved!");
       } catch (e) { setErr(e.message || "Failed to save rules."); }
       finally     { setBusy(false); }
     };
   
     const reassignDigits = async () => {
       setErr(""); setMsg(""); setBusy(true);
       try {
         const digits = [0,1,2,3,4,5,6,7,8,9];
         await updateDoc(doc(db,"pools",poolId),{
           axisNumbers:{ x: shuffleArray(digits), y: shuffleArray(digits) },
         });
         setMsg("Grid digits reassigned!");
       } catch (e) { setErr(e.message || "Failed to reassign digits."); }
       finally     { setBusy(false); }
     };
   
     /* ── 4. UI ──────────────────────────────────────────────── */
     return (
       <Card sx={{ mb:3, borderRadius:2, boxShadow:3 }}>
         <CardContent>
           <Typography variant="h6" sx={{ mb:2, fontWeight:600 }}>
             Pool&nbsp;Rules
           </Typography>
   
           {err && <Alert severity="error"   sx={{ mb:2 }}>{err}</Alert>}
           {msg && <Alert severity="success" sx={{ mb:2 }}>{msg}</Alert>}
   
           {/* ── Squares-specific settings ───────────────────── */}
           {poolData.format === "squares" && (
             <>
               <FormControl sx={{ mb:2 }}>
                 <FormLabel>Squares — Win&nbsp;Condition</FormLabel>
                 <RadioGroup
                   row
                   value={winCondition}
                   onChange={(e)=>setWinCondition(e.target.value)}
                 >
                   <FormControlLabel value="lastDigit"  control={<Radio/>} label="Last Digit"/>
                   <FormControlLabel value="exactScore" control={<Radio/>} label="Exact Score"/>
                 </RadioGroup>
               </FormControl>
   
               <Button
                 variant="contained"
                 sx={{ mr:2 }}
                 disabled={busy}
                 onClick={reassignDigits}
               >
                 {busy ? "Working…" : "Reassign Grid Digits"}
               </Button>
             </>
           )}
   
           {/* ── Strip-Cards settings ────────────────────────── */}
           {poolData.format === "strip_cards" && (
             <FormControl sx={{ mb:2 }}>
               <FormLabel>Strip Cards — Match&nbsp;Rule</FormLabel>
               <RadioGroup
                 row
                 value={matchRule}
                 onChange={(e)=>setMatchRule(e.target.value)}
               >
                 <FormControlLabel value="sumLastDigit"        control={<Radio/>} label="Sum Last Digit"/>
                 <FormControlLabel value="individualLastDigit" control={<Radio/>} label="Individual Last Digit"/>
               </RadioGroup>
             </FormControl>
           )}
   
           {/* ── Save button for whichever format ─────────────── */}
           <Button variant="contained" disabled={busy} onClick={saveRules}>
             {busy ? "Saving…" : "Save Rules"}
           </Button>
         </CardContent>
       </Card>
     );
   }
   