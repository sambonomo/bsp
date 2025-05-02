/* --------------------------------------------------------
   src/pages/Commissioner/pages/CommissionerPotPage.js
   -------------------------------------------------------- */

   import React, { useEffect, useRef, useState } from "react";
   import { useParams }                 from "react-router-dom";
   import { doc, getDoc }               from "firebase/firestore";
   import {
     Container,
     CircularProgress,
     Alert,
     Fade,
     Box,
     Typography,
   } from "@mui/material";
   
   import { getDb, getAnalyticsService } from "../../../firebase/config";
   import { logEvent }                   from "firebase/analytics";
   import { useAuth }                    from "../../../contexts/AuthContext";
   
   import CommissionerPotSection         from "../sections/CommissionerPotSection";
   
   export default function CommissionerPotPage() {
     /* ---------- basic hooks ---------- */
     const { poolId }      = useParams();
     const { user }        = useAuth();
     const db              = getDb();
   
     /* ---------- local state ---------- */
     const [poolData, setPoolData] = useState(null);
     const [loading,  setLoading]  = useState(true);
     const [error,    setError]    = useState("");
   
     /* ---------- analytics ---------- */
     const analytics      = getAnalyticsService();
     const hasLoggedView  = useRef(false);
   
     /* ---------- fetch pool once ---------- */
     useEffect(() => {
       if (!poolId) {
         setError("No pool id provided.");
         setLoading(false);
         return;
       }
   
       const fetchPool = async () => {
         try {
           const snap = await getDoc(doc(db, "pools", poolId));
           if (!snap.exists()) {
             setError("Pool not found.");
           } else {
             setPoolData(snap.data());
   
             if (!hasLoggedView.current && analytics) {
               logEvent(analytics, "commissioner_pot_page_viewed", {
                 userId: user?.uid || "anonymous",
                 poolId,
                 timestamp: new Date().toISOString(),
               });
               hasLoggedView.current = true;
             }
           }
         } catch (err) {
           console.error("CommissionerPotPage – fetch error:", err);
           setError("Failed to load pool data. Please try again.");
         } finally {
           setLoading(false);
         }
       };
   
       fetchPool();
     }, [db, poolId, analytics, user]);
   
     /* ---------- early returns ---------- */
     if (loading) {
       return (
         <Container maxWidth="md" sx={{ textAlign: "center", py: 4 }}>
           <CircularProgress aria-label="Loading pot & payout data" />
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
   
     /* ---------- permission guard ---------- */
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
   
     /* ---------- render section ---------- */
     return (
       <Container maxWidth="md" sx={{ py: 2, pb: 6 }}>
         <Fade in timeout={700}>
           <Box>
             <CommissionerPotSection
               user={user}
               poolId={poolId}
               poolData={poolData}
             />
           </Box>
         </Fade>
       </Container>
     );
   }
   