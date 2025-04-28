import React, { useState, useEffect, useRef } from "react";
import { getDb, getAnalyticsService } from "../../firebase/config"; // Updated imports
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { logEvent } from "firebase/analytics";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../utils/helpers";

// MUI imports
import {
  Box,
  Typography,
  List,
  ListItem,
  Button,
  Fade,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  styled,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

// Styled components for polished UI
const PoolListContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[900] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  boxShadow: theme.shadows[2],
  margin: theme.spacing(2),
  minHeight: "60vh",
}));

const PoolListItem = styled(ListItem)(({ theme, isUserPool }) => ({
  backgroundColor: isUserPool
    ? theme.palette.mode === "dark"
      ? theme.palette.grey[800]
      : theme.palette.grey[100]
    : theme.palette.mode === "dark"
    ? theme.palette.grey[700]
    : theme.palette.grey[200],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  marginBottom: theme.spacing(1),
  padding: theme.spacing(2),
  transition: theme.transitions.create(["transform", "box-shadow"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    transform: "scale(1.02)",
    boxShadow: theme.shadows[4],
  },
}));

function PoolList() {
  const { user, authLoading } = useAuth();
  const { mode, theme: muiTheme } = useThemeContext();
  const { subscriptionTier, getSubscriptionBenefits } = useSubscription();
  const navigate = useNavigate();
  const [pools, setPools] = useState([]);
  const [filteredPools, setFilteredPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeoutReached, setTimeoutReached] = useState(false);
  const [sportFilter, setSportFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPoolListLoad = useRef(false); // Track if pool list load has been logged
  const db = getDb(); // Updated to use accessor

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Retry logic for Firebase operations
  const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        if (analytics) {
          logEvent(analytics, "firestore_operation_retry", {
            userId: user?.uid || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`PoolList - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase; // Exponential backoff: 1s, 2s, 4s
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  // Fetch pools with real-time updates
  useEffect(() => {
    const fetchPools = async () => {
      setLoading(true);
      setError("");
      setTimeoutReached(false);
      const poolsRef = collection(db, "pools");
      const q = query(poolsRef, orderBy("createdAt", "desc"));

      const unsubscribe = await withRetry("Fetch Pools", () =>
        onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
            setPools(data);
            setLoading(false);
            console.log("PoolList - Fetched pools:", data);

            // Log pool list load (only once)
            if (!hasLoggedPoolListLoad.current && analytics) {
              logEvent(analytics, "pool_list_loaded", {
                userId: user?.uid || "anonymous",
                poolCount: data.length,
                timestamp: new Date().toISOString(),
              });
              console.log("PoolList - Pool list load logged to Firebase Analytics");
              hasLoggedPoolListLoad.current = true;
            }
          },
          (err) => {
            console.error("PoolList - Error fetching pools:", err);
            setError("Failed to fetch pools. Please try again.");
            setLoading(false);
            if (analytics) {
              logEvent(analytics, "fetch_pools_failed", {
                userId: user?.uid || "anonymous",
                error_message: err.message || "Unknown error",
                timestamp: new Date().toISOString(),
              });
              console.log("PoolList - Fetch pools failure logged to Firebase Analytics");
            }
          }
        )
      );

      // Timeout for pool data loading
      const timeout = setTimeout(() => {
        if (loading) {
          setTimeoutReached(true);
          setError("Loading pools timed out. Please try refreshing.");
          setLoading(false);
        }
      }, 15000); // 15 seconds timeout

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
        clearTimeout(timeout);
      };
    };

    fetchPools();

    // Reset pool list load tracking when component unmounts
    return () => {
      hasLoggedPoolListLoad.current = false;
    };
  }, [user?.uid, analytics]); // Added analytics to dependencies

  // Handle manual retry
  const handleManualRetry = () => {
    setLoading(true);
    setError("");
    setTimeoutReached(false);
    console.log("PoolList - Manual retry triggered");
    if (analytics) {
      logEvent(analytics, "pool_list_refreshed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("PoolList - Manual retry logged to Firebase Analytics");
    }
  };

  // Handle sport filter change
  const handleSportFilterChange = (e) => {
    setSportFilter(e.target.value);
    if (analytics) {
      logEvent(analytics, "pool_list_sport_filter_changed", {
        userId: user?.uid || "anonymous",
        sport: e.target.value,
        timestamp: new Date().toISOString(),
      });
      console.log("PoolList - Sport filter change logged to Firebase Analytics");
    }
  };

  // Handle status filter change
  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    if (analytics) {
      logEvent(analytics, "pool_list_status_filter_changed", {
        userId: user?.uid || "anonymous",
        status: e.target.value,
        timestamp: new Date().toISOString(),
      });
      console.log("PoolList - Status filter change logged to Firebase Analytics");
    }
  };

  // Filter pools based on sport and status
  useEffect(() => {
    let filtered = pools;

    if (sportFilter !== "All") {
      filtered = filtered.filter((pool) => pool.sport === sportFilter);
    }

    if (statusFilter !== "All") {
      filtered = filtered.filter((pool) => pool.status === statusFilter);
    }

    setFilteredPools(filtered);
  }, [pools, sportFilter, statusFilter]);

  // Navigate to pool details
  const handleViewPool = (poolId) => {
    navigate(`/pool/${poolId}`);
    if (analytics) {
      logEvent(analytics, "view_pool", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("PoolList - View pool logged to Firebase Analytics");
    }
  };

  // Extract unique sports for filter
  const sports = ["All", ...new Set(pools.map((pool) => pool.sport).filter(Boolean))];
  const statuses = ["All", "open", "closed", "completed"];

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} aria-label="Loading pools" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: "center", mt: 2 }}>
        <Alert severity="error" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {error}
          <Button
            onClick={handleManualRetry}
            sx={{ ml: 2, fontFamily: "'Poppins', sans-serif'" }}
            startIcon={<RefreshIcon />}
            aria-label="Retry loading pools"
          >
            Retry
          </Button>
        </Alert>
      </Box>
    );
  }

  return (
    <Fade in timeout={1000}>
      <PoolListContainer>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography
            variant="h4"
            sx={{
              fontFamily: "'Montserrat', sans-serif'",
              fontWeight: 700,
              color: mode === "dark" ? muiTheme.palette.text.primary : muiTheme.palette.text.primary,
            }}
          >
            Available Pools
          </Typography>
          <Button
            onClick={handleManualRetry}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            startIcon={<RefreshIcon />}
            aria-label="Refresh pool list"
          >
            Refresh
          </Button>
        </Box>

        {/* Filters */}
        <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Sport</InputLabel>
            <Select
              value={sportFilter}
              onChange={handleSportFilterChange}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Filter pools by sport"
            >
              {sports.map((sport) => (
                <MenuItem key={sport} value={sport} sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                  {sport}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }}>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              sx={{ fontFamily: "'Poppins', sans-serif'" }}
              aria-label="Filter pools by status"
            >
              {statuses.map((status) => (
                <MenuItem key={status} value={status} sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {filteredPools.length === 0 ? (
          <Typography
            sx={{ fontFamily: "'Poppins', sans-serif'", textAlign: "center", mt: 2 }}
          >
            No pools found.
          </Typography>
        ) : (
          <List sx={{ p: 0 }} role="list" aria-label="List of available pools">
            {filteredPools.map((pool) => {
              const isUserPool = user && (pool.commissionerId === user.uid || pool.memberIds?.includes(user.uid));
              return (
                <PoolListItem
                  key={pool.id}
                  isUserPool={isUserPool}
                  role="listitem"
                  aria-label={`Pool: ${pool.poolName}`}
                >
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontFamily: "'Poppins', sans-serif'", fontWeight: 500 }}
                    >
                      {pool.poolName}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    >
                      Sport: {pool.sport || "N/A"} | Format: {pool.format || "N/A"} | Status: {pool.status || "N/A"}
                    </Typography>
                    {pool.totalPot && (
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "'Poppins', sans-serif'" }}
                      >
                        Total Pot: {formatCurrency(pool.totalPot)}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    sx={{
                      fontFamily: "'Poppins', sans-serif'",
                      backgroundColor: muiTheme.palette.secondary.main,
                      "&:hover": { backgroundColor: muiTheme.palette.secondary.light },
                    }}
                    onClick={() => handleViewPool(pool.id)}
                    aria-label={`View details for pool ${pool.poolName}`}
                  >
                    View Pool
                  </Button>
                </PoolListItem>
              );
            })}
          </List>
        )}
      </PoolListContainer>
    </Fade>
  );
}

export default PoolList;