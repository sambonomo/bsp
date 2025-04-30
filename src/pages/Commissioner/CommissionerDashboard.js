// /src/pages/Commissioner/CommissionerDashboard.js

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { getDb, getAnalyticsService } from "../../firebase/config";
import { logEvent } from "firebase/analytics";

import {
  Container,
  Box,
  Typography,
  CircularProgress,
  Fade,
  Alert,
  Button,
} from "@mui/material";

// Sections
import CommissionerPotSection from "./sections/CommissionerPotSection";
import CommissionerRulesSection from "./sections/CommissionerRulesSection";
import CommissionerBrandingSection from "./sections/CommissionerBrandingSection";
import CommissionerMatchupsSection from "./sections/CommissionerMatchupsSection";
import CommissionerExtraToolsSection from "./sections/CommissionerExtraToolsSection";

// If you have an AuthContext, you could import it here:
// import { useAuth } from "../../contexts/AuthContext";

/**
 * Main "Manage Pool" page for commissioners.
 * - Fetches the pool doc by poolId
 * - Renders sub-sections for pot, rules, branding, matchups, plus extra tools (offline users, lock pool, etc.)
 */
export default function CommissionerDashboard() {
  // 1) Gather route params & nav
  const { poolId } = useParams();
  const navigate = useNavigate();

  // 2) If you have AuthContext, you can do: const { user } = useAuth();
  // For example, here's a placeholder user:
  const user = { uid: "dummyUid" };

  // 3) Declare all Hooks at the top
  const [poolData, setPoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [analytics, setAnalytics] = useState(null);
  const hasLoggedPageView = useRef(false);

  // 4) Initialize analytics once
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // 5) Fetch the pool doc from Firestore
  useEffect(() => {
    if (!poolId) {
      setError("No poolId provided.");
      setLoading(false);
      return;
    }

    const fetchPool = async () => {
      try {
        const dbInstance = getDb();
        const poolRef = doc(dbInstance, "pools", poolId);
        const snapshot = await getDoc(poolRef);

        if (!snapshot.exists()) {
          setError("Pool not found.");
          setLoading(false);
          return;
        }

        const data = snapshot.data();
        setPoolData(data);

        // Log a page view once
        if (!hasLoggedPageView.current && analytics) {
          logEvent(analytics, "commissioner_dashboard_viewed", {
            userId: user?.uid || "anonymous",
            poolId,
            timestamp: new Date().toISOString(),
          });
          hasLoggedPageView.current = true;
        }
      } catch (err) {
        console.error("CommissionerDashboard - Error fetching pool:", err);
        setError("Failed to load pool data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchPool();
  }, [poolId, analytics, user?.uid]);

  // 6) Show loading spinner
  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress aria-label="Loading commissioner dashboard" />
        <Typography sx={{ mt: 2 }}>
          Loading Commissioner Dashboard...
        </Typography>
      </Container>
    );
  }

  // 7) If there's an error, show it
  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Button
          variant="contained"
          onClick={() => navigate("/dashboard")}
          aria-label="Return to dashboard"
        >
          Return to Dashboard
        </Button>
      </Container>
    );
  }

  // 8) Check if user is commissioner
  const isCommissioner = poolData?.commissionerId === user?.uid;
  if (!isCommissioner) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">
          You do not have permission to manage this pool.
        </Alert>
      </Container>
    );
  }

  // 9) Render sub-sections
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Fade in timeout={1000}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              mb: 4,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Commissioner Dashboard - {poolData.poolName}
          </Typography>

          {/* Section 1: Pot & Payouts */}
          <CommissionerPotSection
            user={user}
            poolId={poolId}
            poolData={poolData}
            analytics={analytics}
          />

          {/* Section 2: Rules (Squares, Strip Cards, Pick’em, etc.) */}
          <CommissionerRulesSection
            user={user}
            poolId={poolId}
            poolData={poolData}
            analytics={analytics}
          />

          {/* Section 3: Branding (colors, logo) */}
          <CommissionerBrandingSection
            user={user}
            poolId={poolId}
            poolData={poolData}
            analytics={analytics}
          />

          {/* Section 4: Matchups (Add / remove games) */}
          <CommissionerMatchupsSection
            user={user}
            poolId={poolId}
            poolData={poolData}
            analytics={analytics}
          />

          {/* Section 5: Extra Tools (offline users, lock pool, etc.) */}
          <CommissionerExtraToolsSection
            user={user}
            poolId={poolId}
            poolData={poolData}
            analytics={analytics}
          />
        </Box>
      </Fade>
    </Container>
  );
}
