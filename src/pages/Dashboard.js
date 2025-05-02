/* ------------------------------------------------------------
   src/pages/Dashboard.js   – full replacement (copy & paste)
   ------------------------------------------------------------ */
   import React, { useEffect, useRef, useState } from "react";
   import { Link as RouterLink, useNavigate } from "react-router-dom";
   import {
     Box,
     Container,
     Typography,
     Button,
     CircularProgress,
     Alert,
     Fade,
     Grid,
     Card,
     CardContent,
     Link,
     Chip,
     Select,
     MenuItem,
     FormControl,
     InputLabel,
     styled,
     Switch,
     FormControlLabel,
   } from "@mui/material";
   import { useTheme } from "@mui/material/styles";
   import RefreshIcon from "@mui/icons-material/Refresh";
   
   import { useAuth } from "../contexts/AuthContext";
   import { useSubscription } from "../contexts/SubscriptionContext";
   import { useThemeContext } from "../contexts/ThemeContext";
   import { getDb, getAnalyticsService } from "../firebase/config";
   import {
     collection,
     query,
     where,
     orderBy,
     limit,
     onSnapshot,
     doc,
     getDoc,
     startAfter,
   } from "firebase/firestore";
   import { logEvent } from "firebase/analytics";
   
   /* ---------- styled helpers ---------- */
   const DashboardContainer = styled(Box)(({ theme }) => ({
     background:
       theme.palette.mode === "dark"
         ? "linear-gradient(180deg,#1A2A44 0%,#2A3B5A 100%)"
         : "linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)",
     minHeight: "100vh",
     padding: theme.spacing(6, 2, 8),
   }));
   
   const PoolCard = styled(Card)(({ theme }) => ({
     backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
     borderRadius: theme.shape.borderRadius * 2,
     border: `1px solid ${
       theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0"
     }`,
     transition: "transform .3s, box-shadow .3s",
     "&:hover": {
       transform: "scale(1.03)",
       boxShadow: theme.shadows[6],
     },
   }));
   
   const BrandButton = styled(Button)(({ theme }) => ({
     fontWeight: 600,
     textTransform: "none",
     borderRadius: 8,
     backgroundColor: theme.palette.brand.main,
     color: theme.palette.brand.contrastText,
     "&:hover": { backgroundColor: theme.palette.brand.dark },
     "&:disabled": { opacity: 0.5 },
   }));
   
   const ViewLink = styled(Link)(({ theme }) => ({
     color: theme.palette.brand.main,
     fontWeight: 500,
     "&:hover": { color: theme.palette.brand.dark, textDecoration: "underline" },
   }));
   
   const ManageLink = styled(Link)(({ theme }) => ({
     color: theme.palette.success.main,
     fontWeight: 500,
     "&:hover": { color: theme.palette.success.dark, textDecoration: "underline" },
   }));
   
   /* ---------- constants ---------- */
   const PAGE_SIZE = 10;
   
   /* ============================================================ */
   export default function Dashboard() {
     const muiTheme = useTheme(); // for inline Chip color
     const { user, authLoading } = useAuth();
     const { subscriptionTier } = useSubscription();
     const { mode } = useThemeContext();
     const isDark = mode === "dark";
     const navigate = useNavigate();
     const db = getDb();
   
     /* ------------- UI state ------------- */
     const [myPools, setMyPools] = useState([]);
     const [filtered, setFiltered] = useState([]);
     const [loading, setLoading] = useState(true);
     const [loadingMore, setLoadingMore] = useState(false);
     const [error, setError] = useState("");
     const [filterRole, setFilterRole] = useState("all");
     const [sortBy, setSortBy] = useState("createdAt");
     const [lastDoc, setLastDoc] = useState({ commissioner: null, member: null });
     const [hasMore, setHasMore] = useState({ commissioner: true, member: true });
     const [beginner, setBeginner] = useState(
       () => localStorage.getItem("bspBeginner") !== "false"
     );
   
     /* ------------ analytics ------------- */
     const analytics = useRef(getAnalyticsService());
     const logOnce = (evt, data = {}) => {
       const key = `__${evt}`;
       if (!logOnce[key]) {
         logEvent(analytics.current, evt, {
           userId: user?.uid || "anonymous",
           timestamp: new Date().toISOString(),
           ...data,
         });
         logOnce[key] = true;
       }
     };
   
     /* ---------- initial page view ---------- */
     useEffect(() => {
       if (!authLoading) logOnce("dashboard_viewed");
     }, [authLoading]);
   
     /* ---------- Firestore listeners ---------- */
     useEffect(() => {
       if (authLoading) return;
       if (!user) {
         setLoading(false);
         navigate("/login");
         return;
       }
   
       const uid = user.uid;
       const poolsRef = collection(db, "pools");
       const poolsMap = {}; // accumulate pools from both roles
   
       const makeHandler = (role) => (snapshot) => {
         snapshot.docChanges().forEach((chg) => {
           const pid = chg.doc.id;
           if (chg.type === "removed") return delete poolsMap[pid];
           poolsMap[pid] = { id: pid, ...chg.doc.data() };
         });
         setMyPools(Object.values(poolsMap));
         setLastDoc((prev) => ({
           ...prev,
           [role]: snapshot.docs[snapshot.docs.length - 1] || null,
         }));
         setHasMore((prev) => ({
           ...prev,
           [role]: snapshot.docs.length === PAGE_SIZE,
         }));
         setLoading(false);
       };
   
       const qComm = query(
         poolsRef,
         where("commissionerId", "==", uid),
         orderBy("createdAt", "desc"),
         limit(PAGE_SIZE)
       );
       const qMem = query(
         poolsRef,
         where("memberIds", "array-contains", uid),
         orderBy("createdAt", "desc"),
         limit(PAGE_SIZE)
       );
   
       const unsubComm = onSnapshot(qComm, makeHandler("commissioner"));
       const unsubMem = onSnapshot(qMem, makeHandler("member"));
   
       return () => {
         unsubComm();
         unsubMem();
       };
     }, [authLoading, user, navigate, db]);
   
     /* ---------- filter + sort ---------- */
     useEffect(() => {
       let list = [...myPools];
       if (filterRole === "commissioner")
         list = list.filter((p) => p.commissionerId === user.uid);
       if (filterRole === "member")
         list = list.filter((p) => p.commissionerId !== user.uid);
   
       list.sort((a, b) => {
         if (sortBy === "name") return (a.poolName || "").localeCompare(b.poolName || "");
         return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
       });
       setFiltered(list);
     }, [myPools, filterRole, sortBy, user]);
   
     /* ---------- load more ---------- */
     const loadMore = () => {
       if (loadingMore || !user) return;
       setLoadingMore(true);
       logOnce("dashboard_load_more");
   
       const uid = user.uid;
       const poolsRef = collection(db, "pools");
       const newMap = { ...myPools.reduce((m, p) => ({ ...m, [p.id]: p }), {}) };
   
       const tasks = [];
   
       // commissioner page
       if (hasMore.commissioner && lastDoc.commissioner) {
         const q = query(
           poolsRef,
           where("commissionerId", "==", uid),
           orderBy("createdAt", "desc"),
           startAfter(lastDoc.commissioner),
           limit(PAGE_SIZE)
         );
         tasks.push(
           new Promise((res) =>
             onSnapshot(q, (snap) => {
               snap.forEach((d) => (newMap[d.id] = { id: d.id, ...d.data() }));
               setLastDoc((p) => ({ ...p, commissioner: snap.docs[snap.docs.length - 1] || p.commissioner }));
               setHasMore((p) => ({ ...p, commissioner: snap.docs.length === PAGE_SIZE }));
               res();
             })
           )
         );
       }
   
       // member page
       if (hasMore.member && lastDoc.member) {
         const q = query(
           poolsRef,
           where("memberIds", "array-contains", uid),
           orderBy("createdAt", "desc"),
           startAfter(lastDoc.member),
           limit(PAGE_SIZE)
         );
         tasks.push(
           new Promise((res) =>
             onSnapshot(q, (snap) => {
               snap.forEach((d) => (newMap[d.id] = { id: d.id, ...d.data() }));
               setLastDoc((p) => ({ ...p, member: snap.docs[snap.docs.length - 1] || p.member }));
               setHasMore((p) => ({ ...p, member: snap.docs.length === PAGE_SIZE }));
               res();
             })
           )
         );
       }
   
       Promise.all(tasks).then(() => {
         setMyPools(Object.values(newMap));
         setLoadingMore(false);
       });
     };
   
     /* ---------- validate & navigate ---------- */
     const goTo = async (pid, dest, evt) => {
       try {
         const snap = await getDoc(doc(db, "pools", pid));
         if (!snap.exists()) {
           setError("Pool no longer exists.");
           setMyPools((arr) => arr.filter((p) => p.id !== pid));
           return;
         }
         logOnce(evt, { poolId: pid });
         navigate(dest);
       } catch (err) {
         console.error(err);
         setError("Navigation failed. Try again.");
       }
     };
   
     /* ---------- helper toggles ---------- */
     const toggleBeginner = () => {
       const nv = !beginner;
       setBeginner(nv);
       localStorage.setItem("bspBeginner", nv);
       logOnce("dashboard_toggle_beginner", { mode: nv ? "beginner" : "expert" });
     };
   
     /* ---------- gates ---------- */
     if (authLoading || loading)
       return (
         <DashboardContainer>
           <Container sx={{ textAlign: "center", py: 4 }}>
             <CircularProgress />
           </Container>
         </DashboardContainer>
       );
   
     if (error)
       return (
         <DashboardContainer>
           <Container sx={{ py: 4 }}>
             <Alert severity="error" sx={{ mb: 2 }}>
               {error}
               <Button
                 startIcon={<RefreshIcon />}
                 onClick={() => window.location.reload()}
               >
                 Retry
               </Button>
             </Alert>
           </Container>
         </DashboardContainer>
       );
   
     /* ---------- render ---------- */
     return (
       <DashboardContainer>
         <Container maxWidth="lg">
           <Fade in timeout={600}>
             <Box py={4}>
               {/* header row */}
               <Box
                 sx={{
                   display: "flex",
                   justifyContent: "space-between",
                   alignItems: "center",
                   mb: 4,
                   flexWrap: "wrap",
                   gap: 2,
                 }}
               >
                 <Typography variant="h4" fontWeight={700}>
                   My Pools
                 </Typography>
   
                 <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                   <FormControlLabel
                     control={<Switch checked={!beginner} onChange={toggleBeginner} />}
                     label={beginner ? "Beginner Mode" : "Expert Mode"}
                   />
   
                   {!beginner && (
                     <>
                       <FormControl sx={{ minWidth: 120 }}>
                         <InputLabel id="filter-role">Role</InputLabel>
                         <Select
                           labelId="filter-role"
                           value={filterRole}
                           onChange={(e) => {
                             setFilterRole(e.target.value);
                             logOnce("dashboard_filter", { value: e.target.value });
                           }}
                         >
                           <MenuItem value="all">All</MenuItem>
                           <MenuItem value="commissioner">Commissioner</MenuItem>
                           <MenuItem value="member">Member</MenuItem>
                         </Select>
                       </FormControl>
   
                       <FormControl sx={{ minWidth: 120 }}>
                         <InputLabel id="sort-by">Sort</InputLabel>
                         <Select
                           labelId="sort-by"
                           value={sortBy}
                           onChange={(e) => {
                             setSortBy(e.target.value);
                             logOnce("dashboard_sort", { value: e.target.value });
                           }}
                         >
                           <MenuItem value="createdAt">Created Date</MenuItem>
                           <MenuItem value="name">Pool Name</MenuItem>
                         </Select>
                       </FormControl>
                     </>
                   )}
   
                   <BrandButton
                     startIcon={<RefreshIcon />}
                     onClick={() => window.location.reload()}
                   >
                     Refresh
                   </BrandButton>
                   <BrandButton
                     component={RouterLink}
                     to="/create-pool"
                     onClick={() => logOnce("dashboard_create_pool")}
                   >
                     Create Pool
                   </BrandButton>
                   <BrandButton
                     component={RouterLink}
                     to="/join"
                     onClick={() => logOnce("dashboard_join_pool")}
                   >
                     Join Pool
                   </BrandButton>
                 </Box>
               </Box>
   
               {/* pool list */}
               {filtered.length === 0 ? (
                 <Typography sx={{ textAlign: "center", mb: 4 }}>
                   No pools yet — create or join one above!
                 </Typography>
               ) : (
                 <>
                   <Grid container spacing={3}>
                     {filtered.map((p) => {
                       const recent =
                         p.createdAt?.toDate &&
                         Date.now() - p.createdAt.toDate() <
                           7 * 24 * 3600 * 1000;
                       const isCommish = p.commissionerId === user.uid;
                       return (
                         <Grid item xs={12} sm={6} md={4} key={p.id}>
                           <Fade in timeout={800}>
                             <PoolCard>
                               <CardContent>
                                 <Box
                                   sx={{
                                     display: "flex",
                                     justifyContent: "space-between",
                                     mb: 1,
                                   }}
                                 >
                                   <Typography fontWeight={600}>
                                     {p.poolName || "Untitled"}
                                   </Typography>
                                   {recent && (
                                     <Chip
                                       label="New"
                                       size="small"
                                       sx={{
                                         bgcolor: muiTheme.palette.brand.main,
                                         color:
                                           muiTheme.palette.brand.contrastText,
                                       }}
                                     />
                                   )}
                                 </Box>
   
                                 <Typography variant="body2" mb={1}>
                                   {p.sport} / {p.formatName || p.format}
                                 </Typography>
   
                                 <Box
                                   sx={{
                                     display: "flex",
                                     justifyContent: "space-between",
                                     mb: 1,
                                   }}
                                 >
                                   <Typography variant="body2">
                                     Members: {p.memberIds?.length || 1}
                                   </Typography>
                                   <Chip
                                     size="small"
                                     label={p.status}
                                     color={
                                       p.status === "open"
                                         ? "success"
                                         : p.status === "closed"
                                         ? "warning"
                                         : "default"
                                     }
                                   />
                                 </Box>
   
                                 <Box sx={{ display: "flex", gap: 2 }}>
                                   <ViewLink
                                     component="button"
                                     onClick={() =>
                                       goTo(p.id, `/pool/${p.id}`, "dashboard_view_pool")
                                     }
                                   >
                                     View
                                   </ViewLink>
                                   {isCommish && (
                                     <ManageLink
                                       component="button"
                                       onClick={() =>
                                         goTo(
                                           p.id,
                                           `/commissioner/${p.id}`,
                                           "dashboard_manage_pool"
                                         )
                                       }
                                     >
                                       Manage
                                     </ManageLink>
                                   )}
                                 </Box>
                               </CardContent>
                             </PoolCard>
                           </Fade>
                         </Grid>
                       );
                     })}
                   </Grid>
   
                   {(hasMore.commissioner || hasMore.member) && (
                     <Box sx={{ textAlign: "center", mt: 4 }}>
                       <BrandButton onClick={loadMore} disabled={loadingMore}>
                         {loadingMore ? "Loading…" : "Load More"}
                       </BrandButton>
                     </Box>
                   )}
                 </>
               )}
             </Box>
           </Fade>
         </Container>
       </DashboardContainer>
     );
   }
   