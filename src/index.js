import React, { useEffect, useRef } from "react";
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

// Wrapper component to handle analytics initialization and global error handling
function RootApp() {
  const analytics = getAnalyticsService();
  const hasLoggedAppInit = useRef(false);

  // Log app initialization (only once)
  useEffect(() => {
    if (analytics && !hasLoggedAppInit.current) {
      logEvent(analytics, "app_initialized", {
        timestamp: new Date().toISOString(),
      });
      console.log("index.js - App initialization logged to Firebase Analytics");
      hasLoggedAppInit.current = true;
    }
  }, [analytics]);

  // Global error handling for unhandled errors
  useEffect(() => {
    const handleError = (event) => {
      console.error("index.js - Unhandled Error:", event.error);
      if (analytics) {
        logEvent(analytics, "unhandled_error", {
          error_message: event.error?.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("index.js - Unhandled error logged to Firebase Analytics");
      }
    };

    const handleRejection = (event) => {
      console.error("index.js - Unhandled Promise Rejection:", event.reason);
      if (analytics) {
        logEvent(analytics, "unhandled_promise_rejection", {
          error_message: event.reason?.message || "Unknown promise rejection",
          timestamp: new Date().toISOString(),
        });
        console.log("index.js - Unhandled promise rejection logged to Firebase Analytics");
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [analytics]);

  return <App />;
}

// Create the root element for rendering
const root = ReactDOM.createRoot(document.getElementById("root"));

// Render the app with all necessary providers
root.render(
  // StrictMode enables additional checks in development (disabled in production by CRA)
  <React.StrictMode>
    {/* ErrorBoundary catches unhandled errors in the component tree */}
    <ErrorBoundary>
      {/* HelmetProvider enables dynamic head management (e.g., for SEO) */}
      <HelmetProvider>
        {/* ThemeProvider provides MUI theme context */}
        <ThemeProvider>
          {/* BrowserRouter enables client-side routing */}
          <BrowserRouter>
            {/* AuthProvider manages authentication state */}
            <AuthProvider>
              {/* SubscriptionProvider manages subscription state */}
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