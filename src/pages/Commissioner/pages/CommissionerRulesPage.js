/* -----------------------------------------------------------------------
   src/pages/Commissioner/pages/CommissionerRulesPage.js
   ----------------------------------------------------------------------- */

   import React, { useEffect, useRef, useState } from "react";
   import { useParams }                 from "react-router-dom";
   import { doc, getDoc }               from "firebase/firestore";
   import {
     Container,
     CircularProgress,
     Typography,
     Alert,
     Fade,
     Box,
   } from "@mui/material";
   
   import { getDb, getAnalyticsService } from "../../../firebase/config";
   import { logEvent }                   from "firebase/analytics";
   import { useAuth }                    from "../../../contexts/AuthContext";
   
   import CommissionerRulesSection       from "../sections/CommissionerRulesSection";
   
   export default function CommissionerRulesPage() {
     /* ─────────── helpers ─────────── */
     const { poolId } = useParams();
     const { user }   = useAuth();
     const db         = getDb();
   
     /* ─────────── local state ──────── */
     const [poolData, setPoolData] = useState(null);
     const [loading,  setLoading]  = useState(true);
     const [error,    setError]    = useState("");
   
     /* ─────────── analytics ────────── */
     const analytics     = getAnalyticsService();
     const loggedViewRef = useRef(false);
   
     /* ─────────── fetch once ───────── */
     useEffect(() => {
       if (!poolId) {
         setError("No pool id provided.");
         setLoading(false);
         return;
       }
   
       (async () => {
         try {
           const snap = await getDoc(doc(db, "pools", poolId));
           if (!snap.exists()) {
             setError("Pool not found.");
           } else {
             const data = snap.data();
             setPoolData(data);
   
             if (!loggedViewRef.current && analytics) {
               logEvent(analytics, "commissioner_rules_page_viewed", {
                 userId: user?.uid || "anonymous",
                 poolId,
                 timestamp: new Date().toISOString(),
               });
               loggedViewRef.current = true;
             }
           }
         } catch (err) {
           console.error("CommissionerRulesPage – fetch error:", err);
           setError("Failed to load pool data. Please try again.");
         } finally {
           setLoading(false);
         }
       })();
     }, [db, poolId, analytics, user]);
   
     /* ─────────── early exits ──────── */
     if (loading) {
       return (
         <Container maxWidth="md" sx={{ py: 4, textAlign: "center" }}>
           <CircularProgress aria-label="Loading rules data" />
           <Typography sx={{ mt: 2 }}>Loading…</Typography>
         </Container>
       );
     }
   
     if (error) {
       return (
         <Container maxWidth="md" sx={{ py: 4 }}>
           <Alert severity="error">{error}</Alert>
         </Container>
       );
     }
   
     /* ─────────── permission guard ─── */
     const isCommissioner = poolData?.commissionerId === user?.uid;
     if (!isCommissioner) {
       return (
         <Container maxWidth="md" sx={{ py: 4 }}>
           <Alert severity="error">
             You do not have permission to manage this pool.
           </Alert>
         </Container>
       );
     }
   
     /* ─────────── render page ──────── */
     return (
       <Container maxWidth="md" sx={{ py: 2, pb: 6 }}>
         <Fade in timeout={700}>
           <Box>
             <CommissionerRulesSection
               user={user}
               poolId={poolId}
               poolData={poolData}
               analytics={analytics}
             />
           </Box>
         </Fade>
       </Container>
     );
   }
   