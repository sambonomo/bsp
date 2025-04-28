import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { getAnalyticsService } from "../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";

// MUI Imports
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  InputAdornment,
  Container,
  Paper,
  styled,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

// Styled components for polished UI
const FormContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginTop: theme.spacing(4),
  maxWidth: 400,
  margin: "auto",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.divider,
  boxShadow: theme.shadows[2],
}));

/**
 * A page where a user can change their password.
 * For security, we ask for the current password, re-authenticate, then set the new password.
 */
function ChangePassword() {
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState("");
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const hasLoggedPageView = useRef(false); // Track if change_password_page_viewed has been logged
  const hasLoggedPasswordUpdated = useRef(false); // Track if password_updated has been logged

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Track page view on mount
  useEffect(() => {
    if (!hasLoggedPageView.current && analytics) {
      logEvent(analytics, "change_password_page_viewed", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("ChangePassword - Page view logged to Firebase Analytics");
      hasLoggedPageView.current = true;
    }
  }, [user?.uid, analytics]); // Added analytics to dependencies

  // Password strength validation
  const validatePasswordStrength = (password) => {
    if (password.length < 8) return "Weak: Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "Weak: Password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(password)) return "Weak: Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Weak: Password must contain at least one special character.";
    return "Strong";
  };

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setNewPassword(password);
    setPasswordStrength(validatePasswordStrength(password));
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
          console.log(`ChangePassword - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Validate and update password
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    if (!user) {
      setError("No authenticated user found.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New password and confirm password do not match.");
      setLoading(false);
      return;
    }

    if (passwordStrength.includes("Weak")) {
      setError(passwordStrength);
      setLoading(false);
      return;
    }

    // Re-authenticate user before changing password
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await withRetry("Reauthentication", () => reauthenticateWithCredential(user, cred));

      // If re-auth successful, proceed to update
      await withRetry("Password Update", () => updatePassword(user, newPassword));

      setSuccessMessage("Password updated successfully!");
      setConfirmDialogOpen(false);

      // Log password update (only once)
      if (!hasLoggedPasswordUpdated.current && analytics) {
        logEvent(analytics, "password_updated", {
          userId: user.uid,
          timestamp: new Date().toISOString(),
        });
        console.log("ChangePassword - Password update logged to Firebase Analytics");
        hasLoggedPasswordUpdated.current = true;
      }
    } catch (err) {
      console.error("Error changing password:", err);
      let userFriendlyError = "Failed to change password.";
      if (err.code === "auth/wrong-password") {
        userFriendlyError = "Current password is incorrect.";
      } else if (err.code === "auth/too-many-requests") {
        userFriendlyError = "Too many attempts. Please try again later.";
      } else if (err.code === "auth/weak-password") {
        userFriendlyError = "New password is too weak. Please use a stronger password.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "password_update_failed", {
          userId: user.uid,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("ChangePassword - Password update failure logged to Firebase Analytics");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleConfirmSubmit = () => {
    setConfirmDialogOpen(true);
  };

  const handleCancelPasswordChange = () => {
    navigate("/account");
    if (analytics) {
      logEvent(analytics, "password_change_canceled", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("ChangePassword - Password change canceled logged to Firebase Analytics");
    }
  };

  const handleCancelConfirmDialog = () => {
    setConfirmDialogOpen(false);
    if (analytics) {
      logEvent(analytics, "password_change_confirm_canceled", {
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("ChangePassword - Password change confirmation canceled logged to Firebase Analytics");
    }
  };

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null; // App.js handles loading UI
  }

  return (
    <Container>
      <FormContainer elevation={3}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 700, fontFamily: "'Montserrat', sans-serif'" }}>
          Change Password
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
          <Alert
            severity="success"
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            role="alert"
            aria-live="assertive"
            action={
              <Button color="inherit" size="small" onClick={() => navigate("/account")} aria-label="Go to account page">
                Go to Account
              </Button>
            }
          >
            {successMessage}
          </Alert>
        </Snackbar>

        {/* Password Change Form */}
        <Box
          component="form"
          onSubmit={handleConfirmSubmit}
          noValidate
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField
            type={showCurrentPassword ? "text" : "password"}
            label="Current Password"
            variant="outlined"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    edge="end"
                    aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  >
                    {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            inputProps={{ "aria-label": "Enter current password" }}
          />
          <TextField
            type={showNewPassword ? "text" : "password"}
            label="New Password"
            variant="outlined"
            value={newPassword}
            onChange={handlePasswordChange}
            required
            helperText={passwordStrength}
            FormHelperTextProps={{
              id: "new-password-helper-text",
              sx: { color: passwordStrength.includes("Weak") ? "error.main" : "success.main" },
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    edge="end"
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  >
                    {showNewPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            inputProps={{ "aria-label": "Enter new password", "aria-describedby": "new-password-helper-text" }}
          />
          <TextField
            type={showConfirmPassword ? "text" : "password"}
            label="Confirm New Password"
            variant="outlined"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            required
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    edge="end"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            inputProps={{ "aria-label": "Confirm new password" }}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Update password"
            >
              {loading ? "Updating..." : "Update Password"}
            </Button>
            <Button
              variant="outlined"
              onClick={handleCancelPasswordChange}
              disabled={loading}
              sx={{ fontFamily: "'Poppins', sans-serif'", textTransform: "none" }}
              aria-label="Cancel and go back to account page"
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </FormContainer>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelConfirmDialog}
        aria-labelledby="confirm-password-dialog-title"
        aria-describedby="confirm-password-dialog-content"
      >
        <DialogTitle id="confirm-password-dialog-title">Confirm Password Change</DialogTitle>
        <DialogContent id="confirm-password-dialog-content">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>
            Are you sure you want to change your password?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelConfirmDialog}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Cancel password change confirmation"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            sx={{ fontFamily: "'Poppins', sans-serif'" }}
            aria-label="Confirm password change"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default ChangePassword;