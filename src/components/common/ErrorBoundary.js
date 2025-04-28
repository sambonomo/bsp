import React from "react";
import { ThemeContext } from "../../contexts/ThemeContext";
import { getAnalyticsService } from "../../firebase/config"; // Updated import
import { logEvent } from "firebase/analytics";
import { Link as RouterLink } from "react-router-dom";
import { Box, Typography, Button, Alert, Fade, Collapse, styled } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

// Styled components for polished UI
const ErrorContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  padding: theme.spacing(3),
  textAlign: "center",
  background: theme.palette.mode === "dark"
    ? "linear-gradient(180deg, #1A2A44 0%, #2A3B5A 100%)"
    : "linear-gradient(180deg, #F5F5F5 0%, #E0E0E0 100%)",
}));

const StyledAlert = styled(Alert)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(3),
  fontFamily: "'Poppins', sans-serif'",
  maxWidth: "600px",
  width: "100%",
  "& .MuiAlert-icon": {
    color: theme.palette.error.main,
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.secondary.main,
  color: theme.palette.secondary.contrastText,
  fontWeight: 600,
  fontFamily: "'Poppins', sans-serif'",
  padding: theme.spacing(1, 3),
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[4],
  transition: theme.transitions.create(["background-color", "box-shadow", "transform"], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  "&:hover": {
    backgroundColor: theme.palette.secondary.light,
    boxShadow: theme.shadows[6],
    transform: "scale(1.05)",
  },
  margin: theme.spacing(1),
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const ErrorDetails = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#2A3B5A" : "#FFFFFF",
  border: "1px solid",
  borderColor: theme.palette.divider,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  marginTop: theme.spacing(2),
  maxWidth: "600px",
  width: "100%",
  textAlign: "left",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  fontFamily: "monospace",
  fontSize: "0.875rem",
  color: theme.palette.text.primary,
}));

class ErrorBoundary extends React.Component {
  static contextType = ThemeContext;

  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      hasLoggedError: false, // Track if error has been logged
      analytics: null, // State for analytics
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true };
  }

  componentDidMount() {
    // Initialize analytics on mount
    const analyticsInstance = getAnalyticsService();
    this.setState({ analytics: analyticsInstance });
  }

  componentDidCatch(error, errorInfo) {
    // Catch errors in any components below and re-render with error message
    this.setState({ error, errorInfo });

    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Log the error to Firebase Analytics (only once)
    if (!this.state.hasLoggedError && this.state.analytics) {
      logEvent(this.state.analytics, "error_boundary_caught", {
        error_message: error?.message || "Unknown error",
        error_stack: errorInfo?.componentStack || "No stack available",
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Error logged to Firebase Analytics");
      this.setState({ hasLoggedError: true });
    }
  }

  // Reset error state to attempt recovery
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      hasLoggedError: false,
    });
    console.log("ErrorBoundary - Attempting to reset error state");
    if (this.state.analytics) {
      logEvent(this.state.analytics, "error_boundary_reset", {
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Reset logged to Firebase Analytics");
    }
  };

  // Refresh the page
  handleRefresh = () => {
    window.location.reload();
    console.log("ErrorBoundary - Refreshing the page");
    if (this.state.analytics) {
      logEvent(this.state.analytics, "error_boundary_refresh", {
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Refresh logged to Firebase Analytics");
    }
  };

  // Contact support
  handleContactSupport = () => {
    if (this.state.analytics) {
      logEvent(this.state.analytics, "error_boundary_contact_support", {
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Contact support logged to Firebase Analytics");
    }
  };

  // Navigate to home
  handleGoToHome = () => {
    if (this.state.analytics) {
      logEvent(this.state.analytics, "error_boundary_go_to_home", {
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Go to home logged to Firebase Analytics");
    }
  };

  // Toggle error details
  handleToggleDetails = () => {
    this.setState((prevState) => ({
      showDetails: !prevState.showDetails,
    }));
    if (this.state.analytics) {
      logEvent(this.state.analytics, "error_boundary_toggle_details", {
        showDetails: !this.state.showDetails,
        timestamp: new Date().toISOString(),
      });
      console.log("ErrorBoundary - Toggle details logged to Firebase Analytics");
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails } = this.state;

    return (
      <Fade in timeout={1000}>
        <ErrorContainer role="alert" aria-live="assertive">
          <StyledAlert severity="error">
            <Typography
              variant="h4"
              sx={{
                mb: 2,
                fontFamily: "'Montserrat', sans-serif'",
                fontWeight: 700,
                color: (theme) => theme.palette.error.main,
              }}
            >
              Something went wrong
            </Typography>
            <Typography
              variant="body1"
              sx={{
                mb: 3,
                fontFamily: "'Poppins', sans-serif'",
                color: (theme) => theme.palette.text.secondary,
              }}
            >
              An unexpected error occurred. Please try refreshing the page or contact support.
            </Typography>

            {/* Toggle Error Details */}
            <Button
              variant="text"
              onClick={this.handleToggleDetails}
              startIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{
                fontFamily: "'Poppins', sans-serif'",
                color: (theme) => theme.palette.text.secondary,
                mb: 1,
              }}
              aria-expanded={showDetails}
              aria-label={showDetails ? "Hide error details" : "Show error details"}
            >
              {showDetails ? "Hide Details" : "Show Details"}
            </Button>

            <Collapse in={showDetails}>
              <ErrorDetails>
                <Typography variant="body2">
                  <strong>Error:</strong> {error?.message || "Unknown error"}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Stack Trace:</strong>
                  <br />
                  {error?.stack || "No stack available"}
                </Typography>
                {errorInfo && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <strong>Component Stack:</strong>
                    <br />
                    {errorInfo.componentStack || "No component stack available"}
                  </Typography>
                )}
              </ErrorDetails>
            </Collapse>
          </StyledAlert>

          {/* Action Buttons */}
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
            <StyledButton
              onClick={this.handleRefresh}
              aria-label="Refresh the page"
            >
              Refresh Page
            </StyledButton>
            <StyledButton
              onClick={this.handleReset}
              aria-label="Try to reset the error"
            >
              Try Again
            </StyledButton>
            <StyledButton
              component="a"
              href="mailto:support@bonomosportspools.com?subject=Error Report - Bonomo Sports Pools"
              target="_blank"
              rel="noopener noreferrer"
              onClick={this.handleContactSupport}
              aria-label="Contact support via email"
            >
              Contact Support
            </StyledButton>
            <StyledButton
              component={RouterLink}
              to="/"
              onClick={this.handleGoToHome}
              aria-label="Go to the homepage"
            >
              Go to Home
            </StyledButton>
          </Box>
        </ErrorContainer>
      </Fade>
    );
  }
}

export default ErrorBoundary;