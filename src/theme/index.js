import { createTheme, responsiveFontSizes } from "@mui/material/styles";

// Light Mode Palette
const lightPalette = {
  mode: "light",
  primary: {
    main: "#1A2A44", // Navy
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: "#FFD700", // Gold
    contrastText: "#0B162A", // Dark navy for readability on gold
  },
  accent: {
    main: "#FFEB3B", // Yellow
    contrastText: "#0B162A",
  },
  success: {
    main: "#2E7D32", // Green
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#ED6C02", // Orange
    contrastText: "#FFFFFF",
  },
  error: {
    main: "#D32F2F", // Red
    contrastText: "#FFFFFF",
  },
  background: {
    default: "#FAFAFA", // Off-white for better readability
    paper: "#FFFFFF",
  },
  text: {
    primary: "#0B162A",
    secondary: "#555555",
  },
  contrastThreshold: 4.5, // Increased to meet WCAG AA contrast requirements
  tonalOffset: 0.2, // Adjusts shade variations
};

// Dark Mode Palette
const darkPalette = {
  mode: "dark",
  primary: {
    main: "#FFD700", // Gold stands out on dark backgrounds
    contrastText: "#0B162A",
  },
  secondary: {
    main: "#1A2A44", // Navy for secondary accent
    contrastText: "#FFFFFF",
  },
  accent: {
    main: "#FFEB3B", // Yellow
    contrastText: "#0B162A",
  },
  success: {
    main: "#81C784", // Lighter green
    contrastText: "#FFFFFF", // Changed to white for better contrast
  },
  warning: {
    main: "#FFB74D", // Lighter orange
    contrastText: "#FFFFFF", // Changed to white for better contrast
  },
  error: {
    main: "#E57373", // Lighter red
    contrastText: "#FFFFFF", // Changed to white for better contrast
  },
  background: {
    default: "#0A1323", // Dark navy background
    paper: "#152238", // Slightly lighter navy for cards
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#B0BEC5",
  },
  contrastThreshold: 4.5, // Increased to meet WCAG AA contrast requirements
  tonalOffset: 0.2,
};

// Typography
const typography = {
  fontFamily: "'Poppins', sans-serif",
  h1: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "2.5rem",
    fontWeight: 800, // Bolder for emphasis
    lineHeight: 1.2,
    letterSpacing: "-0.01562em",
  },
  h2: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "2rem",
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "-0.00833em",
  },
  h3: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "1.75rem",
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "0em",
  },
  h4: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "1.5rem",
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: "0.00735em",
  },
  h5: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "1.25rem",
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: "0em",
  },
  h6: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "1rem",
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: "0.0075em",
  },
  body1: {
    fontFamily: "'Poppins', sans-serif",
    fontSize: "1rem",
    fontWeight: 400,
    lineHeight: 1.6,
  },
  body2: {
    fontFamily: "'Poppins', sans-serif",
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.6,
  },
  caption: {
    fontFamily: "'Poppins', sans-serif",
    fontSize: "0.75rem",
    fontWeight: 400,
    lineHeight: 1.66,
  },
  button: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 600,
    letterSpacing: "0.02857em",
  },
};

// Shape & Radius
const shape = {
  borderRadius: 8,
};

// Spacing Utility
const spacing = (factor) => `${0.5 * factor}rem`; // Base spacing unit: 0.5rem (8px)

// Component Overrides
const components = {
  MuiButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        textTransform: "none",
        fontWeight: 600,
        borderRadius: 8,
        padding: "8px 16px",
        transition: "all 0.3s ease",
        "&:hover": {
          transform: "scale(1.02)",
          boxShadow:
            theme.palette.mode === "dark"
              ? "0 4px 12px rgba(255,215,0,0.2)"
              : "0 4px 12px rgba(0,0,0,0.2)",
        },
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.accent.main}`,
          outlineOffset: "2px",
          boxShadow: `0 0 0 4px rgba(255,215,0,0.3)`,
        },
      }),
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 8,
        border: "1px solid",
        borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 4px 12px rgba(0,0,0,0.3)"
            : "0 4px 12px rgba(0,0,0,0.1)",
      }),
    },
  },
  MuiCard: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 8,
        border: "1px solid",
        borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 4px 12px rgba(0,0,0,0.3)"
            : "0 4px 12px rgba(0,0,0,0.1)",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
        "&:hover": {
          transform: "scale(1.02)",
          boxShadow:
            theme.palette.mode === "dark"
              ? "0 6px 16px rgba(0,0,0,0.4)"
              : "0 6px 16px rgba(0,0,0,0.2)",
        },
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.accent.main}`,
          outlineOffset: "2px",
          boxShadow: `0 0 0 4px rgba(255,215,0,0.3)`,
        },
      }),
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: 12,
        border: "1px solid",
        borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 4px 12px rgba(0,0,0,0.3)"
            : "0 4px 12px rgba(0,0,0,0.1)",
      }),
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        fontFamily: "'Poppins', sans-serif",
      },
    },
  },
  MuiSnackbar: {
    styleOverrides: {
      root: {
        "& .MuiSnackbarContent-root": {
          borderRadius: 8,
          fontFamily: "'Poppins', sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        },
      },
    },
  },
  MuiLink: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.palette.primary.main,
        textDecoration: "none",
        transition: "color 0.3s ease",
        "&:hover": {
          color: theme.palette.secondary.main,
          textDecoration: "underline",
        },
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.accent.main}`,
          outlineOffset: "2px",
          boxShadow: `0 0 0 4px rgba(255,215,0,0.3)`,
        },
      }),
    },
  },
  MuiSwitch: {
    styleOverrides: {
      root: ({ theme }) => ({
        "& .MuiSwitch-thumb": {
          backgroundColor: "#FFD700", // Consistent with brand
        },
        "& .MuiSwitch-track": {
          backgroundColor: theme.palette.mode === "dark" ? "#B0BEC5" : "#555555",
        },
      }),
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: ({ theme }) => ({
        "& .MuiOutlinedInput-root": {
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.accent.main,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.accent.main,
            boxShadow: `0 0 0 2px rgba(255,215,0,0.2)`,
          },
        },
        "& .MuiInputLabel-root.Mui-focused": {
          color: theme.palette.accent.main,
        },
      }),
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: ({ theme }) => ({
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.palette.accent.main,
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.palette.accent.main,
          boxShadow: `0 0 0 2px rgba(255,215,0,0.2)`,
        },
      }),
    },
  },
  MuiCssBaseline: {
    styleOverrides: `
      html, body, #root {
        height: 100%;
        margin: 0;
        padding: 0;
        font-family: 'Poppins', sans-serif;
      }
      h1, h2, h3, h4, h5, h6 {
        font-family: 'Montserrat', sans-serif;
      }
    `,
  },
};

// Cache for memoized themes
const themeCache = {
  light: null,
  dark: null,
};

// Export the theme creation function
export function getTheme(mode = "light") {
  // Return cached theme if it exists
  if (themeCache[mode]) {
    return themeCache[mode];
  }

  const palette = mode === "dark" ? darkPalette : lightPalette;

  let theme = createTheme({
    palette,
    typography,
    shape,
    spacing, // Add spacing utility
    components,
  });

  // Make typography responsive
  theme = responsiveFontSizes(theme, {
    factor: 2, // Adjust scaling factor for responsiveness
    variants: ["h1", "h2", "h3", "h4", "h5", "h6", "body1", "body2", "caption", "button"],
  });

  // Cache the theme
  themeCache[mode] = theme;

  // Simplified logging
  console.log(`Theme Generated - Mode: ${mode}`);

  return theme;
}