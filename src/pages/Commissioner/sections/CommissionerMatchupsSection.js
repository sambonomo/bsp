/* ------------------------------------------------------------------
   src/pages/Commissioner/sections/CommissionerMatchupsSection.js
   ------------------------------------------------------------------ */
   import React, { useState, useEffect } from "react";
   import {
     collection, onSnapshot, addDoc, deleteDoc, doc,
   } from "firebase/firestore";
   
   import {
     Card, CardContent, Typography, Table, TableBody, TableCell,
     TableHead, TableRow, Button, Alert, CircularProgress,
     Box, Snackbar,
   } from "@mui/material";
   
   import { getDb, getAnalyticsService } from "../../../firebase/config";
   import { logEvent }                     from "firebase/analytics";
   import { fetchSchedule }                from "../../../utils/sportsRadar";
   
   export default function CommissionerMatchupsSection({
     user,            // firebase user
     poolId,          // string
     poolData,        // pool document
   }) {
     /* ────────────────────────────────────────────────────────────
        1.  HOOKS (always at top)
        ─────────────────────────────────────────────────────────── */
     const [games,      setGames]      = useState([]);  // schedule API
     const [matchups,   setMatchups]   = useState([]);  // firestore
     const [loadingAPI, setLoadingAPI] = useState(false);
     const [loadingFB,  setLoadingFB]  = useState(true);
   
     const [message,    setMessage]    = useState("");  // success snackbar
     const [error,      setError]      = useState("");  // error alert
   
     /* ────────────────────────────────────────────────────────────
        2.  DERIVED VALUES
        ─────────────────────────────────────────────────────────── */
     const db             = getDb();
     const analytics      = getAnalyticsService();
     const isCommissioner = poolData?.commissionerId === user?.uid;
   
     /* ────────────────────────────────────────────────────────────
        3.  EARLY RETURN  (after hooks, so ESLint is happy)
        ─────────────────────────────────────────────────────────── */
     if (!isCommissioner) return null;
   
     /* ────────────────────────────────────────────────────────────
        4.  REAL-TIME LISTENER ⇒ existing matchups
        ─────────────────────────────────────────────────────────── */
     useEffect(() => {
       const unsub = onSnapshot(
         collection(db, "pools", poolId, "matchups"),
         (snap) => {
           setMatchups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
           setLoadingFB(false);
         },
         (err) => {
           console.error(err);
           setError("Couldn’t load existing matchups.");
           setLoadingFB(false);
         }
       );
       return () => unsub();
     }, [db, poolId]);
   
     /* ────────────────────────────────────────────────────────────
        5.  FETCH UPCOMING GAMES (Sportradar helper)
        ─────────────────────────────────────────────────────────── */
     useEffect(() => {
       if (!poolData?.sport || !poolData?.season) return;
   
       const fetchGames = async () => {
         setLoadingAPI(true);
         try {
           const upcoming = await fetchSchedule(
             poolData.sport.toLowerCase(),
             poolData.season
           );
           setGames(upcoming);
         } catch (err) {
           console.error(err);
           setError("Couldn’t fetch upcoming games.");
         } finally {
           setLoadingAPI(false);
         }
       };
   
       fetchGames();
     }, [poolData?.sport, poolData?.season]);
   
     /* ────────────────────────────────────────────────────────────
        6.  HANDLERS
        ─────────────────────────────────────────────────────────── */
     const handleAddGame = async (game) => {
       setError(""); setMessage("");
       try {
         const matchup = {
           gameId   : game.id,
           homeTeam : game.home.name,
           awayTeam : game.away.name,
           startTime: game.scheduled,
           status   : "pending",
         };
         await addDoc(collection(db, "pools", poolId, "matchups"), matchup);
   
         setMessage(`Added: ${matchup.awayTeam} @ ${matchup.homeTeam}`);
   
         analytics && logEvent(analytics, "add_matchup", {
           userId: user.uid, poolId, gameId: matchup.gameId, ts: Date.now(),
         });
       } catch (err) {
         console.error(err);
         setError("Failed to add matchup.");
       }
     };
   
     const handleRemoveMatchup = async (matchupId) => {
       setError(""); setMessage("");
       try {
         await deleteDoc(doc(db, "pools", poolId, "matchups", matchupId));
         setMessage("Matchup removed.");
   
         analytics && logEvent(analytics, "remove_matchup", {
           userId: user.uid, poolId, matchupId, ts: Date.now(),
         });
       } catch (err) {
         console.error(err);
         setError("Failed to remove matchup.");
       }
     };
   
     /* ────────────────────────────────────────────────────────────
        7.  UI
        ─────────────────────────────────────────────────────────── */
     return (
       <Card sx={{ mb:3, borderRadius:2, boxShadow:3 }}>
         <CardContent>
           <Typography variant="h6" sx={{ mb:2, fontWeight:600 }}>
             Matchups&nbsp;Management
           </Typography>
   
           {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}
   
           <Snackbar
             open={!!message}
             autoHideDuration={3000}
             onClose={() => setMessage("")}
             anchorOrigin={{ vertical:"top", horizontal:"center" }}
           >
             <Alert severity="success">{message}</Alert>
           </Snackbar>
   
           {/* ── Upcoming Games ─────────────────────────────────── */}
           <Box sx={{ mb:4 }}>
             <Typography variant="subtitle1" sx={{ mb:1, fontWeight:500 }}>
               Upcoming Games — {poolData.sport} {poolData.season}
             </Typography>
   
             {loadingAPI ? (
               <Box sx={{ textAlign:"center" }}>
                 <CircularProgress />
                 <Typography sx={{ mt:1 }}>Fetching games…</Typography>
               </Box>
             ) : games.length === 0 ? (
               <Alert severity="info">No games found.</Alert>
             ) : (
               <Table size="small">
                 <TableHead>
                   <TableRow>
                     <TableCell>Date</TableCell>
                     <TableCell>Matchup</TableCell>
                     <TableCell align="right">Action</TableCell>
                   </TableRow>
                 </TableHead>
                 <TableBody>
                   {games.map((g) => {
                     const dateStr   = new Date(g.scheduled).toLocaleString();
                     const alreadyAdd = matchups.some((m) => m.gameId === g.id);
   
                     return (
                       <TableRow key={g.id}>
                         <TableCell>{dateStr}</TableCell>
                         <TableCell>{g.away.name} @ {g.home.name}</TableCell>
                         <TableCell align="right">
                           <Button
                             variant="contained"
                             disabled={alreadyAdd}
                             onClick={() => handleAddGame(g)}
                           >
                             {alreadyAdd ? "Added" : "Add"}
                           </Button>
                         </TableCell>
                       </TableRow>
                     );
                   })}
                 </TableBody>
               </Table>
             )}
           </Box>
   
           {/* ── Existing Matchups ───────────────────────────────── */}
           <Box>
             <Typography variant="subtitle1" sx={{ mb:1, fontWeight:500 }}>
               Matchups&nbsp;in&nbsp;Your&nbsp;Pool
             </Typography>
   
             {loadingFB ? (
               <CircularProgress />
             ) : matchups.length === 0 ? (
               <Alert severity="info">No matchups yet.</Alert>
             ) : (
               <Table size="small">
                 <TableHead>
                   <TableRow>
                     <TableCell>ID</TableCell>
                     <TableCell>Home vs&nbsp;Away</TableCell>
                     <TableCell>Start</TableCell>
                     <TableCell>Status</TableCell>
                     <TableCell align="right">Remove</TableCell>
                   </TableRow>
                 </TableHead>
                 <TableBody>
                   {matchups.map((m) => (
                     <TableRow key={m.id}>
                       <TableCell>{m.id}</TableCell>
                       <TableCell>{m.homeTeam} vs {m.awayTeam}</TableCell>
                       <TableCell>
                         {m.startTime ? new Date(m.startTime).toLocaleString() : "—"}
                       </TableCell>
                       <TableCell>{m.status}</TableCell>
                       <TableCell align="right">
                         <Button
                           variant="outlined"
                           color="error"
                           onClick={() => handleRemoveMatchup(m.id)}
                         >
                           Remove
                         </Button>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             )}
           </Box>
         </CardContent>
       </Card>
     );
   }
   