import React, { useState, useEffect, useRef } from "react";
import { doc, updateDoc, arrayUnion, arrayRemove, onSnapshot, runTransaction } from "firebase/firestore";
import { getDb, getAnalyticsService } from "../../firebase/config"; // Updated imports
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { logEvent } from "firebase/analytics";
import { v4 as uuidv4 } from "uuid";

// MUI imports
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  Typography,
  Box,
  Stack,
  Alert,
  Fade,
  IconButton,
  Tooltip,
  styled,
  Checkbox,
  FormControlLabel,
  Snackbar,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningIcon from "@mui/icons-material/Warning";
import NotificationsIcon from "@mui/icons-material/Notifications"; // Fixed import: NotificationIcon -> NotificationsIcon

// Initialize db with accessor
const db = getDb();

// Styled components for polished UI
const StyledDialogTitle = styled(DialogTitle)(({ theme }) => ({
  fontFamily: "\"Montserrat\", sans-serif",
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#FFFFFF" : "#0B162A",
  backgroundColor: theme.palette.mode === "dark" ? "#1A2A44" : "#FAFAFA",
  borderBottom: `1px solid ${theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0"}`,
}));

const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#1A2A44" : "#FAFAFA",
  color: theme.palette.mode === "dark" ? "#FFFFFF" : "#0B162A",
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#FFD700",
  color: "#0B162A",
  fontWeight: 600,
  fontFamily: "\"Poppins\", sans-serif",
  "&:hover": {
    backgroundColor: "#FFEB3B",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const MemberItem = styled(ListItem, {
  shouldForwardProp: (prop) => prop !== "hasZeroPayment" && prop !== "highlight",
})(({ theme, hasZeroPayment, highlight }) => ({
  backgroundColor: hasZeroPayment
    ? theme.palette.mode === "dark"
      ? theme.palette.warning.dark
      : theme.palette.warning.light
    : highlight
    ? theme.palette.mode === "dark"
      ? theme.palette.success.dark
      : theme.palette.success.light
    : theme.palette.mode === "dark"
    ? "#2A3B5A"
    : "#FFFFFF",
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: theme.palette.mode === "dark" ? "#3A4B6A" : "#E0E0E0",
  mb: 1,
  p: 1,
  transition: "transform 0.3s ease, box-shadow 0.3s ease, background-color 0.5s ease",
  "&:hover": {
    transform: "scale(1.02)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  },
}));

function ManageMembersModal({ open, onClose, poolId }) {
  const { user, authLoading } = useAuth();
  const { mode } = useThemeContext();
  const [poolData, setPoolData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [paymentHighlight, setPaymentHighlight] = useState({}); // For highlighting payment changes
  const [analytics, setAnalytics] = useState(null); // State for analytics
  const maxRetries = 3;
  const hasLoggedModalOpen = useRef(false);
  const [confirmRemoveDialogOpen, setConfirmRemoveDialogOpen] = useState(false);
  const [membersToRemove, setMembersToRemove] = useState([]);
  const hasLoggedConfirmRemoveOpen = useRef(false);
  const hasLoggedConfirmRemove = useRef(false);
  const hasLoggedCancelRemove = useRef(false);
  const hasLoggedNotifyUnpaid = useRef(false);
  const hasSavedPayments = useRef(false); // Track if payments were saved

  // For adding offline user
  const [offlineName, setOfflineName] = useState("");

  // For tracking numeric offline payments: { [uid]: number }
  const [payments, setPayments] = useState({});

  // For tracking payment errors: { [uid]: string }
  const [paymentErrors, setPaymentErrors] = useState({});

  // For editing offline user names
  const [editingUserId, setEditingUserId] = useState(null);
  const [editName, setEditName] = useState("");

  // For tracking selected members for bulk actions
  const [selectedMembers, setSelectedMembers] = useState([]);

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
          console.log(`ManageMembersModal - ${operation} retry attempt ${attempt} logged to Firebase Analytics`);
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

  // Load Pool Data with real-time updates
  useEffect(() => {
    if (!poolId || !open) return;

    console.log("ManageMembersModal - Setting up live updates for poolId:", poolId);
    const poolRef = doc(db, "pools", poolId);

    const setupListener = async () => {
      setLoading(true);
      setError("");
      setRetryCount(0);

      const unsubscribe = await withRetry("Fetch Pool Data", () =>
        onSnapshot(
          poolRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setPoolData(data);

              // Update payments if they exist
              if (data.payments) {
                setPayments(data.payments);
                const newPaymentErrors = {};
                Object.entries(data.payments).forEach(([uid, amount]) => {
                  if (isNaN(amount) || amount < 0) {
                    newPaymentErrors[uid] = "Payment must be a non-negative number.";
                  }
                });
                setPaymentErrors(newPaymentErrors);
              } else {
                setPayments({});
                setPaymentErrors({});
              }

              setLoading(false);
              setError("");
              console.log("ManageMembersModal - Fetched pool data:", data);
            } else {
              setError("Pool not found.");
              console.warn("ManageMembersModal - Pool not found:", poolId);
              setLoading(false);
            }
          },
          (err) => {
            console.error("ManageMembersModal - Error fetching pool data:", err);
            setError(err.message || "Failed to fetch pool data.");
            setLoading(false);
            if (analytics) {
              logEvent(analytics, "fetch_pool_data_failed", {
                poolId,
                userId: user?.uid || "anonymous",
                error_message: err.message || "Unknown error",
                timestamp: new Date().toISOString(),
              });
              console.log("ManageMembersModal - Fetch pool data failure logged to Firebase Analytics");
            }
          }
        )
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
          console.log("ManageMembersModal - Unsubscribed from live updates for poolId:", poolId);
        }
      };
    };

    setupListener();

    // Log modal open (only once)
    if (open && !hasLoggedModalOpen.current && analytics) {
      logEvent(analytics, "manage_members_modal_opened", {
        poolId,
        userId: user?.uid || "anonymous",
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Modal open logged to Firebase Analytics");
      hasLoggedModalOpen.current = true;
    }

    // Reset modal open tracking when modal closes
    if (!open) {
      hasLoggedModalOpen.current = false;
      hasLoggedNotifyUnpaid.current = false;
      setSelectedMembers([]);
      hasSavedPayments.current = false; // Reset payment save tracking
    }
  }, [poolId, open, user]);

  // Check if user is commissioner
  const isCommissioner = poolData?.commissionerId === user?.uid;

  // Handle selection of members for bulk actions
  const handleSelectMember = (uid) => {
    setSelectedMembers((prev) =>
      prev.includes(uid)
        ? prev.filter((id) => id !== uid)
        : [...prev, uid]
    );
  };

  // Handle select all members
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedMembers(poolData?.memberIds || []);
    } else {
      setSelectedMembers([]);
    }
  };

  // Open confirmation dialog for member removal
  const openConfirmRemoveDialog = (uids) => {
    setMembersToRemove(uids);
    setConfirmRemoveDialogOpen(true);
    if (!hasLoggedConfirmRemoveOpen.current && analytics) {
      logEvent(analytics, "confirm_remove_member_dialog_opened", {
        userId: user?.uid || "anonymous",
        poolId,
        memberIds: uids,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Confirm remove member dialog opened logged to Firebase Analytics");
      hasLoggedConfirmRemoveOpen.current = true;
    }
  };

  // Handle confirmed removal of members (bulk)
  async function handleConfirmRemoveMember() {
    if (!membersToRemove || membersToRemove.length === 0) return;

    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);
      const newPayments = { ...payments };
      membersToRemove.forEach((uid) => {
        delete newPayments[uid];
      });

      let newOfflineUsers = poolData?.offlineUsers || [];
      membersToRemove.forEach((uid) => {
        if (uid.startsWith("offline_")) {
          newOfflineUsers = newOfflineUsers.filter((user) => user.id !== uid);
        }
      });

      await withRetry("Remove Members", () =>
        updateDoc(poolRef, {
          memberIds: arrayRemove(...membersToRemove),
          payments: newPayments,
          offlineUsers: newOfflineUsers,
        })
      );

      console.log("handleConfirmRemoveMember - Removed members:", membersToRemove);
      if (analytics) {
        logEvent(analytics, "remove_members_bulk", {
          userId: user?.uid,
          poolId,
          memberIds: membersToRemove,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Remove members bulk logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleConfirmRemoveMember - Error:", err);
      setError(err.message || "Failed to remove members.");
      if (analytics) {
        logEvent(analytics, "remove_members_bulk_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          memberIds: membersToRemove,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Remove members bulk failure logged to Firebase Analytics");
      }
    } finally {
      setConfirmRemoveDialogOpen(false);
      setMembersToRemove([]);
      setSelectedMembers([]);
      if (!hasLoggedConfirmRemove.current && analytics) {
        logEvent(analytics, "confirm_remove_member", {
          userId: user?.uid || "anonymous",
          poolId,
          memberIds: membersToRemove,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Confirm remove member logged to Firebase Analytics");
        hasLoggedConfirmRemove.current = true;
      }
    }
  }

  // Handle canceling the removal
  const handleCancelRemove = () => {
    setConfirmRemoveDialogOpen(false);
    setMembersToRemove([]);
    if (!hasLoggedCancelRemove.current && analytics) {
      logEvent(analytics, "cancel_remove_member", {
        userId: user?.uid || "anonymous",
        poolId,
        memberIds: membersToRemove,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Cancel remove member logged to Firebase Analytics");
      hasLoggedCancelRemove.current = true;
    }
  };

  // Handle notifying unpaid members
  const handleNotifyUnpaidMembers = () => {
    const unpaidMembers = Object.entries(payments)
      .filter(([_, amount]) => amount === 0)
      .map(([uid]) => {
        const isOffline = uid.startsWith("offline_");
        const offlineUser = poolData?.offlineUsers?.find((user) => user.id === uid);
        return isOffline
          ? `Offline User: ${offlineUser ? offlineUser.name : uid}`
          : `User ID: ${uid.slice(0, 8)}...`;
      });

    if (unpaidMembers.length === 0) {
      setNotificationMessage("No unpaid members to notify.");
    } else {
      console.log("Notifying unpaid members:", unpaidMembers);
      setNotificationMessage(`Notified ${unpaidMembers.length} unpaid member(s).`);

      if (analytics && !hasLoggedNotifyUnpaid.current) {
        logEvent(analytics, "notify_unpaid_members", {
          userId: user?.uid,
          poolId,
          unpaidMemberCount: unpaidMembers.length,
          unpaidMemberIds: Object.keys(payments).filter((uid) => payments[uid] === 0),
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Notify unpaid members logged to Firebase Analytics");
        hasLoggedNotifyUnpaid.current = true;
      }
    }
  };

  // Reset analytics logging flags when modal closes or user/poolId changes
  useEffect(() => {
    if (!open) {
      hasLoggedConfirmRemoveOpen.current = false;
      hasLoggedConfirmRemove.current = false;
      hasLoggedCancelRemove.current = false;
      hasLoggedNotifyUnpaid.current = false;
    }
  }, [open, user?.uid, poolId]);

  // Handle adding an offline user
  async function handleAddOfflineUser() {
    if (!isCommissioner) {
      setError("Only the commissioner can add offline users.");
      console.warn("handleAddOfflineUser - User is not commissioner:", user?.uid);
      return;
    }
    if (!offlineName.trim()) {
      setError("Offline user name cannot be empty.");
      console.warn("handleAddOfflineUser - Offline name is empty");
      return;
    }

    const pseudoId = "offline_" + uuidv4().replace(/-/g, ""); // Use UUID for unique ID

    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);

      await withRetry("Add Offline User Transaction", () =>
        runTransaction(db, async (transaction) => {
          const poolDoc = await transaction.get(poolRef);
          if (!poolDoc.exists()) {
            throw new Error("Pool does not exist.");
          }

          const poolData = poolDoc.data();
          const currentMemberIds = poolData.memberIds || [];
          const currentOfflineUsers = poolData.offlineUsers || [];

          const newOfflineUsers = [...currentOfflineUsers, { id: pseudoId, name: offlineName }];
          const newMemberIds = [...currentMemberIds, pseudoId];

          transaction.update(poolRef, {
            memberIds: newMemberIds,
            offlineUsers: newOfflineUsers,
          });
        })
      );

      setOfflineName("");
      console.log("handleAddOfflineUser - Added offline user:", { id: pseudoId, name: offlineName });
      if (analytics) {
        logEvent(analytics, "add_offline_user", {
          userId: user?.uid,
          poolId,
          offlineUserId: pseudoId,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Add offline user logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleAddOfflineUser - Error:", err);
      let userFriendlyError = err.message || "Failed to add offline user.";
      if (err.message.includes("Pool does not exist")) {
        userFriendlyError = "This pool no longer exists.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "add_offline_user_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Add offline user failure logged to Firebase Analytics");
      }
    }
  }

  // Handle editing an offline user name
  function handleEditUser(uid, currentName) {
    setEditingUserId(uid);
    setEditName(currentName);
    if (analytics) {
      logEvent(analytics, "edit_offline_user_start", {
        userId: user?.uid,
        poolId,
        memberId: uid,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Edit offline user start logged to Firebase Analytics");
    }
  }

  async function handleSaveEditUser(uid) {
    if (!isCommissioner) {
      setError("Only the commissioner can edit offline users.");
      console.warn("handleSaveEditUser - User is not commissioner:", user?.uid);
      return;
    }
    if (!editName.trim()) {
      setError("Offline user name cannot be empty.");
      console.warn("handleSaveEditUser - Offline name is empty");
      return;
    }

    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);
      const newOfflineUsers = (poolData?.offlineUsers || []).map((user) =>
        user.id === uid ? { ...user, name: editName } : user
      );

      await withRetry("Save Edited User", () =>
        updateDoc(poolRef, {
          offlineUsers: newOfflineUsers,
        })
      );

      setEditingUserId(null);
      setEditName("");
      console.log("handleSaveEditUser - Updated offline user name:", { id: uid, name: editName });
      if (analytics) {
        logEvent(analytics, "edit_offline_user_success", {
          userId: user?.uid,
          poolId,
          memberId: uid,
          newName: editName,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Edit offline user success logged to Firebase Analytics");
      }
    } catch (err) {
      console.error("handleSaveEditUser - Error:", err);
      setError(err.message || "Failed to edit offline user.");
      if (analytics) {
        logEvent(analytics, "edit_offline_user_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          memberId: uid,
          error_message: err.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Edit offline user failure logged to Firebase Analytics");
      }
    }
  }

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditName("");
    if (analytics) {
      logEvent(analytics, "edit_offline_user_canceled", {
        userId: user?.uid,
        poolId,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Edit offline user canceled logged to Firebase Analytics");
    }
  };

  // Handle payment changes with validation and highlight
  function handlePaymentChange(uid, value) {
    const parsed = parseFloat(value);
    let newVal;
    let errorMsg = "";

    if (isNaN(parsed)) {
      newVal = 0;
      errorMsg = "Payment must be a number.";
    } else if (parsed < 0) {
      newVal = 0;
      errorMsg = "Payment cannot be negative.";
    } else {
      newVal = parsed;
      errorMsg = "";
    }

    setPayments((prev) => ({
      ...prev,
      [uid]: newVal,
    }));
    setPaymentErrors((prev) => ({
      ...prev,
      [uid]: errorMsg,
    }));
    // Highlight the changed payment
    setPaymentHighlight((prev) => ({
      ...prev,
      [uid]: true,
    }));
    setTimeout(() => {
      setPaymentHighlight((prev) => ({
        ...prev,
        [uid]: false,
      }));
    }, 1000);

    console.log("handlePaymentChange - Updated payment for user:", { uid, amount: newVal });
    if (analytics) {
      logEvent(analytics, "payment_updated", {
        userId: user?.uid,
        poolId,
        memberId: uid,
        amount: newVal,
        error: errorMsg || "none",
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Payment updated logged to Firebase Analytics");
    }
  }

  // Save payments to Firestore with transaction
  async function handleSavePayments() {
    if (!isCommissioner) {
      setError("Only the commissioner can update payments.");
      console.warn("handleSavePayments - User is not commissioner:", user?.uid);
      return;
    }

    // Check for payment errors
    const hasErrors = Object.values(paymentErrors).some((err) => err !== "");
    if (hasErrors) {
      setError("Please correct all payment errors before saving.");
      console.warn("handleSavePayments - Payment errors exist:", paymentErrors);
      return;
    }

    try {
      setError("");
      const poolRef = doc(db, "pools", poolId);
      await withRetry("Save Payments Transaction", () =>
        runTransaction(db, async (transaction) => {
          const poolDoc = await transaction.get(poolRef);
          if (!poolDoc.exists()) {
            throw new Error("Pool does not exist.");
          }

          transaction.update(poolRef, {
            payments: payments,
          });
        })
      );
      console.log("handleSavePayments - Updated payments:", payments);
      if (analytics) {
        logEvent(analytics, "save_payments_success", {
          userId: user?.uid,
          poolId,
          payments,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Save payments success logged to Firebase Analytics");
      }
      hasSavedPayments.current = true;
      onClose();
    } catch (err) {
      console.error("handleSavePayments - Error:", err);
      let userFriendlyError = err.message || "Failed to save payments.";
      if (err.message.includes("Pool does not exist")) {
        userFriendlyError = "This pool no longer exists.";
      }
      setError(userFriendlyError);
      if (analytics) {
        logEvent(analytics, "save_payments_failed", {
          userId: user?.uid || "anonymous",
          poolId,
          error_message: userFriendlyError,
          timestamp: new Date().toISOString(),
        });
        console.log("ManageMembersModal - Save payments failure logged to Firebase Analytics");
      }
    }
  }

  // Handle closing the modal
  const handleClose = () => {
    if (analytics) {
      logEvent(analytics, "manage_members_modal_closed", {
        userId: user?.uid || "anonymous",
        poolId,
        savedPayments: hasSavedPayments.current,
        timestamp: new Date().toISOString(),
      });
      console.log("ManageMembersModal - Modal close logged to Firebase Analytics");
    }
    setPaymentErrors({});
    setSelectedMembers([]);
    setPaymentHighlight({});
    onClose();
  };

  // Compute the total pot and unpaid amount
  const totalPot = Object.values(payments).reduce((sum, val) => sum + (val || 0), 0);
  const entryFee = 10;
  const expectedPot = (poolData?.memberIds?.length || 0) * entryFee;
  const unpaidCount = Object.entries(payments).filter(([_, amount]) => amount === 0).length;
  const unpaidAmount = unpaidCount * entryFee;

  // Render the member list
  function renderMemberList() {
    if (!poolData?.memberIds) {
      return (
        <Typography sx={{ fontFamily: "\"Poppins\", sans-serif", textAlign: "center" }}>
          No members found.
        </Typography>
      );
    }

    return (
      <>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontFamily: "\"Poppins\", sans-serif",
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            Total Members: {poolData.memberIds.length}
          </Typography>
          {isCommissioner && poolData.memberIds.length > 0 && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedMembers.length === poolData.memberIds.length}
                  onChange={handleSelectAll}
                  aria-label="Select all members for bulk actions"
                />
              }
              label="Select All"
              sx={{ fontFamily: "\"Poppins\", sans-serif" }}
            />
          )}
        </Box>
        {isCommissioner && selectedMembers.length > 0 && (
          <Box sx={{ mb: 1, textAlign: "center" }}>
            <StyledButton
              onClick={() => openConfirmRemoveDialog(selectedMembers)}
              color="error"
              variant="contained"
              aria-label={`Remove ${selectedMembers.length} selected members`}
            >
              Remove Selected ({selectedMembers.length})
            </StyledButton>
          </Box>
        )}
        {isCommissioner && unpaidCount > 0 && (
          <Box sx={{ mb: 1, textAlign: "center" }}>
            <StyledButton
              onClick={handleNotifyUnpaidMembers}
              startIcon={<NotificationsIcon />}
              variant="contained"
              aria-label={`Notify ${unpaidCount} unpaid members`}
            >
              Notify Unpaid ({unpaidCount})
            </StyledButton>
          </Box>
        )}
        <List dense>
          {poolData.memberIds.map((uid) => {
            const paymentAmount = payments[uid] || 0;
            const hasZeroPayment = paymentAmount === 0;
            const isOffline = uid.startsWith("offline_");
            const offlineUser = poolData?.offlineUsers?.find((user) => user.id === uid);
            const displayText = isOffline
              ? `Offline User: ${offlineUser ? offlineUser.name : uid}`
              : `User ID: ${uid.slice(0, 8)}...`;
            const paymentErrorId = `payment-error-${uid}`;

            return (
              <MemberItem key={uid} hasZeroPayment={hasZeroPayment} highlight={paymentHighlight[uid]}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                  {isCommissioner && (
                    <Checkbox
                      checked={selectedMembers.includes(uid)}
                      onChange={() => handleSelectMember(uid)}
                      aria-label={`Select member ${displayText} for bulk actions`}
                    />
                  )}
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {displayText}
                        {hasZeroPayment && (
                          <Tooltip title="This member has not paid yet">
                            <WarningIcon
                              fontSize="small"
                              color="warning"
                              aria-label="Warning: This member has not paid yet"
                            />
                          </Tooltip>
                        )}
                      </Box>
                    }
                    secondary={`Payment: $${paymentAmount.toFixed(2)}`}
                    primaryTypographyProps={{ fontFamily: "\"Poppins\", sans-serif" }}
                    secondaryTypographyProps={{ fontFamily: "\"Poppins\", sans-serif" }}
                  />
                </Stack>
                {isCommissioner && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    {isOffline && editingUserId !== uid && (
                      <Tooltip title="Edit Name">
                        <IconButton
                          onClick={() => handleEditUser(uid, offlineUser?.name || "")}
                          size="small"
                          aria-label={`Edit name for ${displayText}`}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {editingUserId === uid ? (
                      <Stack direction="row" spacing={1}>
                        <TextField
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          size="small"
                          sx={{ width: 150 }}
                          placeholder="New Name"
                          inputProps={{ "aria-label": "Edit offline user name" }}
                        />
                        <Button
                          onClick={() => handleSaveEditUser(uid)}
                          size="small"
                          sx={{ fontFamily: "\"Poppins\", sans-serif" }}
                          aria-label="Save edited user name"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          size="small"
                          sx={{ fontFamily: "\"Poppins\", sans-serif" }}
                          aria-label="Cancel editing user name"
                        >
                          Cancel
                        </Button>
                      </Stack>
                    ) : (
                      <>
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                          <TextField
                            variant="outlined"
                            size="small"
                            type="number"
                            placeholder="Enter amount"
                            value={paymentAmount}
                            onChange={(e) => handlePaymentChange(uid, e.target.value)}
                            sx={{ ml: 2, width: 100 }}
                            inputProps={{
                              "aria-label": `Payment amount for ${displayText}`,
                              "aria-describedby": paymentErrors[uid] ? paymentErrorId : undefined,
                            }}
                            error={!!paymentErrors[uid]}
                          />
                          {paymentErrors[uid] && (
                            <Typography
                              variant="caption"
                              color="error"
                              id={paymentErrorId}
                              sx={{ fontFamily: "\"Poppins\", sans-serif", mt: 0.5 }}
                              aria-live="assertive"
                            >
                              {paymentErrors[uid]}
                            </Typography>
                          )}
                        </Box>
                        <Tooltip title="Remove Member">
                          <IconButton
                            onClick={() => openConfirmRemoveDialog([uid])}
                            size="small"
                            color="error"
                            aria-label={`Remove member ${displayText}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Stack>
                )}
              </MemberItem>
            );
          })}
        </List>
      </>
    );
  }

  // Hide if auth state is loading or user is not authenticated
  if (authLoading || !user) {
    return null;
  }

  // Final Render
  return (
    <>
      {/* Main Manage Members Modal */}
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby="manage-members-modal-title"
        aria-describedby="manage-members-modal-content"
      >
        <StyledDialogTitle id="manage-members-modal-title">Manage Members & Payments</StyledDialogTitle>

        <StyledDialogContent id="manage-members-modal-content">
          <Fade in timeout={500}>
            <Box>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} role="alert" aria-live="assertive">
                  {error}
                </Alert>
              )}

              {loading ? (
                <Typography
                  sx={{ fontFamily: "\"Poppins\", sans-serif", textAlign: "center" }}
                >
                  Loading members...
                </Typography>
              ) : !poolData ? (
                <Typography
                  sx={{ fontFamily: "\"Poppins\", sans-serif", textAlign: "center" }}
                >
                  No pool data found.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                  {/* Member List */}
                  {renderMemberList()}

                  {/* Commissioner can add an offline user */}
                  {isCommissioner && (
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontFamily: "\"Poppins\", sans-serif", mb: 1 }}
                      >
                        Add Offline User
                      </Typography>
                      <Stack direction="row" spacing={2}>
                        <TextField
                          label="Offline User Name"
                          value={offlineName}
                          onChange={(e) => setOfflineName(e.target.value)}
                          size="small"
                          sx={{ width: 200 }}
                          inputProps={{ "aria-label": "Enter offline user name" }}
                        />
                        <StyledButton onClick={handleAddOfflineUser} aria-label="Add offline user">
                          Add
                        </StyledButton>
                      </Stack>
                    </Box>
                  )}

                  {/* Show total pot, expected pot, and unpaid amount at the bottom */}
                  <Box sx={{ textAlign: "center" }}>
                    <Typography
                      sx={{
                        fontFamily: "\"Poppins\", sans-serif",
                        fontWeight: "bold",
                        mt: 1,
                      }}
                    >
                      Total Pot: ${totalPot.toFixed(2)}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: "\"Poppins\", sans-serif",
                        fontWeight: "bold",
                        mt: 1,
                        color: (theme) => theme.palette.info.main,
                      }}
                    >
                      Expected Pot: ${expectedPot.toFixed(2)} (at ${entryFee} per member)
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: "\"Poppins\", sans-serif",
                        fontWeight: "bold",
                        mt: 1,
                        color: (theme) => theme.palette.warning.main,
                      }}
                    >
                      Unpaid Members: {unpaidCount} (Total Unpaid: ${unpaidAmount.toFixed(2)})
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Fade>
        </StyledDialogContent>

        <DialogActions sx={{ backgroundColor: mode === "dark" ? "#1A2A44" : "#FAFAFA" }}>
          {isCommissioner && (
            <StyledButton
              onClick={handleSavePayments}
              disabled={loading || !poolData}
              aria-label="Save payments"
            >
              Save Payments
            </StyledButton>
          )}
          <Button
            onClick={handleClose}
            sx={{ fontFamily: "\"Poppins\", sans-serif" }}
            aria-label="Close modal"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Member Removal */}
      <Dialog
        open={confirmRemoveDialogOpen}
        onClose={handleCancelRemove}
        aria-labelledby="confirm-remove-member-title"
        aria-describedby="confirm-remove-member-description"
      >
        <StyledDialogTitle id="confirm-remove-member-title">Confirm Member Removal</StyledDialogTitle>
        <StyledDialogContent>
          <Typography
            id="confirm-remove-member-description"
            sx={{ fontFamily: "\"Poppins\", sans-serif" }}
          >
            Are you sure you want to remove {membersToRemove.length} member(s) from the pool? This action cannot be undone, and their associated payment data will be removed.
          </Typography>
        </StyledDialogContent>
        <DialogActions sx={{ backgroundColor: mode === "dark" ? "#1A2A44" : "#FAFAFA" }}>
          <Button
            onClick={handleCancelRemove}
            sx={{ fontFamily: "\"Poppins\", sans-serif" }}
            aria-label="Cancel member removal"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRemoveMember}
            color="error"
            sx={{ fontFamily: "\"Poppins\", sans-serif" }}
            aria-label="Confirm member removal"
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={!!notificationMessage}
        autoHideDuration={3000}
        onClose={() => setNotificationMessage("")}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="info" sx={{ fontFamily: "'Poppins', sans-serif'" }} role="alert" aria-live="assertive">
          {notificationMessage}
        </Alert>
      </Snackbar>
    </>
  );
}

export default ManageMembersModal;