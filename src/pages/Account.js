import React, { useState, useEffect, useRef } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { getDb, getAnalyticsService } from "../firebase/config"; // Updated imports
import { logEvent } from "firebase/analytics";
import { useAuth } from "../contexts/AuthContext";
import { useSubscription } from "../contexts/SubscriptionContext";

// MUI imports
import {
  Box,
  Typography,
  Button,
  Link,
  Stack,
  Container,
  Paper,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Avatar,
  styled,
} from "@mui/material";

// Initialize db with accessor
const db = getDb();

const StyledAvatar = styled(Avatar)(({ theme }) => ({
  width: theme.spacing(10),
  height: theme.spacing(10),
  marginBottom: theme.spacing(2),
  backgroundColor: theme.palette.primary.main,
  fontSize: "2rem",
}));

function Account() {
  const navigate = useNavigate();
  const { user, logout, authLoading } = useAuth();
  const { subscriptionTier, getSubscriptionBenefits, upgradeSubscription } = useSubscription();

  const [userDoc, setUserDoc] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPageView = useRef(false); // Track if account_page_viewed has been logged
  const hasLoggedLogoutSuccess = useRef(false); // Track if logout_success has been logged
  const hasLoggedSubscriptionUpgrade = useRef(false); // Track if subscription_upgraded has been logged
  const hasLoggedDisplayNameUpdated = useRef(false); // Track if display_name_updated has been logged
  const hasLoggedAccountDeleted = useRef(false); // Track if account_deleted has been logged

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
          console.log(`Account - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Fetch user data with retry logic
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchUserDoc = async () => {
      setLoading(true);
      setError("");
      const userRef = doc(db, "users", user.uid);

      try {
        const snapshot = await withRetry("Fetch User Doc", () => getDoc(userRef));
        if (snapshot.exists()) {
          setUserDoc(snapshot.data());
        } else {
          setUserDoc(null);
        }
        setLoading(false);

        // Log account page view (only once)
        if (!hasLoggedPageView.current && analytics) {
          logEvent(analytics, "account_page_viewed", {
            userId: user.uid,
            subscriptionTier,
            timestamp: new Date().toISOString(),
          });
          console.log("Account - Page view logged to Firebase Analytics");
          hasLoggedPageView.current = true;
        }
      } catch (err) {
        console.error("Account - Error fetching user data:", err);
        setError("Failed to fetch user data: " + err.message);
        setLoading(false);
        if (analytics) {
          logEvent(analytics, "fetch_user_doc_failed", {
            userId: user.uid,
            error_message: err.message,
            timestamp: new Date().toISOString(),
          });
          console.log("Account - Fetch user doc failure logged to Firebase Analytics");
        }
      }
    };

    fetchUserDoc();
  }, [user, subscriptionTier]);

  // Reset analytics logging flags when user changes
  useEffect(() => {
    hasLoggedPageView.current = false;
    hasLoggedLogoutSuccess.current = false;
    hasLoggedSubscriptionUpgrade.current = false;
    hasLoggedDisplayNameUpdated.current = false;
    hasLoggedAccountDeleted.current = false;
  }, [user?.uid]);

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress size={24} aria-label="Loading account data" />
      </Container>
    );
  }

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}>
          Account
        </Typography>
        <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
          You are not logged in. Please{" "}
          <Link component={RouterLink} to="/login" underline="hover" aria-label="Go to login page">
            log in
          </Link>
          .
        </Typography>
      </Container>
    );
  }

  async function handleLogout() {
    setError("");
    try {
      await logout();
      // Log logout success (only once)
      if (!hasLoggedLogoutSuccess.current && analytics) {
        logEvent(analytics, "logout_success", {
          userId: user.uid,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Logout logged to Firebase Analytics");
        hasLoggedLogoutSuccess.current = true;
      }
      navigate("/login");
    } catch (err) {
      setError("Failed to log out: " + err.message);
      if (analytics) {
        logEvent(analytics, "logout_failed", {
          userId: user.uid,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Logout failure logged to Firebase Analytics");
      }
    }
  }

  const handleCancelLogout = () => {
    setLogoutDialogOpen(false);
    if (analytics) {
      logEvent(analytics, "logout_canceled", {
        userId: user.uid,
        timestamp: new Date().toISOString(),
      });
      console.log("Account - Logout canceled logged to Firebase Analytics");
    }
  };

  async function handleUpgrade(tier) {
    setError("");
    try {
      await upgradeSubscription(tier);
      setSuccessMessage(`Your subscription has been changed to ${tier}!`);
      // Log subscription upgrade (only once)
      if (!hasLoggedSubscriptionUpgrade.current && analytics) {
        logEvent(analytics, "subscription_upgraded", {
          userId: user.uid,
          newTier: tier,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Subscription upgrade logged to Firebase Analytics");
        hasLoggedSubscriptionUpgrade.current = true;
      }
    } catch (err) {
      setError("Upgrade failed: " + err.message);
      if (analytics) {
        logEvent(analytics, "subscription_upgrade_failed", {
          userId: user.uid,
          newTier: tier,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Subscription upgrade failure logged to Firebase Analytics");
      }
    }
  }

  async function handleUpdateDisplayName() {
    setError("");
    if (!newDisplayName.trim()) {
      setError("Display name cannot be empty.");
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      await withRetry("Update Display Name", () =>
        updateDoc(userRef, { displayName: newDisplayName.trim() })
      );
      setUserDoc((prev) => ({ ...prev, displayName: newDisplayName.trim() }));
      setSuccessMessage("Display name updated successfully!");
      setEditNameDialogOpen(false);
      setNewDisplayName("");
      // Log display name update (only once)
      if (!hasLoggedDisplayNameUpdated.current && analytics) {
        logEvent(analytics, "display_name_updated", {
          userId: user.uid,
          newDisplayName: newDisplayName.trim(),
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Display name update logged to Firebase Analytics");
        hasLoggedDisplayNameUpdated.current = true;
      }
    } catch (err) {
      setError("Failed to update display name: " + err.message);
      if (analytics) {
        logEvent(analytics, "display_name_update_failed", {
          userId: user.uid,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Display name update failure logged to Firebase Analytics");
      }
    }
  }

  const handleCancelEditName = () => {
    setEditNameDialogOpen(false);
    setNewDisplayName("");
    if (analytics) {
      logEvent(analytics, "display_name_edit_canceled", {
        userId: user.uid,
        timestamp: new Date().toISOString(),
      });
      console.log("Account - Display name edit canceled logged to Firebase Analytics");
    }
  };

  async function handleDeleteAccount() {
    setError("");
    try {
      const userRef = doc(db, "users", user.uid);
      await withRetry("Soft Delete User Doc", () =>
        updateDoc(userRef, { deletedAt: new Date().toISOString() })
      ); // Soft delete in Firestore
      await deleteUser(user);
      // Log account deletion (only once)
      if (!hasLoggedAccountDeleted.current && analytics) {
        logEvent(analytics, "account_deleted", {
          userId: user.uid,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Account deletion logged to Firebase Analytics");
        hasLoggedAccountDeleted.current = true;
      }
      navigate("/login");
    } catch (err) {
      setError("Failed to delete account: " + err.message);
      if (analytics) {
        logEvent(analytics, "account_delete_failed", {
          userId: user.uid,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
        console.log("Account - Account deletion failure logged to Firebase Analytics");
      }
    }
  }

  const handleCancelDeleteAccount = () => {
    setDeleteDialogOpen(false);
    if (analytics) {
      logEvent(analytics, "account_delete_canceled", {
        userId: user.uid,
        timestamp: new Date().toISOString(),
      });
      console.log("Account - Account deletion canceled logged to Firebase Analytics");
    }
  };

  const subscriptionBenefits = getSubscriptionBenefits();

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}>
          My Account
        </Typography>

        {/* Error and Success Messages */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}
        <Snackbar
          open={!!successMessage}
          autoHideDuration={3000}
          onClose={() => setSuccessMessage("")}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert severity="success" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
            {successMessage}
          </Alert>
        </Snackbar>

        {/* Profile Picture and Display Name */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <StyledAvatar>
            {userDoc?.displayName ? userDoc.displayName[0] : user.email[0]}
          </StyledAvatar>
          <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'", mb: 1 }}>
            <strong>Display Name:</strong> {userDoc?.displayName || "Not set"}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => {
              setNewDisplayName(userDoc?.displayName || "");
              setEditNameDialogOpen(true);
            }}
            sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
            aria-label="Edit display name"
          >
            Edit Display Name
          </Button>
        </Box>

        {/* Account Details */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            <strong>Email:</strong> {user.email}
          </Typography>
        </Box>

        {/* Subscription Details */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            <strong>Subscription Tier:</strong> {subscriptionTier}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'", mt: 1 }}>
            <strong>Benefits:</strong>
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            - Ad Level: {subscriptionBenefits.adLevel}
          </Typography>
          {subscriptionBenefits.features.length > 0 ? (
            subscriptionBenefits.features.map((feature) => (
              <Typography key={feature} variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
                - {feature}
              </Typography>
            ))
          ) : (
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
              - No additional features
            </Typography>
          )}
        </Box>

        {/* Subscription Upgrade Buttons */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 1, fontFamily: "'Poppins', sans-serif'" }}>
            Upgrade or change your subscription tier:
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={() => handleUpgrade("Bronze")}
              disabled={subscriptionTier === "Bronze"}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Change subscription to Bronze tier"
            >
              Bronze
            </Button>
            <Button
              variant="contained"
              onClick={() => handleUpgrade("Silver")}
              disabled={subscriptionTier === "Silver"}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Change subscription to Silver tier"
            >
              Silver
            </Button>
            <Button
              variant="contained"
              onClick={() => handleUpgrade("Gold")}
              disabled={subscriptionTier === "Gold"}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Change subscription to Gold tier"
            >
              Gold
            </Button>
          </Stack>
        </Box>

        {/* Actions */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontFamily: "'Poppins', sans-serif'" }}>
            Actions
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              component={RouterLink}
              to="/change-password"
              variant="outlined"
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Go to change password page"
            >
              Change Password
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setDeleteDialogOpen(true)}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Delete account"
            >
              Delete Account
            </Button>
            <Button
              variant="outlined"
              onClick={() => setLogoutDialogOpen(true)}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Log out"
            >
              Log Out
            </Button>
          </Stack>
        </Box>

        {/* Terms and Disclaimer */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Reminder: Bonomo Sports Pools is for entertainment purposes only. No real money is exchanged on this site. See our{" "}
            <Link component={RouterLink} to="/tos" underline="hover" aria-label="Go to terms of service page">
              Terms & Disclaimers
            </Link>
            .
          </Typography>
        </Box>
      </Paper>

      {/* Edit Display Name Dialog */}
      <Dialog
        open={editNameDialogOpen}
        onClose={handleCancelEditName}
        aria-labelledby="edit-name-dialog-title"
        aria-describedby="edit-name-dialog-content"
      >
        <DialogTitle id="edit-name-dialog-title">Edit Display Name</DialogTitle>
        <DialogContent id="edit-name-dialog-content">
          <TextField
            fullWidth
            label="New Display Name"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            sx={{ mt: 1 }}
            inputProps={{ "aria-label": "Enter new display name" }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelEditName}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel editing display name"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdateDisplayName}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Save new display name"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog
        open={logoutDialogOpen}
        onClose={handleCancelLogout}
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-content"
      >
        <DialogTitle id="logout-dialog-title">Confirm Logout</DialogTitle>
        <DialogContent id="logout-dialog-content">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Are you sure you want to log out?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelLogout}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel logout"
          >
            Cancel
          </Button>
          <Button
            onClick={handleLogout}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm logout"
          >
            Log Out
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCancelDeleteAccount}
        aria-labelledby="delete-account-dialog-title"
        aria-describedby="delete-account-dialog-content"
      >
        <DialogTitle id="delete-account-dialog-title">Confirm Account Deletion</DialogTitle>
        <DialogContent id="delete-account-dialog-content">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Are you sure you want to delete your account? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelDeleteAccount}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel account deletion"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAccount}
            color="error"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm account deletion"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Account;