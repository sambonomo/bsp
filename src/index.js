import React, { useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import { AuthProvider } from "./contexts/AuthContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { getAnalyticsService } from "./firebase/config";
import { logEvent } from "firebase/analytics";
import ErrorBoundary from "./components/common/ErrorBoundary";

function RootApp() {
  const analytics = getAnalyticsService();
  const hasLoggedAppInit = useRef(false);

  /**
   * Helper function to log analytics events to Firebase.
   * Automatically checks if analytics is available.
   */
  const logAnalyticsEvent = useCallback((eventName, data) => {
    if (!analytics) return;
    logEvent(analytics, eventName, data);
    console.log(`index.js - Logged event: ${eventName}`, data);
  }, [analytics]);

  // Log app initialization (only once)
  useEffect(() => {
    if (!hasLoggedAppInit.current && analytics) {
      logAnalyticsEvent("app_initialized", {
        timestamp: new Date().toISOString(),
      });
      hasLoggedAppInit.current = true;
    }
  }, [analytics, logAnalyticsEvent]);

  // Global error handling for unhandled errors
  useEffect(() => {
    const handleError = (event) => {
      console.error("index.js - Unhandled Error:", event.error);
      logAnalyticsEvent("unhandled_error", {
        error_message: event.error?.message || "Unknown error",
        timestamp: new Date().toISOString(),
      });
    };

    const handleRejection = (event) => {
      console.error("index.js - Unhandled Promise Rejection:", event.reason);
      logAnalyticsEvent("unhandled_promise_rejection", {
        error_message: event.reason?.message || "Unknown promise rejection",
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [logAnalyticsEvent]);

  // Render the main application
  return <App />;
}

// Create the root element for rendering
const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  /**
   * React Strict Mode:
   * - Helps catch potential issues in development
   * - May cause certain useEffects to run twice locally
   * - Does not affect production builds
   */
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <SubscriptionProvider>
                <RootApp />
              </SubscriptionProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
