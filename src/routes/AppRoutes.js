// /src/routes/AppRoutes.js

import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate, Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";
import { Box, Typography, Button, CircularProgress, Fade } from "@mui/material";

// Lazy-loaded Pages
const LandingPage = lazy(() => import("../pages/LandingPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const SignupPage = lazy(() => import("../pages/SignupPage"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const CreatePoolWizard = lazy(() => import("../pages/CreatePoolWizard"));
const JoinPool = lazy(() => import("../pages/JoinPool"));
const SubscriptionPage = lazy(() => import("../pages/SubscriptionPage"));
const TOSPage = lazy(() => import("../pages/TOSPage"));
const Account = lazy(() => import("../pages/Account"));
const ChangePassword = lazy(() => import("../pages/ChangePassword"));
const PoolList = lazy(() => import("../components/pools/PoolList"));

// Use your single “PoolView” component for the /pool/:poolId route
const PoolView = lazy(() => import("../pages/PoolView"));

// Import CommissionerDashboard for /commissioner/:poolId
const CommissionerDashboard = lazy(() =>
  import("../pages/Commissioner/CommissionerDashboard")
);

/**
 * Restrict access to authenticated users
 */
function ProtectedRoute({ element }) {
  const { user, authLoading } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedUnauthorized = useRef(false);

  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  useEffect(() => {
    if (!authLoading && !user && !hasLoggedUnauthorized.current) {
      if (analytics) {
        logEvent(analytics, "unauthorized_access_attempt", {
          userId: user?.uid || "anonymous",
          path: window.location.pathname,
          timestamp: new Date().toISOString(),
        });
        console.log("ProtectedRoute - Unauthorized access attempt logged");
        hasLoggedUnauthorized.current = true;
      }

      // Accessibility announcement
      const announcement =
        "You are being redirected to the login page because you are not authenticated.";
      const liveRegion = document.createElement("div");
      liveRegion.setAttribute("aria-live", "assertive");
      liveRegion.setAttribute("role", "alert");
      liveRegion.style.position = "absolute";
      liveRegion.style.width = "1px";
      liveRegion.style.height = "1px";
      liveRegion.style.overflow = "hidden";
      liveRegion.style.clip = "rect(0, 0, 0, 0)";
      liveRegion.innerText = announcement;
      document.body.appendChild(liveRegion);
      setTimeout(() => document.body.removeChild(liveRegion), 1000);
    }
  }, [authLoading, user, analytics]);

  useEffect(() => {
    hasLoggedUnauthorized.current = false;
  }, [user?.uid]);

  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading authentication state" />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
  }

  return element;
}

/**
 * Redirect authenticated users away from login/signup pages
 */
function PublicRoute({ element }) {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading authentication state" />
      </Box>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return element;
}

/**
 * 404 Page
 */
function NotFoundPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const hasLoggedNotFound = useRef(false);

  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  useEffect(() => {
    if (!hasLoggedNotFound.current && analytics) {
      logEvent(analytics, "page_not_found", {
        userId: user?.uid || "anonymous",
        path: window.location.pathname,
        timestamp: new Date().toISOString(),
      });
      console.log("AppRoutes - 404 error logged to Firebase Analytics");
      hasLoggedNotFound.current = true;
    }
  }, [user?.uid, analytics]);

  return (
    <Box
      sx={{ py: 4, textAlign: "center" }}
      role="alert"
      aria-label="Page not found"
    >
      <Typography
        variant="h4"
        sx={{
          mb: 2,
          fontWeight: 700,
          fontFamily: "'Montserrat', sans-serif'",
          color: (theme) => theme.palette.text.primary,
        }}
      >
        404 - Page Not Found
      </Typography>
      <Typography
        variant="body1"
        sx={{
          mb: 3,
          fontFamily: "'Poppins', sans-serif'",
          color: (theme) => theme.palette.text.secondary,
        }}
      >
        The page you're looking for doesn't exist or has been moved.
      </Typography>
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
        <Button
          component={RouterLink}
          to="/"
          variant="contained"
          color="primary"
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 2,
            fontFamily: "'Poppins', sans-serif'",
          }}
          aria-label="Go to home page"
        >
          Go to Home
        </Button>
        <Button
          component={RouterLink}
          to="/pools"
          variant="outlined"
          color="primary"
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 2,
            fontFamily: "'Poppins', sans-serif'",
          }}
          aria-label="Go to pool list"
        >
          View Pools
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Main Application Routes
 */
export default function AppRoutes() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size={24} aria-label="Loading page" />
        </Box>
      }
    >
      <Fade in timeout={500}>
        <Box role="main">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<PublicRoute element={<LoginPage />} />} />
            <Route path="/signup" element={<PublicRoute element={<SignupPage />} />} />
            <Route path="/tos" element={<TOSPage />} />
            <Route
              path="/subscription"
              element={<ProtectedRoute element={<SubscriptionPage />} />}
            />
            <Route path="/join" element={<JoinPool />} />

            {/* Pool List */}
            <Route path="/pools" element={<PoolList />} />

            {/* Protected Routes (must be authenticated) */}
            <Route
              path="/dashboard"
              element={<ProtectedRoute element={<Dashboard />} />}
            />
            <Route
              path="/create-pool"
              element={<ProtectedRoute element={<CreatePoolWizard />} />}
            />

            {/* Single Pool View */}
            <Route
              path="/pool/:poolId"
              element={<ProtectedRoute element={<PoolView />} />}
            />

            {/* Commissioner Dashboard */}
            <Route
              path="/commissioner/:poolId"
              element={<ProtectedRoute element={<CommissionerDashboard />} />}
            />

            {/*
              Old references to "PoolDashboard" or "ManagePool" or
              "CommissionerSettingsPage" are removed.
            */}

            <Route path="/account" element={<ProtectedRoute element={<Account />} />} />
            <Route
              path="/change-password"
              element={<ProtectedRoute element={<ChangePassword />} />}
            />

            {/* 404 Catch-All */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Box>
      </Fade>
    </Suspense>
  );
}
