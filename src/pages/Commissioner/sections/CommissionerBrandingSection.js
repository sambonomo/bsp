// /src/pages/Commissioner/sections/CommissionerBrandingSection.js

import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import {
  Card,
  CardContent,
  Typography,
  Stack,
  TextField,
  Button,
  Alert,
  Box,
  InputLabel,
} from "@mui/material";

import { getDb } from "../../../firebase/config";
import { logEvent } from "firebase/analytics";

/**
 * Simple function to verify a string is a valid URL (for the logo).
 * @param {string} url - The input to validate.
 * @returns {boolean}
 */
function validateLogoURL(url) {
  if (!url) return true; // If empty, that’s fine (no logo).
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * CommissionerBrandingSection:
 * Allows the commissioner to customize pool theme colors and logo URL.
 *
 * Props:
 * - user: current user (to check if they’re commissioner)
 * - poolId: Firestore doc ID
 * - poolData: pool object from Firestore (must contain .commissionerId, .theme, etc.)
 * - analytics: optional analytics instance if you want to log from here
 */
export default function CommissionerBrandingSection({ user, poolId, poolData, analytics }) {
  const isCommissioner = poolData?.commissionerId === user?.uid;

  // If not commissioner, hide this entire section
  if (!isCommissioner) {
    return null;
  }

  // Default theme values
  const themeDefaults = poolData?.theme || {};
  const [primaryColor, setPrimaryColor] = useState(themeDefaults.primaryColor || "#1976d2");
  const [secondaryColor, setSecondaryColor] = useState(themeDefaults.secondaryColor || "#9c27b0");
  const [logoURL, setLogoURL] = useState(themeDefaults.logoURL || "");

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const db = getDb();

  useEffect(() => {
    // Reset messages when the pool changes
    setError("");
    setSuccessMessage("");
  }, [poolId]);

  /**
   * handleSaveBranding:
   * Validates logo URL, then updates Firestore with new theme object:
   * { theme: { primaryColor, secondaryColor, logoURL } }
   */
  const handleSaveBranding = async () => {
    setError("");
    setSuccessMessage("");
    setSaving(true);

    // Validate logo if present
    if (logoURL && !validateLogoURL(logoURL)) {
      setError("Invalid logo URL. Please enter a valid URL (e.g., https://example.com/logo.png).");
      setSaving(false);
      return;
    }

    try {
      const poolRef = doc(db, "pools", poolId);
      const themeUpdates = {
        primaryColor,
        secondaryColor,
        logoURL: logoURL.trim(),
      };

      await updateDoc(poolRef, { theme: themeUpdates });
      setSuccessMessage("Branding updated successfully!");

      if (analytics) {
        logEvent(analytics, "update_branding", {
          userId: user.uid,
          poolId,
          primaryColor,
          secondaryColor,
          logoURL,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("handleSaveBranding - Error:", err);
      setError(err.message || "Failed to update branding.");
    } finally {
      setSaving(false);
    }
  };

  // A small preview area with background = primaryColor, border = secondaryColor
  const previewBoxStyle = {
    mt: 2,
    p: 3,
    backgroundColor: primaryColor,
    borderRadius: 2,
    border: `3px solid ${secondaryColor}`,
    color: "#fff",
    minHeight: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  };

  // Logo preview if we have a URL
  const logoPreview = logoURL
    ? (
      <img
        src={logoURL}
        alt="Pool Logo Preview"
        style={{ maxHeight: 60, marginTop: 8 }}
        onError={() => setError("The logo URL failed to load. Check if it’s correct.")}
      />
    )
    : null;

  return (
    <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Pool Branding
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} role="alert" aria-live="assertive">
            {successMessage}
          </Alert>
        )}

        <Stack spacing={2} sx={{ mb: 3 }}>
          {/* PRIMARY COLOR */}
          <Box>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} htmlFor="primary-color">
              Primary Color
            </InputLabel>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <input
                id="primary-color"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Select primary color for pool branding"
                style={{ width: 50, height: 50, cursor: "pointer" }}
              />
              <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>{primaryColor}</Typography>
            </Box>
          </Box>

          {/* SECONDARY COLOR */}
          <Box>
            <InputLabel sx={{ fontFamily: "'Poppins', sans-serif'" }} htmlFor="secondary-color">
              Secondary Color
            </InputLabel>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <input
                id="secondary-color"
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                aria-label="Select secondary color for pool branding"
                style={{ width: 50, height: 50, cursor: "pointer" }}
              />
              <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>{secondaryColor}</Typography>
            </Box>
          </Box>

          {/* LOGO URL */}
          <TextField
            label="Logo URL"
            value={logoURL}
            onChange={(e) => setLogoURL(e.target.value)}
            placeholder="https://example.com/logo.png"
            fullWidth
            aria-label="Enter logo URL"
          />
        </Stack>

        {/* Branding Preview Box */}
        <Box sx={previewBoxStyle} aria-label="Branding preview area">
          <Typography sx={{ fontFamily: "'Poppins', sans-serif'" }}>Branding Preview</Typography>
          {logoPreview}
        </Box>

        {/* Save Branding Button */}
        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            onClick={handleSaveBranding}
            disabled={saving}
            aria-label="Save branding updates"
          >
            {saving ? "Saving..." : "Save Branding"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
