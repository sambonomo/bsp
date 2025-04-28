import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useThemeContext } from "../contexts/ThemeContext";
import { useSubscription } from "../contexts/SubscriptionContext";
import { getDb, getAnalyticsService } from "../firebase/config";
import { collection, query, where, onSnapshot, orderBy, startAfter, limit, doc, getDoc } from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Link,
  Grid,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Button,
  Fade,
  styled,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

// Styled components for polished UI
const DashboardContainer = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === "dark"
    ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
    : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
  minHeight: "100vh",
  py: { xs: 6, md: 8 },
  px: { xs: 2, md: 4 },
}));

const PoolCard = styled(Card)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  borderRadius: theme.shape.borderRadius * 2,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
  "&:hover": {
    transform: "scale(1.03)",
    boxShadow: theme.shadows[6],
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#FFD700",
  color: "#0B162A",
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  fontSize: "1rem",
  px: 4,
  py: 1.5,
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  "&:hover": {
    backgroundColor: "#FFEB3B",
    boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
}));

const ViewLink = styled(Link)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? "#FFD700" : "#FF6B00",
  fontWeight: 500,
  fontFamily: "'Poppins', sans-serif'",
  textDecoration: "none",
  transition: "color 0.3s ease",
  "&:hover": {
    color: theme.palette.mode === "dark" ? "#FFEB3B" : "#FF8E33",
    textDecoration: "underline",
  },
}));

const ManageLink = styled(Link)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? "#34D399" : "#16A34A",
  fontWeight: 500,
  fontFamily: "'Poppins', sans-serif'",
  textDecoration: "none",
  transition: "color 0.3s ease",
  "&:hover": {
    color: theme.palette.mode === "dark" ? "#6EE7B7" : "#22C55E",
    textDecoration: "underline",
  },
}));

