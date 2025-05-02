/* ------------------------------------------------------------------
   src/pages/Commissioner/CommissionerLayout.js
   ------------------------------------------------------------------ */
   import React, { useEffect, useState } from "react";
   import { Outlet, Link as RouterLink, useParams } from "react-router-dom";
   import {
     Box,
     Drawer,
     List,
     ListItem,
     ListItemButton,
     ListItemIcon,
     ListItemText,
     Toolbar,
     AppBar,
     Typography,
     CssBaseline,
     CircularProgress,
     Alert,
   } from "@mui/material";
   import { useThemeContext } from "../../contexts/ThemeContext";
   import { useAuth } from "../../contexts/AuthContext";
   import { getDb } from "../../firebase/config";
   import { doc, getDoc } from "firebase/firestore";
   
   /* ---------- MUI icons (fixed) ---------- */
   import DashboardIcon        from "@mui/icons-material/Dashboard";
   import MonetizationOnIcon   from "@mui/icons-material/MonetizationOn";
   import GavelIcon            from "@mui/icons-material/Gavel";
   import PaletteIcon          from "@mui/icons-material/Palette";
   import SportsEsportsIcon    from "@mui/icons-material/SportsEsports";
   import BuildIcon            from "@mui/icons-material/Build";
   
   /* ------------------------------------------------------------------ */
   
   const DRAWER_WIDTH = 240;
   
   export default function CommissionerLayout() {
     /* theme / auth / params ------------------------------------------- */
     const { theme }      = useThemeContext();
     const { user }       = useAuth();
     const { poolId }     = useParams();
     const db             = getDb();
   
     /* local state ------------------------------------------------------ */
     const [poolData, setPoolData] = useState(null);
     const [loading,  setLoading]  = useState(true);
     const [error,    setError]    = useState("");
   
     /* fetch pool once -------------------------------------------------- */
     useEffect(() => {
       const fetchPool = async () => {
         try {
           const snap = await getDoc(doc(db, "pools", poolId));
           if (!snap.exists()) {
             setError("Pool not found.");
             return;
           }
           setPoolData({ id: snap.id, ...snap.data() });
         } catch (err) {
           setError(err.message || "Failed to load pool.");
         } finally {
           setLoading(false);
         }
       };
       fetchPool();
     }, [db, poolId]);
   
     /* ------------------------------------------------------------------
        drawer nav items
     ------------------------------------------------------------------ */
     const navItems = [
       { label: "Overview",  to: ".",            icon: <DashboardIcon        /> },
       { label: "Pot",       to: "pot",          icon: <MonetizationOnIcon   /> },
       { label: "Rules",     to: "rules",        icon: <GavelIcon            /> },
       { label: "Branding",  to: "branding",     icon: <PaletteIcon          /> },
       { label: "Matchups",  to: "matchups",     icon: <SportsEsportsIcon    /> },
       { label: "Tools",     to: "tools",        icon: <BuildIcon            /> },
     ];
   
     /* ------------------------------------------------------------------
        early returns
     ------------------------------------------------------------------ */
     if (loading) {
       return (
         <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
           <CircularProgress />
         </Box>
       );
     }
   
     if (error) {
       return (
         <Alert severity="error" sx={{ m: 4 }}>
           {error}
         </Alert>
       );
     }
   
     /* ------------------------------------------------------------------
        layout
     ------------------------------------------------------------------ */
     return (
       <Box sx={{ display: "flex" }}>
         <CssBaseline />
   
         {/* top bar */}
         <AppBar
           position="fixed"
           sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: theme.palette.primary.main }}
         >
           <Toolbar>
             <Typography variant="h6" noWrap component="div">
               Manage Pool – {poolData.poolName}
             </Typography>
           </Toolbar>
         </AppBar>
   
         {/* side drawer */}
         <Drawer
           variant="permanent"
           sx={{
             width: DRAWER_WIDTH,
             flexShrink: 0,
             [`& .MuiDrawer-paper`]: {
               width: DRAWER_WIDTH,
               boxSizing: "border-box",
             },
           }}
         >
           <Toolbar />
           <Box sx={{ overflow: "auto" }}>
             <List>
               {navItems.map((item) => (
                 <ListItem key={item.label} disablePadding>
                   <ListItemButton component={RouterLink} to={item.to}>
                     <ListItemIcon>{item.icon}</ListItemIcon>
                     <ListItemText primary={item.label} />
                   </ListItemButton>
                 </ListItem>
               ))}
             </List>
           </Box>
         </Drawer>
   
         {/* main content (Outlet provides ctx to nested pages) */}
         <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
           <Toolbar /> {/* push content below AppBar */}
           <Outlet context={{ user, poolData, loading, error }} />
         </Box>
       </Box>
     );
   }
   