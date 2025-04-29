import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";
import { Box, Typography, Button, CircularProgress, Fade } from "@mui/material";
import { lazy, Suspense } from "react";

// Lazy-loaded Pages
const LandingPage = lazy(() => import("../pages/LandingPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const SignupPage = lazy(() => import("../pages/SignupPage"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const CreatePoolWizard = lazy(() => import("../pages/CreatePoolWizard"));
const JoinPool = lazy(() => import("../pages/JoinPool"));
const ManagePool = lazy(() => import("../pages/ManagePool"));
const ManageMatchupsPage = lazy(() => import("../pages/ManageMatchupsPage"));
const SubscriptionPage = lazy(() => import("../pages/SubscriptionPage"));
const TOSPage = lazy(() => import("../pages/TOSPage"));
const Account = lazy(() => import("../pages/Account"));
const ChangePassword = lazy(() => import("../pages/ChangePassword"));
const PoolList = lazy(() => import("../components/pools/PoolList"));
const PoolDashboard = lazy(() => import("../components/pools/PoolDashboard"));
const CommissionerSettingsPage = lazy(() => import("../pages/CommissionerSettingsPage"));

// ProtectedRoute component to restrict access to authenticated users
function ProtectedRoute({ element }) {
  const { user, authLoading } = useAuth();
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedUnauthorized = useRef(false); // Track if unauthorized_access_attempt has been logged

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Log unauthorized access attempt if user is not authenticated
  useEffect(() => {
    if (!authLoading && !user && !hasLoggedUnauthorized.current) {
      if (analytics) {
        logEvent(analytics, "unauthorized_access_attempt", {
          userId: user?.uid || "anonymous",
          path: window.location.pathname,
          timestamp: new Date().toISOString(),
        });
        console.log("ProtectedRoute - Unauthorized access attempt logged to Firebase Analytics");
        hasLoggedUnauthorized.current = true;
      }

      // Announce redirect for accessibility
      const announcement = "You are being redirected to the login page because you are not authenticated.";
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
  }, [authLoading, user, analytics]); // Added analytics to dependencies

  // Reset logging flag when user changes
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

// PublicRoute component to redirect authenticated users
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

// NotFoundPage component for 404 errors
function NotFoundPage() {
  const { user } = useAuth(); // Define user here using useAuth
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedNotFound = useRef(false); // Track if page_not_found has been logged

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Log 404 error
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
  }, [user?.uid, analytics]); // Added analytics to dependencies

  return (
    <Box sx={{ py: 4, textAlign: "center" }} role="alert" aria-label="Page not found">
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

function AppRoutes() {
  const { user } = useAuth();

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
            <Route path="/subscription" element={<ProtectedRoute element={<SubscriptionPage />} />} />
            <Route path="/join" element={<JoinPool />} />

            {/* Pool List Route */}
            <Route path="/pools" element={<PoolList />} />

            {/* Protected Routes */}
            <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
            <Route path="/create-pool" element={<ProtectedRoute element={<CreatePoolWizard />} />} />
            <Route path="/pool/:poolId" element={<ProtectedRoute element={<PoolDashboard />} />} />
            <Route path="/manage-pool/:poolId" element={<ProtectedRoute element={<ManagePool />} />} />
            <Route path="/manage-matchups/:poolId" element={<ProtectedRoute element={<ManageMatchupsPage />} />} />
            <Route path="/commissioner-settings/:poolId" element={<ProtectedRoute element={<CommissionerSettingsPage />} />} />
            <Route path="/account" element={<ProtectedRoute element={<Account />} />} />
            <Route path="/change-password" element={<ProtectedRoute element={<ChangePassword />} />} />

            {/* 404 Catch-All Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Box>
      </Fade>
    </Suspense>
  );
}

export default AppRoutes;