function Dashboard() {
  const { user, authLoading } = useAuth();
  const { subscriptionTier } = useSubscription();
  const { mode } = useThemeContext();
  const isDarkMode = mode === "dark";
  const navigate = useNavigate();
  const [myPools, setMyPools] = useState([]);
  const [filteredPools, setFilteredPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [lastDoc, setLastDoc] = useState({ commissioner: null, member: null });
  const [hasMore, setHasMore] = useState({ commissioner: true, member: true });
  const [poolCountAnnouncement, setPoolCountAnnouncement] = useState(""); // For accessibility announcement
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const PAGE_SIZE = 10;
  const hasLoggedPageView = useRef(false);
  const hasLoggedRefresh = useRef(false);
  const hasLoggedFilterChange = useRef(false);
  const hasLoggedSortChange = useRef(false);
  const hasLoggedPoolCardClick = useRef({});
  const hasLoggedManagePoolClick = useRef({}); // Added for manage pool click logging
  const hasLoggedCreatePoolClick = useRef(false);
  const hasLoggedJoinPoolClick = useRef(false);
  const hasLoggedLoadMore = useRef(false);
  const db = getDb(); // Initialize db with accessor

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount (only once)
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "dashboard_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, analytics]);

  // Fetch pools with real-time updates and pagination
  useEffect(() => {
    if (authLoading) {
      return; // Wait for auth state to resolve
    }

    if (!user) {
      setLoading(false);
      navigate("/login");
      return;
    }

    const fetchPools = async () => {
      setLoading(true);
      setError("");
      const poolsRef = collection(db, "pools");
      const userId = user.uid;
      const userPoolsMap = {};

      const baseQueryCommissioner = query(
        poolsRef,
        where("commissionerId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const baseQueryMember = query(
        poolsRef,
        where("memberIds", "array-contains", userId),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );

      let pendingUpdates = 2; // Track completion of both listeners

      const updatePoolList = () => {
        pendingUpdates -= 1;
        if (pendingUpdates === 0) {
          const validPools = Object.values(userPoolsMap).filter(pool => pool.id); // Ensure pool.id exists
          setMyPools(validPools);
          setLoading(false);
        }
      };

      // Initial fetch for commissioner pools
      const unsubscribeComm = await withRetry("Commissioner Pools Fetch", () =>
        onSnapshot(
          baseQueryCommissioner,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added" || change.type === "modified") {
                const poolData = change.doc.data();
                const poolId = change.doc.id;
                // Validate pool existence
                if (poolId && poolData.createdAt) {
                  userPoolsMap[poolId] = { ...poolData, id: poolId };
                }
              } else if (change.type === "removed") {
                delete userPoolsMap[change.doc.id];
              }
            });
            if (snapshot.docs.length > 0) {
              setLastDoc((prev) => ({
                ...prev,
                commissioner: snapshot.docs[snapshot.docs.length - 1],
              }));
              setHasMore((prev) => ({
                ...prev,
                commissioner: snapshot.docs.length === PAGE_SIZE,
              }));
            } else {
              setHasMore((prev) => ({ ...prev, commissioner: false }));
            }
            updatePoolList();
          },
          (err) => handleError(err, "Commissioner Pools Fetch")
        )
      );

      // Initial fetch for member pools
      const unsubscribeMember = await withRetry("Member Pools Fetch", () =>
        onSnapshot(
          baseQueryMember,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added" || change.type === "modified") {
                const poolData = change.doc.data();
                const poolId = change.doc.id;
                // Validate pool existence
                if (poolId && poolData.createdAt) {
                  // Only add if not already in userPoolsMap to avoid duplicates
                  if (!userPoolsMap[poolId]) {
                    userPoolsMap[poolId] = { ...poolData, id: poolId };
                  }
                }
              } else if (change.type === "removed") {
                delete userPoolsMap[change.doc.id];
              }
            });
            if (snapshot.docs.length > 0) {
              setLastDoc((prev) => ({
                ...prev,
                member: snapshot.docs[snapshot.docs.length - 1],
              }));
              setHasMore((prev) => ({
                ...prev,
                member: snapshot.docs.length === PAGE_SIZE,
              }));
            } else {
              setHasMore((prev) => ({ ...prev, member: false }));
            }
            updatePoolList();
          },
          (err) => handleError(err, "Member Pools Fetch")
        )
      );

      return () => {
        if (unsubscribeComm) unsubscribeComm();
        if (unsubscribeMember) unsubscribeMember();
      };
    };

    fetchPools();
  }, [user, authLoading, analytics, subscriptionTier, navigate]);

  // Load more pools
  const loadMorePools = async () => {
    setLoadingMore(true);
    const userId = user.uid;
    const userPoolsMap = { ...myPools.reduce((map, pool) => ({ ...map, [pool.id]: pool }), {}) };
    let pendingUpdates = (hasMore.commissioner ? 1 : 0) + (hasMore.member ? 1 : 0);

    const updatePoolList = () => {
      pendingUpdates -= 1;
      if (pendingUpdates === 0) {
        const updatedPools = Object.values(userPoolsMap);
        setMyPools(updatedPools);
        setLoadingMore(false);
        // Announce the updated pool count for accessibility
        setPoolCountAnnouncement(`Loaded ${updatedPools.length} pools`);
      }
    };

    // Fetch more commissioner pools
    if (hasMore.commissioner) {
      const qCommissioner = query(
        collection(db, "pools"),
        where("commissionerId", "==", userId),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc.commissioner),
        limit(PAGE_SIZE)
      );

      await withRetry("Load More Commissioner Pools", () =>
        onSnapshot(
          qCommissioner,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added" || change.type === "modified") {
                const poolData = change.doc.data();
                const poolId = change.doc.id;
                if (poolId && poolData.createdAt) {
                  userPoolsMap[poolId] = { ...poolData, id: poolId };
                }
              } else if (change.type === "removed") {
                delete userPoolsMap[change.doc.id];
              }
            });
            if (snapshot.docs.length > 0) {
              setLastDoc((prev) => ({
                ...prev,
                commissioner: snapshot.docs[snapshot.docs.length - 1],
              }));
              setHasMore((prev) => ({
                ...prev,
                commissioner: snapshot.docs.length === PAGE_SIZE,
              }));
            } else {
              setHasMore((prev) => ({ ...prev, commissioner: false }));
            }
            updatePoolList();
          },
          (err) => {
            setError("Failed to load more pools. Please try again.");
            setLoadingMore(false);
            if (analytics) {
              logEvent(analytics, "load_more_failed", {
                userId: user?.uid || "anonymous",
                error_message: err.message || "Unknown error",
                timestamp: new Date().toISOString(),
              });
              console.log("Dashboard - Load more failure logged to Firebase Analytics");
            }
          }
        )
      );
    }

    // Fetch more member pools
    if (hasMore.member) {
      const qMember = query(
        collection(db, "pools"),
        where("memberIds", "array-contains", userId),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc.member),
        limit(PAGE_SIZE)
      );

      await withRetry("Load More Member Pools", () =>
        onSnapshot(
          qMember,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added" || change.type === "modified") {
                const poolData = change.doc.data();
                const poolId = change.doc.id;
                if (poolId && poolData.createdAt) {
                  if (!userPoolsMap[poolId]) {
                    userPoolsMap[poolId] = { ...poolData, id: poolId };
                  }
                }
              } else if (change.type === "removed") {
                delete userPoolsMap[change.doc.id];
              }
            });
            if (snapshot.docs.length > 0) {
              setLastDoc((prev) => ({
                ...prev,
                member: snapshot.docs[snapshot.docs.length - 1],
              }));
              setHasMore((prev) => ({
                ...prev,
                member: snapshot.docs.length === PAGE_SIZE,
              }));
            } else {
              setHasMore((prev) => ({ ...prev, member: false }));
            }
            updatePoolList();
          },
          (err) => {
            setError("Failed to load more pools. Please try again.");
            setLoadingMore(false);
            if (analytics) {
              logEvent(analytics, "load_more_failed", {
                userId: user?.uid || "anonymous",
                error_message: err.message || "Unknown error",
                timestamp: new Date().toISOString(),
              });
              console.log("Dashboard - Load more failure logged to Firebase Analytics");
            }
          }
        )
      );
    }

    // If no more pools to fetch, update state immediately
    if (pendingUpdates === 0) {
      setMyPools(Object.values(userPoolsMap));
      setLoadingMore(false);
    }

    // Log load more click (only once per click)
    if (!hasLoggedLoadMore.current && analytics) {
      logEvent(analytics, "load_more_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Load more click logged to Firebase Analytics");
      hasLoggedLoadMore.current = true;
    }
  };

  // Retry logic for Firebase operations
  const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error) {
        if (analytics) {
          logEvent(analytics, "firebase_operation_retry", {
            userId: user?.uid || "anonymous",
            operation,
            attempt,
            error_message: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`Dashboard - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * retryDelayBase;
        console.log(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  // Handle Firestore errors
  const handleError = (err, operation) => {
    console.error(`${operation} Error:`, err);
    let userFriendlyError = "Failed to load pools. Please try again.";
    if (err.code === "permission-denied") {
      userFriendlyError = "You do not have permission to view pools.";
    } else if (err.code === "unavailable") {
      userFriendlyError = "Firestore is currently unavailable. Please try again later.";
    }
    setError(userFriendlyError);
    setLoading(false);
    if (analytics) {
      logEvent(analytics, "pools_fetch_failed", {
        userId: user?.uid || "anonymous",
        error_message: userFriendlyError,
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Pools fetch failure logged to Firebase Analytics");
    }
  };

  // Filter and sort pools
  useEffect(() => {
    let filtered = myPools;

    if (filterRole === "commissioner") {
      filtered = filtered.filter((pool) => pool.commissionerId === user?.uid);
    } else if (filterRole === "member") {
      filtered = filtered.filter((pool) => pool.commissionerId !== user?.uid && pool.memberIds?.includes(user?.uid));
    }

    if (sortBy === "createdAt") {
      filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } else if (sortBy === "name") {
      filtered.sort((a, b) => (a.poolName || "").localeCompare(b.poolName || ""));
    }

    setFilteredPools(filtered);
  }, [myPools, filterRole, sortBy, user]);

  // Handle manual refresh
  const handleRefresh = () => {
    setLoading(true);
    setError("");
    setMyPools([]);
    setLastDoc({ commissioner: null, member: null });
    setHasMore({ commissioner: true, member: true });
    if (!hasLoggedRefresh.current && analytics) {
      logEvent(analytics, "dashboard_refreshed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Refresh logged to Firebase Analytics");
      hasLoggedRefresh.current = true;
    }
  };

  // Handle filter change
  const handleFilterChange = (e) => {
    setFilterRole(e.target.value);
    if (!hasLoggedFilterChange.current && analytics) {
      logEvent(analytics, "dashboard_filter_changed", {
        userId: user?.uid || "anonymous",
        filterRole: e.target.value,
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Filter role changed logged to Firebase Analytics");
      hasLoggedFilterChange.current = true;
    }
  };

  // Handle sort change
  const handleSortChange = (e) => {
    setSortBy(e.target.value);
    if (!hasLoggedSortChange.current && analytics) {
      logEvent(analytics, "dashboard_sort_changed", {
        userId: user?.uid || "anonymous",
        sortBy: e.target.value,
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Sort by changed logged to Firebase Analytics");
      hasLoggedSortChange.current = true;
    }
  };

  // Handle pool card click with validation
  const handlePoolClick = async (poolId) => {
    try {
      const poolRef = doc(db, "pools", poolId);
      const poolSnap = await getDoc(poolRef);
      if (!poolSnap.exists()) {
        setError(`Pool with ID ${poolId} does not exist. It may have been deleted.`);
        console.error(`Pool not found: ${poolId}`);
        // Remove the invalid pool from the list
        setMyPools(prevPools => prevPools.filter(pool => pool.id !== poolId));
        return;
      }

      // Proceed with navigation if pool exists
      navigate(`/pool/${poolId}`);

      if (!hasLoggedPoolCardClick.current[poolId] && analytics) {
        logEvent(analytics, "pool_card_clicked", {
          userId: user?.uid || "anonymous",
          poolId,
          timestamp: new Date().toISOString(),
        });
        console.log("Dashboard - Pool card click logged to Firebase Analytics");
        hasLoggedPoolCardClick.current[poolId] = true;
      }
    } catch (err) {
      console.error("Error validating pool:", err);
      setError("Failed to validate pool. Please try again.");
      if (analytics) {
        logEvent(analytics, "pool_card_click_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("Dashboard - Pool card click failure logged to Firebase Analytics");
      }
    }
  };

  // Handle manage pool click with validation
  const handleManagePoolClick = async (poolId) => {
    try {
      const poolRef = doc(db, "pools", poolId);
      const poolSnap = await getDoc(poolRef);
      if (!poolSnap.exists()) {
        setError(`Pool with ID ${poolId} does not exist. It may have been deleted.`);
        console.error(`Pool not found: ${poolId}`);
        // Remove the invalid pool from the list
        setMyPools(prevPools => prevPools.filter(pool => pool.id !== poolId));
        return;
      }

      // Proceed with navigation if pool exists
      navigate(`/manage-pool/${poolId}`);

      if (!hasLoggedManagePoolClick.current[poolId] && analytics) {
        logEvent(analytics, "manage_pool_card_clicked", {
          userId: user?.uid || "anonymous",
          poolId,
          timestamp: new Date().toISOString(),
        });
        console.log("Dashboard - Manage pool card click logged to Firebase Analytics");
        hasLoggedManagePoolClick.current[poolId] = true;
      }
    } catch (err) {
      console.error("Error validating pool for management:", err);
      setError("Failed to validate pool for management. Please try again.");
      if (analytics) {
        logEvent(analytics, "manage_pool_card_click_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("Dashboard - Manage pool card click failure logged to Firebase Analytics");
      }
    }
  };

  // Handle create pool click
  const handleCreatePoolClick = () => {
    if (!hasLoggedCreatePoolClick.current && analytics) {
      logEvent(analytics, "create_pool_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Create pool click logged to Firebase Analytics");
      hasLoggedCreatePoolClick.current = true;
    }
  };

  // Handle join pool click
  const handleJoinPoolClick = () => {
    if (!hasLoggedJoinPoolClick.current && analytics) {
      logEvent(analytics, "join_pool_clicked", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("Dashboard - Join pool click logged to Firebase Analytics");
      hasLoggedJoinPoolClick.current = true;
    }
  };

  // Reset analytics logging flags when user changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedRefresh.current = false;
    hasLoggedFilterChange.current = false;
    hasLoggedSortChange.current = false;
    hasLoggedPoolCardClick.current = {};
    hasLoggedManagePoolClick.current = {}; // Reset for manage pool clicks
    hasLoggedCreatePoolClick.current = false;
    hasLoggedJoinPoolClick.current = false;
    hasLoggedLoadMore.current = false;
  }, [user?.uid]);

  // Show loading UI while auth state is resolving
  if (authLoading) {
    return (
      <DashboardContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress sx={{ color: "#FFD700", mb: 2 }} aria-label="Loading authentication state" />
              <Typography
                variant="body1"
                sx={{
                  mb: 2,
                  fontFamily: "'Poppins', sans-serif'",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                Loading authentication state...
              </Typography>
            </Box>
          </Fade>
        </Container>
      </DashboardContainer>
    );
  }

  // Show loading UI while fetching pools
  if (loading) {
    return (
      <DashboardContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress sx={{ color: "#FFD700", mb: 2 }} aria-label="Loading pools" />
              <Typography
                variant="body1"
                sx={{
                  mb: 2,
                  fontFamily: "'Poppins', sans-serif'",
                  color: isDarkMode ? "#B0BEC5" : "#555555",
                }}
              >
                Loading your pools...
              </Typography>
            </Box>
          </Fade>
        </Container>
      </DashboardContainer>
    );
  }

  // Show error message if fetching fails
  if (error) {
    return (
      <DashboardContainer>
        <Container maxWidth="lg">
          <Fade in timeout={1000}>
            <Box sx={{ py: 4 }}>
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} role="alert" aria-live="assertive">
                {error}
                <Button
                  onClick={handleRefresh}
                  sx={{ ml: 2, fontFamily: "'Poppins', sans-serif'" }}
                  startIcon={<RefreshIcon />}
                  aria-label="Retry loading pools"
                >
                  Retry
                </Button>
              </Alert>
            </Box>
          </Fade>
        </Container>
      </DashboardContainer>
    );
  }

  // Render the dashboard if user is authenticated
  return (
    <DashboardContainer>
      <Container maxWidth="lg">
        <Fade in timeout={1000}>
          <Box sx={{ py: 4 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  fontFamily: "'Montserrat', sans-serif'",
                  color: isDarkMode ? "#FFFFFF" : "#0B162A",
                }}
              >
                My Pools
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} id="filter-role-label">Filter Role</InputLabel>
                  <Select
                    labelId="filter-role-label"
                    value={filterRole}
                    onChange={handleFilterChange}
                    sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    aria-label="Filter pools by role"
                    aria-describedby="filter-role-label"
                  >
                    <MenuItem value="all" sx={{ fontFamily: "'Poppins', sans-serif'" }}>All</MenuItem>
                    <MenuItem value="commissioner" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Commissioner</MenuItem>
                    <MenuItem value="member" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Member</MenuItem>
                  </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} id="sort-by-label">Sort By</InputLabel>
                  <Select
                    labelId="sort-by-label"
                    value={sortBy}
                    onChange={handleSortChange}
                    sx={{ fontFamily: "'Poppins', sans-serif'" }}
                    aria-label="Sort pools"
                    aria-describedby="sort-by-label"
                  >
                    <MenuItem value="createdAt" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Created Date</MenuItem>
                    <MenuItem value="name" sx={{ fontFamily: "'Poppins', sans-serif'" }}>Pool Name</MenuItem>
                  </Select>
                </FormControl>
                <StyledButton
                  onClick={handleRefresh}
                  startIcon={<RefreshIcon />}
                  aria-label="Refresh pool list"
                >
                  Refresh
                </StyledButton>
                <StyledButton
                  component={RouterLink}
                  to="/create-pool"
                  onClick={handleCreatePoolClick}
                  aria-label="Create a new pool"
                >
                  Create a Pool
                </StyledButton>
                <StyledButton
                  component={RouterLink}
                  to="/join"
                  onClick={handleJoinPoolClick}
                  aria-label="Join a pool"
                >
                  Join a Pool
                </StyledButton>
              </Box>
            </Box>

            {filteredPools.length === 0 ? (
              <Box sx={{ textAlign: "center" }}>
                <Typography
                  variant="body1"
                  sx={{
                    mb: 3,
                    fontFamily: "'Poppins', sans-serif'",
                    color: isDarkMode ? "#B0BEC5" : "#555555",
                  }}
                >
                  You have no {filterRole === "all" ? "active pools" : filterRole === "commissioner" ? "pools where you are a commissioner" : "pools where you are a member"} yet! Create one now or join an existing pool.
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                  <StyledButton
                    component={RouterLink}
                    to="/create-pool"
                    onClick={handleCreatePoolClick}
                    aria-label="Create a new pool"
                  >
                    Create a Pool
                  </StyledButton>
                  <StyledButton
                    component={RouterLink}
                    to="/join"
                    onClick={handleJoinPoolClick}
                    aria-label="Join a pool"
                  >
                    Join a Pool
                  </StyledButton>
                </Box>
              </Box>
            ) : (
              <>
                <Grid container spacing={3}>
                  {Array.isArray(filteredPools) && filteredPools.map((pool) => {
                    const isRecent = pool.createdAt?.toDate && (new Date() - pool.createdAt.toDate()) < 7 * 24 * 60 * 60 * 1000;
                    const isCommissioner = pool.commissionerId === user?.uid;
                    return (
                      <Grid item xs={12} sm={6} md={4} key={pool.id}>
                        <Fade in timeout={1200}>
                          <PoolCard variant="outlined">
                            <CardContent>
                              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                                <Typography
                                  variant="subtitle1"
                                  sx={{
                                    fontWeight: 600,
                                    fontFamily: "'Poppins', sans-serif'",
                                    color: isDarkMode ? "#FFFFFF" : "#0B162A",
                                  }}
                                >
                                  {pool.poolName || "Untitled Pool"}
                                </Typography>
                                {isRecent && (
                                  <Chip
                                    label="Recently Created"
                                    size="small"
                                    sx={{ bgcolor: "#FFD700", color: "#0B162A", fontFamily: "'Poppins', sans-serif'" }}
                                    aria-label="Recently created pool"
                                  />
                                )}
                              </Box>
                              <Typography
                                variant="body2"
                                sx={{
                                  mb: 1,
                                  fontFamily: "'Poppins', sans-serif'",
                                  color: isDarkMode ? "#B0BEC5" : "#555555",
                                }}
                              >
                                {pool.sport || "N/A"} / {pool.formatName || pool.format || "N/A"}
                              </Typography>
                              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: "'Poppins', sans-serif'",
                                    color: isDarkMode ? "#B0BEC5" : "#555555",
                                  }}
                                >
                                  Members: {pool.memberIds?.length || 1}
                                </Typography>
                                <Chip
                                  label={pool.status || "N/A"}
                                  size="small"
                                  color={
                                    pool.status === "open"
                                      ? "success"
                                      : pool.status === "closed"
                                      ? "warning"
                                      : "default"
                                  }
                                  sx={{ fontFamily: "'Poppins', sans-serif'" }}
                                  aria-label={`Pool status: ${pool.status || "N/A"}`}
                                />
                              </Box>
                              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                <ViewLink
                                  component="button"
                                  onClick={() => handlePoolClick(pool.id)}
                                  aria-label={`View pool ${pool.poolName || "Untitled Pool"}`}
                                >
                                  View Pool
                                </ViewLink>
                                {isCommissioner && (
                                  <ManageLink
                                    component="button"
                                    onClick={() => handleManagePoolClick(pool.id)}
                                    aria-label={`Manage pool ${pool.poolName || "Untitled Pool"}`}
                                  >
                                    Manage Pool
                                  </ManageLink>
                                )}
                              </Box>
                            </CardContent>
                          </PoolCard>
                        </Fade>
                      </Grid>
                    );
                  })}
                </Grid>
                {(hasMore.commissioner || hasMore.member) && (
                  <Box sx={{ textAlign: "center", mt: 4 }}>
                    <StyledButton
                      onClick={loadMorePools}
                      disabled={loadingMore}
                      aria-label={loadingMore ? "Loading more pools" : "Load more pools"}
                    >
                      {loadingMore ? "Loading..." : "Load More"}
                    </StyledButton>
                    <Box sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} aria-live="polite">
                      {poolCountAnnouncement}
                    </Box>
                  </Box>
                )}
              </>
            )}
          </Box>
        </Fade>
      </Container>
    </DashboardContainer>
  );
}

export default Dashboard;