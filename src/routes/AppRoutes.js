import React, { lazy, Suspense, useEffect, useRef } from "react";
import {
  Routes,
  Route,
  Navigate,
  Link as RouterLink,
} from "react-router-dom";
import {
  Box,
  CircularProgress,
  Typography,
  Button,
  Fade,
} from "@mui/material";

import { useAuth } from "../contexts/AuthContext";
import { getAnalyticsService } from "../firebase/config";
import { logEvent } from "firebase/analytics";

/* ───────── lazy-loaded pages ───────── */
const LandingPage      = lazy(() => import("../pages/LandingPage"));
const AboutPage        = lazy(() => import("../pages/AboutPage"));
const LoginPage        = lazy(() => import("../pages/LoginPage"));
const SignupPage       = lazy(() => import("../pages/SignupPage"));
const Dashboard        = lazy(() => import("../pages/Dashboard"));
const CreatePoolWizard = lazy(() => import("../pages/CreatePoolWizard"));
const JoinPool         = lazy(() => import("../pages/JoinPool"));
const SubscriptionPage = lazy(() => import("../pages/SubscriptionPage"));
const TOSPage          = lazy(() => import("../pages/TOSPage"));
const Account          = lazy(() => import("../pages/Account"));
const ChangePassword   = lazy(() => import("../pages/ChangePassword"));
const PoolList         = lazy(() => import("../components/pools/PoolList"));
const PoolView         = lazy(() => import("../pages/PoolView"));

/* ───────── commissioner layout & pages ───────── */
const CommissionerLayout = lazy(() => import("../pages/Commissioner/CommissionerLayout"));
const CommOverviewPage   = lazy(() => import("../pages/Commissioner/pages/CommissionerOverviewPage"));
const CommPotPage        = lazy(() => import("../pages/Commissioner/pages/CommissionerPotPage"));
const CommRulesPage      = lazy(() => import("../pages/Commissioner/pages/CommissionerRulesPage"));
const CommBrandingPage   = lazy(() => import("../pages/Commissioner/pages/CommissionerBrandingPage"));
const CommMatchupsPage   = lazy(() => import("../pages/Commissioner/pages/CommissionerMatchupsPage"));
const CommMembersPage    = lazy(() => import("../pages/Commissioner/pages/CommissionerMembersPage")); // NEW
const CommToolsPage      = lazy(() => import("../pages/Commissioner/pages/CommissionerToolsPage"));

/* ───────── route guards ───────── */
function ProtectedRoute({ children }) {
  const { user, authLoading } = useAuth();
  const analytics  = getAnalyticsService();
  const loggedOnce = useRef(false);

  useEffect(() => {
    if (!authLoading && !user && analytics && !loggedOnce.current) {
      logEvent(analytics, "unauthorized_access_attempt", {
        userId: "anonymous",
        path: window.location.pathname,
        timestamp: Date.now(),
      });
      loggedOnce.current = true;
    }
  }, [authLoading, user, analytics]);

  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return user ? children : <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
}

function PublicRoute({ children }) {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return user ? <Navigate to="/dashboard" replace /> : children;
}

/* ───────── simple 404 ───────── */
function NotFoundPage() {
  const analytics = getAnalyticsService();

  useEffect(() => {
    analytics &&
      logEvent(analytics, "page_not_found", {
        userId: "anonymous",
        path: window.location.pathname,
        timestamp: Date.now(),
      });
  }, [analytics]);

  return (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>
        404 – Page Not Found
      </Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>
        The page you’re looking for doesn’t exist or has been moved.
      </Typography>
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
        <Button component={RouterLink} to="/" variant="contained">
          Home
        </Button>
        <Button component={RouterLink} to="/pools" variant="outlined">
          View Pools
        </Button>
      </Box>
    </Box>
  );
}

/* ───────── main route tree ───────── */
export default function AppRoutes() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      }
    >
      <Fade in timeout={400}>
        <Box role="main">
          <Routes>
            {/* public */}
            <Route path="/"          element={<LandingPage />} />
            <Route path="/about"     element={<AboutPage   />} />
            <Route path="/tos"       element={<TOSPage     />} />
            <Route path="/join"      element={<JoinPool    />} />
            <Route path="/pools"     element={<PoolList    />} />

            <Route path="/login"  element={<PublicRoute><LoginPage  /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />

            {/* protected user routes */}
            <Route path="/dashboard"    element={<ProtectedRoute><Dashboard        /></ProtectedRoute>} />
            <Route path="/create-pool"  element={<ProtectedRoute><CreatePoolWizard /></ProtectedRoute>} />
            <Route path="/pool/:poolId" element={<ProtectedRoute><PoolView         /></ProtectedRoute>} />
            <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
            <Route path="/account"      element={<ProtectedRoute><Account          /></ProtectedRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

            {/* commissioner area */}
            <Route
              path="/commissioner/:poolId/*"
              element={<ProtectedRoute><CommissionerLayout /></ProtectedRoute>}
            >
              <Route index           element={<CommOverviewPage />} />
              <Route path="pot"      element={<CommPotPage      />} />
              <Route path="rules"    element={<CommRulesPage    />} />
              <Route path="branding" element={<CommBrandingPage />} />
              <Route path="matchups" element={<CommMatchupsPage />} />
              <Route path="members"  element={<CommMembersPage  />} /> {/* NEW */}
              <Route path="tools"    element={<CommToolsPage    />} />
            </Route>

            {/* catch-all */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Box>
      </Fade>
    </Suspense>
  );
}
