/* ------------------------------------------------------------------
   src/pages/Commissioner/pages/CommissionerOverviewPage.js
   ------------------------------------------------------------------ */
   import React from "react";
   import {
     Box,
     Typography,
     Stack,
     CircularProgress,
     Alert,
   } from "@mui/material";
   import { useOutletContext } from "react-router-dom";
   
   /**
    * Commissioner Overview
    * (Receives { user, poolData, loading, error } from CommissionerLayout via <Outlet context={…} />)
    */
   export default function CommissionerOverviewPage() {
     /* ── 1. context from <Outlet /> ─────────────────────────── */
     const { user, poolData, loading, error } = useOutletContext() || {};
   
     /* ── 2. early-return guards ─────────────────────────────── */
     if (loading) {
       return (
         <Box sx={{ textAlign: "center", py: 4 }}>
           <CircularProgress size={28} />
         </Box>
       );
     }
   
     if (error) {
       return (
         <Alert severity="error" sx={{ my: 2 }}>
           {error}
         </Alert>
       );
     }
   
     if (!poolData) return null; // nothing yet (should be rare)
   
     /* ── 3. derived helpers ─────────────────────────────────── */
     const createdAt = poolData.createdAt?.seconds
       ? new Date(poolData.createdAt.seconds * 1000).toLocaleString()
       : "—";
   
     /* ── 4. UI ──────────────────────────────────────────────── */
     return (
       <Box>
         <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>
           Commissioner&nbsp;Overview
         </Typography>
   
         <Typography sx={{ mb: 3 }}>
           Hey&nbsp;
           <strong>{user?.displayName || "Commissioner"}</strong>!
           &nbsp;Use the left-hand menu to manage every aspect of your pool.
         </Typography>
   
         <Stack spacing={1}>
           <Typography variant="subtitle1">
             <strong>Pool&nbsp;Name:</strong>&nbsp;{poolData.poolName}
           </Typography>
           <Typography variant="subtitle1">
             <strong>Sport&nbsp;/&nbsp;Format:</strong>&nbsp;
             {poolData.sport} / {poolData.formatName || poolData.format}
           </Typography>
           <Typography variant="subtitle1">
             <strong>Status:</strong>&nbsp;{poolData.status}
           </Typography>
           <Typography variant="subtitle1">
             <strong>Members:</strong>&nbsp;{poolData.memberIds?.length || 1}
           </Typography>
           <Typography variant="subtitle1">
             <strong>Created:</strong>&nbsp;{createdAt}
           </Typography>
         </Stack>
       </Box>
     );
   }
   