/* --------------------------------------------------------
   src/theme/index.js      (full file – ready to paste)
   -------------------------------------------------------- */
   import { createTheme, responsiveFontSizes } from "@mui/material/styles";

   /* === 1. SHARED BRAND SWATCH ============================================ */
   const brandYellow = {
     light: "#F0C544",          // slightly brighter for dark BGs
     main:  "#D4A017",          // CTA / primary brand gold
     dark:  "#B18512",          // hover / active
     contrastText: "#0B162A",
   };
   
   /* === 2. PALETTES ======================================================== */
   const lightPalette = {
     mode: "light",
     primary:   { main: "#1A2A44", contrastText: "#FFFFFF" },     // navy
     secondary: { ...brandYellow },                               // gold
     brand:     { ...brandYellow },                               // <— NEW swatch
     accent:    { main: "#FFEB3B", contrastText: "#0B162A" },
     success:   { main: "#2E7D32", contrastText: "#FFFFFF" },
     warning:   { main: "#ED6C02", contrastText: "#FFFFFF" },
     error:     { main: "#D32F2F", contrastText: "#FFFFFF" },
     background:{ default: "#FAFAFA", paper: "#FFFFFF" },
     text:      { primary: "#0B162A", secondary: "#555555" },
     contrastThreshold: 4.5,
     tonalOffset: 0.2,
   };
   
   const darkPalette = {
     mode: "dark",
     primary:   { ...brandYellow },                               // gold on dark
     secondary: { main: "#1A2A44", contrastText: "#FFFFFF" },
     brand:     { ...brandYellow },                               // same swatch
     accent:    { main: "#FFEB3B", contrastText: "#0B162A" },
     success:   { main: "#81C784", contrastText: "#FFFFFF" },
     warning:   { main: "#FFB74D", contrastText: "#FFFFFF" },
     error:     { main: "#E57373", contrastText: "#FFFFFF" },
     background:{ default: "#0A1323", paper: "#152238" },
     text:      { primary: "#FFFFFF", secondary: "#B0BEC5" },
     contrastThreshold: 4.5,
     tonalOffset: 0.2,
   };
   
   /* === 3. TYPOGRAPHY ====================================================== */
   const typography = {
     fontFamily: "'Poppins', sans-serif",
     h1:{ fontFamily:"'Montserrat', sans-serif", fontSize:"2.5rem", fontWeight:800, lineHeight:1.2 },
     h2:{ fontFamily:"'Montserrat', sans-serif", fontSize:"2rem",   fontWeight:700, lineHeight:1.2 },
     h3:{ fontFamily:"'Montserrat', sans-serif", fontSize:"1.75rem",fontWeight:700, lineHeight:1.3 },
     h4:{ fontFamily:"'Montserrat', sans-serif", fontSize:"1.5rem", fontWeight:600, lineHeight:1.3 },
     h5:{ fontFamily:"'Montserrat', sans-serif", fontSize:"1.25rem",fontWeight:600, lineHeight:1.4 },
     h6:{ fontFamily:"'Montserrat', sans-serif", fontSize:"1rem",   fontWeight:600, lineHeight:1.4 },
     body1:{ fontSize:"1rem",   lineHeight:1.6 },
     body2:{ fontSize:"0.875rem", lineHeight:1.6 },
     caption:{ fontSize:"0.75rem", lineHeight:1.66 },
     button:{ fontWeight:600 },
   };
   
   /* === 4. SHAPE & SPACING ================================================= */
   const shape   = { borderRadius: 8 };
   const spacing = (factor) => `${0.5 * factor}rem`;   // 0.5 rem = 8 px
   
   /* === 5. COMPONENT OVERRIDES ============================================ */
   const components = {
     /* ----- Buttons ------------------------------------------------------- */
     MuiButton: {
       styleOverrides: {
         root: ({ theme }) => ({
           textTransform: "none",
           fontWeight: 600,
           borderRadius: 8,
           padding: "8px 16px",
           transition: "all .3s ease",
           "&:hover": {
             transform: "scale(1.02)",
             boxShadow:
               theme.palette.mode === "dark"
                 ? "0 4px 12px rgba(212,160,23,.30)"
                 : "0 4px 12px rgba(0,0,0,.20)",
           },
           "&:focus-visible": {
             outline: `2px solid ${theme.palette.brand.main}`,
             outlineOffset: 2,
             boxShadow: `0 0 0 4px rgba(212,160,23,.35)`,
           },
         }),
         /* quick helper: <Button variant="containedBrand">… */
         containedBrand: ({ theme }) => ({
           backgroundColor: theme.palette.brand.main,
           color: theme.palette.brand.contrastText,
           "&:hover": { backgroundColor: theme.palette.brand.dark },
           "&.Mui-disabled": { opacity: 0.5 },
         }),
       },
     },
   
     /* ----- Paper / Card keep your earlier look -------------------------- */
     MuiPaper: {
       styleOverrides: {
         root: ({ theme }) => ({
           borderRadius: 8,
           border: "1px solid",
           borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
           boxShadow:
             theme.palette.mode === "dark"
               ? "0 4px 12px rgba(0,0,0,.30)"
               : "0 4px 12px rgba(0,0,0,.10)",
         }),
       },
     },
   
     /* --- keep your other overrides (TextField, Dialog, etc.) ------------- */
   };
   
   /* === 6. THEME FACTORY =================================================== */
   const cache = { light: null, dark: null };
   
   export function getTheme(mode = "light") {
     if (cache[mode]) return cache[mode];
   
     const base = createTheme({
       palette: mode === "dark" ? darkPalette : lightPalette,
       typography,
       shape,
       spacing,
       components,
     });
   
     const theme = responsiveFontSizes(base, {
       factor: 2,
       variants: [
         "h1","h2","h3","h4","h5","h6",
         "body1","body2","caption","button",
       ],
     });
   
     cache[mode] = theme;
     return theme;
   }
   