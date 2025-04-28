import React, { createContext, useState, useContext, useMemo, useEffect, useRef } from "react";
import { ThemeProvider as MUIThemeProvider } from "@mui/material/styles";
import { getTheme } from "../theme";
import { getAnalyticsService } from "../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";

// Create and export the ThemeContext
export const ThemeContext = createContext({
  mode: "light",
  theme: {},
  toggleTheme: () => {},
  setThemeMode: () => {},
  resetToSystemTheme: () => {},
});

// Custom hook to access ThemeContext
export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    console.warn("useThemeContext must be used within a ThemeProvider");
    return {
      mode: "light",
      theme: getTheme("light"),
      toggleTheme: () => {},
      setThemeMode: () => {},
      resetToSystemTheme: () => {},
    };
  }
  return context;
}

// ThemeProvider component
export function ThemeProvider({ children, user }) {
  const [mode, setMode] = useState(() => {
    try {
      const savedMode = localStorage.getItem("themeMode");
      if (savedMode) {
        return savedMode;
      }
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    } catch (error) {
      console.error("Failed to access localStorage for themeMode:", error);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
  });
  const [error, setError] = useState(null);
  const [isLocalStorageAvailable, setIsLocalStorageAvailable] = useState(true);
  const [systemThemeAnnouncement, setSystemThemeAnnouncement] = useState(""); // State for system theme announcements
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const loggedEvents = useRef({
    themeContextMounted: false,
    localStorageUnavailable: false,
    themeModePersisted: false,
    systemThemeChanged: false,
    themeToggled: false,
    themeModeSet: false,
    themeResetToSystem: false,
  }); // Track logged events per session
  const liveRegionRef = useRef(null); // Reference to the live region for accessibility announcements
  const userId = user?.uid || "anonymous"; // Stable userId for analytics

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Create a persistent live region for accessibility announcements
  useEffect(() => {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    liveRegion.style.position = "absolute";
    liveRegion.style.width = "1px";
    liveRegion.style.height = "1px";
    liveRegion.style.overflow = "hidden";
    liveRegion.style.clip = "rect(0, 0, 0, 0)";
    document.body.appendChild(liveRegion);
    liveRegionRef.current = liveRegion;

    return () => {
      if (liveRegionRef.current) {
        document.body.removeChild(liveRegionRef.current);
      }
    };
  }, []);

  // Track ThemeContext mount on initial render (only once)
  useEffect(() => {
    if (!loggedEvents.current.themeContextMounted && analytics && userId) {
      logEvent(analytics, "theme_context_mounted", {
        userId,
        initialMode: mode,
        timestamp: new Date().toISOString(),
      });
      console.log("ThemeContext - Theme context mounted logged to Firebase Analytics");
      loggedEvents.current.themeContextMounted = true;
    }
  }, [userId, mode, analytics]); // Added analytics to dependencies

  // Check local storage availability
  useEffect(() => {
    try {
      localStorage.setItem("test", "test");
      localStorage.removeItem("test");
      setIsLocalStorageAvailable(true);
    } catch (e) {
      setIsLocalStorageAvailable(false);
      let userFriendlyError = "Local storage is unavailable. Theme preferences will not be saved.";
      if (e.name === "QuotaExceededError") {
        userFriendlyError = "Local storage is full. Theme preferences cannot be saved.";
      }
      setError(userFriendlyError);
      console.warn("Local storage is unavailable. Using in-memory storage for theme mode.");
      if (!loggedEvents.current.localStorageUnavailable && analytics && userId) {
        logEvent(analytics, "local_storage_unavailable", {
          userId,
          error_message: e.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("ThemeContext - Local storage unavailability logged to Firebase Analytics");
        loggedEvents.current.localStorageUnavailable = true;
      }
    }
  }, [userId, analytics]); // Added analytics to dependencies

  // Persist theme mode to local storage with debouncing
  useEffect(() => {
    if (!isLocalStorageAvailable) return;

    const timer = setTimeout(() => {
      try {
        localStorage.setItem("themeMode", mode);
        console.log("ThemeContext - Mode persisted to localStorage:", mode);

        // Log theme mode persistence (only once per session)
        if (!loggedEvents.current.themeModePersisted && analytics && userId) {
          logEvent(analytics, "theme_mode_persisted", {
            userId,
            mode,
            timestamp: new Date().toISOString(),
          });
          console.log("ThemeContext - Theme mode persistence logged to Firebase Analytics");
          loggedEvents.current.themeModePersisted = true;
        }
      } catch (error) {
        console.error("Failed to save themeMode to localStorage:", error);
        let userFriendlyError = "Failed to save theme preference. It will reset on page reload.";
        if (error.name === "QuotaExceededError") {
          userFriendlyError = "Local storage is full. Theme preferences cannot be saved.";
        }
        setError(userFriendlyError);

        if (analytics && userId) {
          logEvent(analytics, "theme_mode_persist_failed", {
            userId,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log("ThemeContext - Theme mode persistence failure logged to Firebase Analytics");
        }
      }
    }, 500); // Debounce by 500ms

    return () => clearTimeout(timer);
  }, [mode, isLocalStorageAvailable, userId, analytics]); // Added analytics to dependencies

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (event) => {
      const savedMode = localStorage.getItem("themeMode");
      const systemMode = event.matches ? "dark" : "light";
      setSystemThemeAnnouncement(`System theme changed to ${systemMode} mode${savedMode ? ", but user preference is applied" : ""}`);
      
      if (!savedMode) {
        const newMode = event.matches ? "dark" : "light";
        setMode(newMode);
        console.log("ThemeContext - System theme changed to:", newMode);

        // Log system theme change (only once per session)
        if (!loggedEvents.current.systemThemeChanged && analytics && userId) {
          logEvent(analytics, "system_theme_changed", {
            userId,
            newMode,
            timestamp: new Date().toISOString(),
          });
          console.log("ThemeContext - System theme change logged to Firebase Analytics");
          loggedEvents.current.systemThemeChanged = true;
        }
      } else {
        console.log("ThemeContext - System theme changed, but user preference exists:", savedMode);
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [userId, analytics]); // Added analytics to dependencies

  // Toggle theme mode
  const toggleTheme = () => {
    setMode((prev) => {
      const newMode = prev === "light" ? "dark" : "light";
      console.log("ThemeContext - Toggling theme to:", newMode);

      // Log theme toggle (only once per session)
      if (!loggedEvents.current.themeToggled && analytics && userId) {
        logEvent(analytics, "theme_toggled", {
          userId,
          newMode,
          timestamp: new Date().toISOString(),
        });
        console.log("ThemeContext - Theme toggle logged to Firebase Analytics");
        loggedEvents.current.themeToggled = true;
      }

      return newMode;
    });
  };

  // Set specific theme mode
  const setThemeMode = (newMode) => {
    if (newMode === "light" || newMode === "dark") {
      setMode(newMode);
      console.log("ThemeContext - Set theme mode to:", newMode);

      // Log theme mode set (only once per session)
      if (!loggedEvents.current.themeModeSet && analytics && userId) {
        logEvent(analytics, "theme_mode_set", {
          userId,
          newMode,
          timestamp: new Date().toISOString(),
        });
        console.log("ThemeContext - Theme mode set logged to Firebase Analytics");
        loggedEvents.current.themeModeSet = true;
      }
    } else {
      console.warn("ThemeContext - Invalid theme mode:", newMode);
      setError("Invalid theme mode selected.");

      if (analytics && userId) {
        logEvent(analytics, "theme_mode_set_failed", {
          userId,
          newMode,
          error_message: "Invalid theme mode",
          timestamp: new Date().toISOString(),
        });
        console.log("ThemeContext - Theme mode set failure logged to Firebase Analytics");
      }

      // Clear error after 5 seconds
      setTimeout(() => {
        setError(null);
      }, 5000);
    }
  };

  // Reset to system theme
  const resetToSystemTheme = () => {
    try {
      localStorage.removeItem("themeMode");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const newMode = prefersDark ? "dark" : "light";
      setMode(newMode);
      console.log("ThemeContext - Reset to system theme:", newMode);

      // Log theme reset to system (only once per session)
      if (!loggedEvents.current.themeResetToSystem && analytics && userId) {
        logEvent(analytics, "theme_reset_to_system", {
          userId,
          newMode,
          timestamp: new Date().toISOString(),
        });
        console.log("ThemeContext - Theme reset to system logged to Firebase Analytics");
        loggedEvents.current.themeResetToSystem = true;
      }
    } catch (error) {
      console.error("Failed to reset theme to system preference:", error);
      setError("Failed to reset theme to system preference.");

      if (analytics && userId) {
        logEvent(analytics, "theme_reset_to_system_failed", {
          userId,
          error_message: error.message,
          timestamp: new Date().toISOString(),
        });
        console.log("ThemeContext - Theme reset to system failure logged to Firebase Analytics");
      }

      // Clear error after 5 seconds
      setTimeout(() => {
        setError(null);
      }, 5000);
    }
  };

  // Generate the theme
  const theme = useMemo(() => {
    const newTheme = getTheme(mode);
    console.log("ThemeContext - Theme generated:", newTheme);
    return newTheme;
  }, [mode]);

  // Context value
  const value = useMemo(
    () => ({
      mode,
      theme,
      toggleTheme,
      setThemeMode,
      resetToSystemTheme,
    }),
    [mode, theme]
  );

  // Announce theme changes for accessibility
  useEffect(() => {
    const announcement = `Theme changed to ${mode} mode`;
    if (liveRegionRef.current) {
      liveRegionRef.current.innerText = announcement;
    }
  }, [mode]);

  // Announce system theme changes for accessibility
  useEffect(() => {
    if (systemThemeAnnouncement && liveRegionRef.current) {
      liveRegionRef.current.innerText = systemThemeAnnouncement;
    }
  }, [systemThemeAnnouncement]);

  return (
    <ThemeContext.Provider value={value}>
      <MUIThemeProvider theme={theme}>{children}</MUIThemeProvider>
    </ThemeContext.Provider>
  );
}