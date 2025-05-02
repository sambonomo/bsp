/* ------------------------------------------------------------------
   src/pages/Commissioner/sections/CommissionerBrandingSection.js
   ------------------------------------------------------------------ */
   import React, { useState, useEffect } from "react";
   import { doc, updateDoc }           from "firebase/firestore";
   import {
     Card, CardContent, Typography, Stack, TextField, Button, Alert,
     Box, InputLabel, CircularProgress,
   } from "@mui/material";
   import { getDb }                    from "../../../firebase/config";
   import { logEvent }                 from "firebase/analytics";
   
   /* ───────── helper ───────── */
   const isValidURL = (s) => {
     try { return !!s && new URL(s); } catch { return false; }
   };
   
   export default function CommissionerBrandingSection({
     user,              // current Firebase user
     poolId,            // string : Firestore doc id
     poolData,          // object : pool document
     analytics = null,  // firebase analytics instance (optional)
   }) {
     /* ────────────────────────────────────────────────────────────
        1.  HOOKS  (always at the very top!)
        ─────────────────────────────────────────────────────────── */
     const [loading,  setLoading]  = useState(!poolData); // wait for parent to supply poolData
     const [error,    setError]    = useState("");
     const [success,  setSuccess]  = useState("");
     const [saving,   setSaving]   = useState(false);
   
     /* local editable fields */
     const themeDefault   = poolData?.theme || {};
     const [primaryColor,  setPrimary]   = useState(themeDefault.primaryColor  || "#1976d2");
     const [secondaryColor,setSecondary] = useState(themeDefault.secondaryColor|| "#9c27b0");
     const [logoURL,       setLogoURL]   = useState(themeDefault.logoURL       || "");
   
     /* keep “loading” flag in sync if parent loads later */
     useEffect(() => { setLoading(!poolData); }, [poolData]);
   
     /* ────────────────────────────────────────────────────────────
        2.  DERIVED BOOLEANS
        ─────────────────────────────────────────────────────────── */
     const db              = getDb();
     const isCommissioner  = poolData?.commissionerId === user?.uid;
   
     /* ────────────────────────────────────────────────────────────
        3.  EARLY RETURNS  ( after all hooks! )
        ─────────────────────────────────────────────────────────── */
     if (loading) {
       return (
         <Card sx={{ mb:3, borderRadius:2 }}>
           <CardContent sx={{ textAlign:"center" }}>
             <CircularProgress size={24} />
           </CardContent>
         </Card>
       );
     }
     if (!isCommissioner) return null;   // hide section for non-commissioners
   
     /* ────────────────────────────────────────────────────────────
        4.  HANDLERS
        ─────────────────────────────────────────────────────────── */
     const handleSave = async () => {
       setError(""); setSuccess(""); setSaving(true);
   
       if (logoURL && !isValidURL(logoURL)) {
         setError("Please enter a valid logo URL (e.g. https://example.com/logo.png)");
         setSaving(false);
         return;
       }
   
       try {
         const update = {
           theme: {
             primaryColor,
             secondaryColor,
             logoURL: logoURL.trim(),
           },
         };
         await updateDoc(doc(db, "pools", poolId), update);
         setSuccess("Branding updated!");
   
         analytics && logEvent(analytics, "update_branding", {
           userId : user.uid,
           poolId,
           ...update.theme,
           ts: Date.now(),
         });
       } catch (e) {
         setError(e.message || "Failed to update branding.");
       } finally {
         setSaving(false);
       }
     };
   
     /* ────────────────────────────────────────────────────────────
        5.  UI
        ─────────────────────────────────────────────────────────── */
     return (
       <Card sx={{ mb:3, borderRadius:2, boxShadow:3 }}>
         <CardContent>
           <Typography variant="h6" sx={{ mb:2, fontWeight:600 }}>
             Pool&nbsp;Branding
           </Typography>
   
           {error   && <Alert severity="error"   sx={{ mb:2 }}>{error}</Alert>}
           {success && <Alert severity="success" sx={{ mb:2 }}>{success}</Alert>}
   
           <Stack spacing={2} sx={{ mb:3 }}>
             {/* PRIMARY COLOR -------------------------------------------------- */}
             <Box>
               <InputLabel htmlFor="primary-color">Primary&nbsp;Color</InputLabel>
               <Box sx={{ display:"flex", alignItems:"center", gap:2 }}>
                 <input
                   id="primary-color" type="color"
                   value={primaryColor}
                   onChange={(e)=>setPrimary(e.target.value)}
                   style={{ width:50, height:50, cursor:"pointer" }}
                 />
                 <Typography>{primaryColor}</Typography>
               </Box>
             </Box>
   
             {/* SECONDARY COLOR ------------------------------------------------ */}
             <Box>
               <InputLabel htmlFor="secondary-color">Secondary&nbsp;Color</InputLabel>
               <Box sx={{ display:"flex", alignItems:"center", gap:2 }}>
                 <input
                   id="secondary-color" type="color"
                   value={secondaryColor}
                   onChange={(e)=>setSecondary(e.target.value)}
                   style={{ width:50, height:50, cursor:"pointer" }}
                 />
                 <Typography>{secondaryColor}</Typography>
               </Box>
             </Box>
   
             {/* LOGO URL ------------------------------------------------------- */}
             <TextField
               label="Logo URL"
               fullWidth
               value={logoURL}
               onChange={(e)=>setLogoURL(e.target.value)}
               placeholder="https://example.com/logo.png"
             />
           </Stack>
   
           {/* live preview ----------------------------------------------------- */}
           <Box
             sx={{
               p:3, mt:2, borderRadius:2,
               bgcolor: primaryColor,
               border: `3px solid ${secondaryColor}`,
               color:"#fff", textAlign:"center",
             }}
           >
             <Typography>Preview</Typography>
             {logoURL && (
               <img
                 src={logoURL}
                 alt="Logo preview"
                 style={{ maxHeight:60, marginTop:8 }}
                 onError={() => setError("The logo URL could not be loaded.")}
               />
             )}
           </Box>
   
           {/* SAVE BUTTON ------------------------------------------------------ */}
           <Box sx={{ mt:3 }}>
             <Button variant="contained" disabled={saving} onClick={handleSave}>
               {saving ? "Saving…" : "Save Branding"}
             </Button>
           </Box>
         </CardContent>
       </Card>
     );
   }
   