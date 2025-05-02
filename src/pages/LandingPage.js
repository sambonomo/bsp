/* ------------------------------------------------------------------
   src/pages/LandingPage.js   (FULL FILE – ready to paste)
   ------------------------------------------------------------------ */
   import React, { useEffect, useState, useRef } from "react";
   import { Link as RouterLink, useNavigate } from "react-router-dom";
   import {
     Box,
     Container,
     Typography,
     Button,
     Grid,
     Paper,
     Fade,
     Tooltip,
     IconButton,
     Table,
     TableBody,
     TableCell,
     TableHead,
     TableRow,
     Dialog,
     DialogContent,
     Stack,
     useMediaQuery,
     Zoom,
     styled,
   } from "@mui/material";
   import { keyframes, useTheme } from "@mui/material/styles";
   
   /*  🌲  Tree-shaken icon imports */
   import ArrowDownwardIcon  from "@mui/icons-material/ArrowDownward";
   import PersonAddIcon       from "@mui/icons-material/PersonAdd";
   import GroupAddIcon        from "@mui/icons-material/GroupAdd";
   import EmojiEventsIcon     from "@mui/icons-material/EmojiEvents";
   import SportsFootballIcon  from "@mui/icons-material/SportsFootball";
   import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
   import SportsHockeyIcon    from "@mui/icons-material/SportsHockey";
   import SportsBaseballIcon  from "@mui/icons-material/SportsBaseball";
   import SportsGolfIcon      from "@mui/icons-material/SportsGolf";
   import DirectionsCarIcon   from "@mui/icons-material/DirectionsCar";
   import PlayCircleOutline   from "@mui/icons-material/PlayCircleOutline";
   import CloseIcon           from "@mui/icons-material/Close";
   
   import { useInView }       from "react-intersection-observer";
   import { useAuth }         from "../contexts/AuthContext";
   import { useThemeContext } from "../contexts/ThemeContext";
   import { getAnalyticsService } from "../firebase/config";
   import { logEvent }        from "firebase/analytics";
   
   /* ────────────────────────────────────────────────────────── *
    *  Styled helpers
    * ────────────────────────────────────────────────────────── */
   const HeroBox = styled(Box)(({ theme }) => ({
     position: "relative",
     overflow: "hidden",
     "&:before": {
       content: '""',
       position: "absolute",
       inset: 0,
       background:
         theme.palette.mode === "dark"
           ? "radial-gradient(circle at 50% 30%,rgba(255,255,255,.12) 0%,rgba(255,255,255,0) 70%)"
           : "radial-gradient(circle at 50% 30%,rgba(0,0,0,.04) 0%,rgba(0,0,0,0) 70%)",
     },
   }));
   
   const StepBadge = styled(Box)(({ tier }) => ({
     width: 60,
     height: 60,
     borderRadius: "50%",
     color: "#0B162A",
     fontWeight: 700,
     fontSize: "1.2rem",
     display: "flex",
     alignItems: "center",
     justifyContent: "center",
     margin: "0 auto 16px",
     backgroundColor:
       tier === "Bronze" ? "#CD7F32" : tier === "Silver" ? "#C0C0C0" : "#FFD700",
   }));
   
   const SportCard = styled(Paper)(({ theme }) => ({
     cursor: "pointer",
     display: "flex",
     flexDirection: "column",
     alignItems: "center",
     justifyContent: "center",
     padding: theme.spacing(2),
     borderRadius: theme.shape.borderRadius * 2,
     transition: "transform .25s, box-shadow .25s",
     "&:hover, &:focus-visible": {
       transform: "scale(1.06)",
       boxShadow: theme.shadows[6],
       outline: "none",
     },
   }));
   
   const SectionContainer = styled(Container)(({ theme }) => ({
     borderRadius: theme.shape.borderRadius * 3,
     padding: theme.spacing(4),
     position: "relative",
     zIndex: 1,
   }));
   
   /* sticky CTA pulse (runs ONCE) */
   const pulse = keyframes`
     0%   { transform:translateY(0);}
     30%  { transform:translateY(-4px);}
     60%  { transform:translateY(0);}
   `;
   
   const StickyButton = styled(Button)(({ theme }) => ({
     position: "fixed",
     bottom: 20,
     right: 20,
     zIndex: 1100,
     backgroundColor: theme.palette.mode === "dark" ? "#FFD700" : "#D4A017",
     color: "#0B162A",
     fontWeight: 600,
     borderRadius: 8,
     boxShadow: "0 4px 12px rgba(0,0,0,.25)",
     "&:hover": {
       backgroundColor: theme.palette.mode === "dark" ? "#FFEB3B" : "#E0B030",
     },
   }));
   
   /* ────────────────────────────────────────────────────────── *
    *  Component
    * ────────────────────────────────────────────────────────── */
   export default function LandingPage() {
     const { user }  = useAuth();
     const { mode }  = useThemeContext();
     const theme     = useTheme();
     const isDark    = mode === "dark";
     const downSm    = useMediaQuery(theme.breakpoints.down("sm"));
     const navigate  = useNavigate();
   
     /* UI state */
     const [showSticky, setShowSticky] = useState(false);
     const [videoOpen , setVideoOpen]  = useState(false);
   
     /* analytics helpers */
     const analytics = useRef(null);
     const logged    = useRef({});
   
     const logOnce = (event, data = {}) => {
       if (!logged.current[event] && analytics.current) {
         logEvent(analytics.current, event, {
           userId: user?.uid || "anonymous",
           ts: Date.now(),
           ...data,
         });
         logged.current[event] = true;
       }
     };
   
     /* mount */
     useEffect(() => {
       analytics.current = getAnalyticsService();
       logOnce("landing_page_viewed");
     }, []);
   
     /* scroll reveal sticky CTA */
     useEffect(() => {
       const onScroll = () => setShowSticky(window.scrollY > 320);
       window.addEventListener("scroll", onScroll);
       return () => window.removeEventListener("scroll", onScroll);
     }, []);
   
     /* refs for smooth scroll */
     const howItWorksRef = useRef(null);
     const scrollToHowItWorks = () => {
       howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
       logOnce("learn_more_clicked");
     };
   
     /* sport quick-select */
     const handleSport = (sportKey) => {
       logOnce("sport_selected", { sport: sportKey });
       navigate("/create-pool", { state: { sport: sportKey } });
     };
   
     /* ────────────────────────────────────────────────────────── *
      *  Render
      * ────────────────────────────────────────────────────────── */
     return (
       <Box sx={{ bgcolor: isDark ? "#1A2A44" : "#F5F5F5", minHeight: "100vh" }}>
         {/* ───────── HERO ───────── */}
         <HeroBox
           sx={{
             textAlign: "center",
             py: { xs: 10, md: 14 },
             px: { xs: 3, md: 5 },
             background: isDark
               ? "linear-gradient(90deg,#1A2A44 0%,#2A3B5A 100%)"
               : "linear-gradient(90deg,#F5F5F5 0%,#E0E0E0 100%)",
           }}
         >
           <Fade in timeout={800}>
             <Container maxWidth="lg">
               <Typography
                 component="h1"
                 variant={downSm ? "h3" : "h2"}
                 sx={{ fontWeight: 800, lineHeight: 1.15, mb: 2 }}
               >
                 Run every office&nbsp;or sports pool&nbsp;in&nbsp;
                 <Box component="span" sx={{ color: "brand.main" }}>3&nbsp;minutes.</Box>
               </Typography>
   
               <Typography
                 variant="h6"
                 sx={{
                   maxWidth: 720,
                   mx: "auto",
                   mb: 4,
                   color: isDark ? "#B0BEC5" : "#555",
                 }}
               >
                 Create a pool, invite friends &nbsp;– free forever on Bronze tier.
               </Typography>
   
               {/* CTA buttons */}
               <Stack
                 direction={{ xs: "column", sm: "row" }}
                 spacing={2}
                 justifyContent="center"
                 alignItems="center"
               >
                 <Button
                   component={RouterLink}
                   to="/create-pool"
                   variant="contained"
                   sx={{
                     bgcolor: isDark ? "#FFD700" : "#D4A017",
                     color: "#0B162A",
                     fontWeight: 600,
                     px: 4,
                     py: 1.6,
                     "&:hover": { bgcolor: isDark ? "#FFEB3B" : "#E0B030" },
                   }}
                   onClick={() => logOnce("create_pool_clicked")}
                 >
                   Create Pool
                 </Button>
   
                 <Button
                   component={RouterLink}
                   to="/join"
                   variant="outlined"
                   sx={{
                     color: isDark ? "#fff" : "#0B162A",
                     borderColor: isDark ? "#fff" : "#0B162A",
                     fontWeight: 600,
                     px: 4,
                     py: 1.6,
                     "&:hover": {
                       bgcolor: isDark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.05)",
                     },
                   }}
                   onClick={() => logOnce("join_pool_clicked")}
                 >
                   Join Pool
                 </Button>
   
                 <Button
                   variant="text"
                   sx={{ fontWeight: 600 }}
                   onClick={() => {
                     setVideoOpen(true);
                     logOnce("watch_demo_clicked");
                   }}
                 >
                   Watch Demo
                 </Button>
               </Stack>
   
               {/* social proof logos */}
               <Stack
                 direction="row"
                 spacing={4}
                 justifyContent="center"
                 sx={{ mt: 4 }}
               >
                 {["/img/nfl.svg", "/img/espn.svg", "/img/google.svg"].map((src) => (
                   <Box
                     key={src}
                     component="img"
                     src={src}
                     alt=""
                     sx={{ height: 28, opacity: 0.65 }}
                   />
                 ))}
               </Stack>
   
               {/* scroll cue */}
               <Tooltip title="Scroll to How It Works" arrow>
                 <IconButton
                   onClick={scrollToHowItWorks}
                   sx={{ mt: 8, color: isDark ? "#FFD700" : "#D4A017" }}
                   aria-label="Scroll to how it works"
                 >
                   <ArrowDownwardIcon fontSize="large" />
                 </IconButton>
               </Tooltip>
             </Container>
           </Fade>
         </HeroBox>
   
         {/* ───────── HOW IT WORKS ───────── */}
         <Box
           ref={howItWorksRef}
           sx={{ bgcolor: isDark ? "#2A3B5A" : "#E0E0E0", py: { xs: 8, md: 10 }, px: 2 }}
         >
           <SectionContainer maxWidth="lg">
             <Typography variant="h3" sx={{ textAlign: "center", fontWeight: 700, mb: 6 }}>
               How it works
             </Typography>
   
             <Grid container spacing={4} justifyContent="center">
               {[
                 { tier:"Bronze", title:"Sign up – free",           icon:<PersonAddIcon  sx={{ fontSize:50,color:"#CD7F32" }} /> },
                 { tier:"Silver", title:"Create or join in seconds", icon:<GroupAddIcon   sx={{ fontSize:50,color:"#C0C0C0" }} /> },
                 { tier:"Gold",   title:"Compete & win",             icon:<EmojiEventsIcon sx={{ fontSize:50,color:isDark?"#FFD700":"#D4A017" }} /> },
               ].map((s,i)=>(
                 <Grid item xs={12} sm={4} key={s.title}>
                   <Fade in timeout={800+i*200}>
                     <Paper sx={{ p:4, textAlign:"center", bgcolor:isDark?"#1A2A44":"#fff" }} elevation={3}>
                       <StepBadge tier={s.tier}>{i+1}</StepBadge>
                       {s.icon}
                       <Typography variant="h6" sx={{ mt:2 }}>{s.title}</Typography>
                     </Paper>
                   </Fade>
                 </Grid>
               ))}
             </Grid>
           </SectionContainer>
         </Box>
   
         {/* ───────── WHY BSP / comparison ───────── */}
         <Box sx={{ bgcolor:isDark?"#1A2A44":"#F5F5F5", py:{xs:8,md:10}, px:2 }}>
           <SectionContainer maxWidth="lg">
             <Typography variant="h3" sx={{ textAlign:"center", fontWeight:700, mb:6 }}>
               Why choose BSP?
             </Typography>
   
             <Grid container spacing={4}>
               {[
                 { title:"All major sports", icon:<SportsFootballIcon sx={{ fontSize:50,color:isDark?"#FFD700":"#D4A017" }} />, desc:"NFL, NBA, NHL, MLB, PGA, NASCAR & more." },
                 { title:"Gamification built-in", icon:<EmojiEventsIcon sx={{ fontSize:50,color:isDark?"#FFD700":"#D4A017" }} />, desc:"Badges, streaks & achievements out-of-the-box." },
                 { title:"Free forever tier", icon:<GroupAddIcon       sx={{ fontSize:50,color:isDark?"#FFD700":"#D4A017" }} />, desc:"Host up to 3 pools with ads – no credit card." },
               ].map((f,i)=>(
                 <Grid item xs={12} sm={4} key={f.title}>
                   <Fade in timeout={800+i*200}>
                     <Paper sx={{ p:4, textAlign:"center", bgcolor:isDark?"#2A3B5A":"#fff" }} elevation={2}>
                       {f.icon}
                       <Typography variant="h6" sx={{ mt:2, mb:1 }}>{f.title}</Typography>
                       <Typography variant="body2" sx={{ color:"#B0BEC5" }}>{f.desc}</Typography>
                     </Paper>
                   </Fade>
                 </Grid>
               ))}
             </Grid>
   
             {/* micro comparison */}
             <Box sx={{ mt:8, overflowX:"auto" }}>
               <Table size="small" aria-label="Feature comparison table">
                 <TableHead>
                   <TableRow>
                     <TableCell />
                     <TableCell align="center" sx={{ fontWeight:700 }}>BSP</TableCell>
                     <TableCell align="center">RunYourPool</TableCell>
                     <TableCell align="center">EasyOfficePools</TableCell>
                   </TableRow>
                 </TableHead>
                 <TableBody>
                   {[
                     ["Free Tier",               "✅","❌","❌"],
                     ["Built-in Gamification",   "✅","❌","❌"],
                     ["AI Bracket Insights*",    "🚀","❌","❌"],
                     ["Live Score API",          "✅","✅","✅"],
                     ["Unlimited Members (Paid)","✅","✅","✅"],
                   ].map(row=>(
                     <TableRow key={row[0]}>
                       {row.map((cell,idx)=>(
                         <TableCell key={idx} align={idx===0?"left":"center"} sx={{ fontWeight:idx===0?600:400 }}>
                           {cell}
                         </TableCell>
                       ))}
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
               <Typography variant="caption" sx={{ mt:1, display:"block", textAlign:"right" }}>
                 *Coming soon
               </Typography>
             </Box>
           </SectionContainer>
         </Box>
   
         {/* ───────── SPORT QUICK PICK ───────── */}
         <Box sx={{ bgcolor:isDark?"#2A3B5A":"#E0E0E0", py:{xs:8,md:10}, px:2 }}>
           <SectionContainer maxWidth="lg">
             <Typography variant="h3" sx={{ textAlign:"center", fontWeight:700, mb:6 }}>
               Pick your sport & go
             </Typography>
   
             <Grid container spacing={3} justifyContent="center">
               {[
                 { name:"NFL",   key:"nfl",   icon:SportsFootballIcon   },
                 { name:"NBA",   key:"nba",   icon:SportsBasketballIcon },
                 { name:"NHL",   key:"nhl",   icon:SportsHockeyIcon     },
                 { name:"MLB",   key:"mlb",   icon:SportsBaseballIcon   },
                 { name:"PGA",   key:"pga",   icon:SportsGolfIcon       },
                 { name:"NASCAR",key:"nascar",icon:DirectionsCarIcon    },
               ].map((s,i)=>(
                 <Grid item xs={6} sm={4} md={2} key={s.key}>
                   <Fade in timeout={600+i*120}>
                     <Tooltip title={`Start a ${s.name} pool`} arrow>
                       <SportCard
                         onClick={()=>handleSport(s.key)}
                         onKeyDown={e=>e.key==="Enter"&&handleSport(s.key)}
                         tabIndex={0}
                         role="button"
                         aria-label={`Start a ${s.name} pool`}
                       >
                         <Box sx={{
                           width:60,height:60,borderRadius:"50%",
                           bgcolor:isDark?"#3A4B6A":"#F0F0F0",
                           display:"flex",alignItems:"center",justifyContent:"center",mb:2
                         }}>
                           <s.icon sx={{ fontSize:36, color:isDark?"#FFD700":"#D4A017" }} />
                         </Box>
                         <Typography variant="body2">{s.name}</Typography>
                       </SportCard>
                     </Tooltip>
                   </Fade>
                 </Grid>
               ))}
             </Grid>
           </SectionContainer>
         </Box>
   
         {/* ───────── GAMIFICATION BANNER ───────── */}
         <Box sx={{ bgcolor:isDark?"#FFD700":"#D4A017", color:"#0B162A", py:{xs:6,md:8}, textAlign:"center" }}>
           <Container maxWidth="sm">
             <EmojiEventsIcon sx={{ fontSize:60, mb:2 }} />
             <Typography variant="h4" sx={{ fontWeight:700, mb:1 }}>
               Unlock the “Commissioner” badge!
             </Typography>
             <Typography sx={{ mb:3 }}>
               Create your first pool today & earn your first achievement.
             </Typography>
             <Button
               component={RouterLink}
               to="/create-pool"
               variant="contained"
               sx={{ bgcolor:"#0B162A", color:"#fff", fontWeight:600,
                     "&:hover":{ bgcolor:"#14305a" } }}
               onClick={()=>logOnce("commissioner_badge_cta")}
             >
               Create my pool
             </Button>
           </Container>
         </Box>
   
         {/* ───────── Sticky CTA ───────── */}
         <Fade in={showSticky}>
           <StickyButton
             component={RouterLink}
             to="/create-pool"
             onClick={()=>logOnce("sticky_cta_clicked")}
             sx={{
               ...(showSticky && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
                 ? { animation:`${pulse} 650ms ease-in-out 1 4s forwards` }
                 : {}
               ),
             }}
           >
             Start a Pool
           </StickyButton>
         </Fade>
   
         {/* ───────── DEMO VIDEO (lazy) ───────── */}
         <Dialog
           open={videoOpen}
           onClose={()=>setVideoOpen(false)}
           maxWidth="md"
           fullWidth
           aria-labelledby="demo-video-title"
         >
           <DialogContent sx={{ p:0, position:"relative", bgcolor:"#000" }}>
             <IconButton onClick={()=>setVideoOpen(false)}
                         sx={{ position:"absolute", top:8,right:8,color:"#fff",zIndex:1 }}
                         aria-label="Close video">
               <CloseIcon />
             </IconButton>
   
             {videoOpen ? (
               <Box component="iframe"
                    src="https://player.vimeo.com/video/000000000?h=placeholder&autoplay=1&muted=1"
                    title="BSP demo video"
                    allow="autoplay; fullscreen"
                    sx={{ width:"100%", height:{ xs:250, sm:400, md:500 } }}
               />
             ) : null}
           </DialogContent>
         </Dialog>
       </Box>
     );
   }
   