import React, { useEffect, useState, useRef } from "react";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getAnalyticsService } from "../../firebase/config";
import { logEvent } from "firebase/analytics";
import {
  Box,
  Typography,
  Button,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Fade,
  Skeleton,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { styled } from "@mui/system";

// Updated ad data with reliable image URLs
const adData = [
  {
    id: 1,
    title: "Upgrade to Gold!",
    description: "Enjoy an ad-free experience and unlimited pools with Gold.",
    imageUrl: "https://picsum.photos/300/150?random=1",
    fallbackImageUrl: "https://picsum.photos/300/150?random=4",
    ctaText: "Upgrade Now",
    ctaLink: "/subscription",
    targetTier: "Bronze",
  },
  {
    id: 2,
    title: "Go Silver!",
    description: "Fewer ads, advanced pool features—upgrade to Silver today!",
    imageUrl: "https://picsum.photos/300/150?random=2",
    fallbackImageUrl: "https://picsum.photos/300/150?random=5",
    ctaText: "Learn More",
    ctaLink: "/subscription",
    targetTier: "Bronze",
  },
  {
    id: 3,
    title: "Invite Friends!",
    description: "Grow your pool—invite friends to join the fun!",
    imageUrl: "https://picsum.photos/300/150?random=3",
    fallbackImageUrl: "https://picsum.photos/300/150?random=6",
    ctaText: "Invite Now",
    ctaLink: "/invite",
    targetTier: "all",
  },
];

// Styled components for the ad banner
const AdCard = styled(Card)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[100],
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: theme.shadows[2],
  margin: theme.spacing(2, 0),
  padding: theme.spacing(1),
  [theme.breakpoints.down("sm")]: {
    flexDirection: "column",
    textAlign: "center",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const StyledCardMedia = styled(CardMedia)(({ theme }) => ({
  width: 150,
  height: 75,
  borderRadius: theme.shape.borderRadius,
  objectFit: "cover",
  [theme.breakpoints.down("sm")]: {
    width: "100%",
    height: 100,
    marginBottom: theme.spacing(1),
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  fontFamily: "'Poppins', sans-serif'",
  fontWeight: 600,
  textTransform: "none",
  borderRadius: 8,
  padding: theme.spacing(1, 3),
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
  "&:disabled": {
    backgroundColor: theme.palette.grey[400],
  },
  [theme.breakpoints.down("sm")]: {
    width: "100%",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

const DismissButton = styled(Button)(({ theme }) => ({
  minWidth: 0,
  padding: theme.spacing(0.5),
  color: theme.palette.mode === "dark" ? theme.palette.text.secondary : theme.palette.text.secondary,
  "&:hover": {
    color: theme.palette.secondary.main,
    backgroundColor: "transparent",
  },
  "&:focus": {
    outline: `2px solid ${theme.palette.secondary.main}`,
    outlineOffset: 2,
  },
}));

function AdBanner() {
  const { subscriptionTier } = useSubscription();
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [currentAd, setCurrentAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impressionLogged, setImpressionLogged] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    const dismissed = localStorage.getItem("adBannerDismissed");
    return dismissed === "true" ? false : true;
  });
  const [dismissAnnouncement, setDismissAnnouncement] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [imageError, setImageError] = useState(false); // Track image load errors
  const adRef = useRef(null);
  const hasLoggedClick = useRef(false);
  const hasLoggedClose = useRef(false);
  const hasLoggedError = useRef(false);
  const liveRegionRef = useRef(null);

  // Initialize analytics
  useEffect(() => {
    const analyticsInstance = getAnalyticsService();
    setAnalytics(analyticsInstance);
  }, []);

  // Create a live region for accessibility announcements
  useEffect(() => {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    liveRegion.style.position = "absolute";
    liveRegion.style.width = "1px";
    liveRegion.style.height = "1px";
    liveRegion.style.overflow = "hidden";
    liveRegion.style.clip = "rect(0, 0, 0, 0)";
    document.body.appendChild(liveRegion);
    liveRegionRef.current = liveRegion;

    return () => {
      if (liveRegionRef.current) {
        document.body.removeChild(liveRegionRef.current);
      }
    };
  }, []);

  // Select an ad based on subscription tier
  useEffect(() => {
    const selectAd = () => {
      const eligibleAds = adData.filter(
        (ad) => ad.targetTier === subscriptionTier || ad.targetTier === "all"
      );
      if (eligibleAds.length === 0) {
        console.warn("AdBanner - No eligible ads for tier:", subscriptionTier);
        setLoading(false);
        if (!hasLoggedError.current && analytics) {
          logEvent(analytics, "ad_selection_failed", {
            subscriptionTier,
            error_message: "No eligible ads found for the user's subscription tier.",
            timestamp: new Date().toISOString(),
          });
          console.log("AdBanner - Ad selection failure logged to Firebase Analytics");
          hasLoggedError.current = true;
        }
        return;
      }

      const randomIndex = Math.floor(Math.random() * eligibleAds.length);
      const selectedAd = eligibleAds[randomIndex];
      setCurrentAd(selectedAd);
      setLoading(false);
      console.log("AdBanner - Selected ad:", selectedAd);
    };

    selectAd();
  }, [subscriptionTier]);

  // Intersection Observer to log ad impressions
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0.5, // Log when 50% of the ad is visible
    };

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !impressionLogged && currentAd && analytics) {
          logEvent(analytics, "ad_impression", {
            adId: currentAd.id,
            adTitle: currentAd.title,
            subscriptionTier,
            timestamp: new Date().toISOString(),
          });
          console.log("AdBanner - Impression logged to Firebase Analytics for ad:", currentAd.id);
          setImpressionLogged(true);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    if (adRef.current) {
      observer.observe(adRef.current);
    }

    return () => {
      if (adRef.current) {
        observer.unobserve(adRef.current);
      }
    };
  }, [currentAd, impressionLogged, subscriptionTier]);

  // Reset impression logging and click/close events when ad or subscription tier changes
  useEffect(() => {
    setImpressionLogged(false);
    hasLoggedClick.current = false;
    hasLoggedClose.current = false;
    setImageError(false); // Reset image error state
  }, [currentAd?.id, subscriptionTier]);

  // Announce dismissal for accessibility
  useEffect(() => {
    if (dismissAnnouncement && liveRegionRef.current) {
      liveRegionRef.current.innerText = dismissAnnouncement;
    }
  }, [dismissAnnouncement]);

  // Handle dismiss action with focus management
  const handleDismiss = (e) => {
    e.stopPropagation();
    setIsVisible(false);
    setDismissAnnouncement("Advertisement banner dismissed");
    localStorage.setItem("adBannerDismissed", "true");
    console.log("AdBanner - Dismissed by user");
    if (analytics) {
      logEvent(analytics, "ad_banner_dismissed", {
        userId: user?.uid || "anonymous",
        subscriptionTier: subscriptionTier || "unknown",
        adId: currentAd.id,
        adTitle: currentAd.title,
        timestamp: new Date().toISOString(),
      });
      console.log("AdBanner - Dismiss logged to Firebase Analytics");
    }
    // Move focus to the next focusable element
    const nextFocusable = document.activeElement.nextElementSibling;
    if (nextFocusable && nextFocusable.focus) {
      nextFocusable.focus();
    } else {
      const focusableElements = document.querySelectorAll('a[href], button, [tabindex="0"]');
      const bannerIndex = Array.from(focusableElements).indexOf(document.activeElement);
      if (bannerIndex + 1 < focusableElements.length) {
        focusableElements[bannerIndex + 1].focus();
      }
    }
  };

  // Handle ad click with navigation
  const handleAdClick = () => {
    if (!hasLoggedClick.current && analytics) {
      logEvent(analytics, "ad_click", {
        adId: currentAd.id,
        adTitle: currentAd.title,
        subscriptionTier,
        ctaLink: currentAd.ctaLink,
        timestamp: new Date().toISOString(),
      });
      console.log("AdBanner - Ad click logged to Firebase Analytics for ad:", currentAd.id);
      hasLoggedClick.current = true;
    }
    navigate(currentAd.ctaLink);
  };

  // Handle CTA button click (separate logging)
  const handleCtaClick = (e) => {
    e.stopPropagation(); // Prevent the card click event
    if (analytics) {
      logEvent(analytics, "ad_cta_button_clicked", {
        adId: currentAd.id,
        adTitle: currentAd.title,
        subscriptionTier,
        ctaLink: currentAd.ctaLink,
        timestamp: new Date().toISOString(),
      });
      console.log("AdBanner - CTA button click logged to Firebase Analytics for ad:", currentAd.id);
    }
    navigate(currentAd.ctaLink);
  };

  // Handle image load error
  const handleImageError = () => {
    setImageError(true);
    if (analytics && !hasLoggedError.current) {
      logEvent(analytics, "ad_image_load_failed", {
        adId: currentAd.id,
        adTitle: currentAd.title,
        imageUrl: currentAd.imageUrl,
        subscriptionTier,
        timestamp: new Date().toISOString(),
      });
      console.log("AdBanner - Image load failure logged to Firebase Analytics for ad:", currentAd.id);
      hasLoggedError.current = true;
    }
  };

  // Don't render if there's no ad, user is not authenticated, auth is loading, or banner is dismissed
  if (authLoading || !user || !currentAd || !isVisible) {
    return null;
  }

  // Show skeleton while loading
  if (loading) {
    return (
      <Box sx={{ my: 2, px: isMobile ? 1 : 0 }}>
        <Skeleton variant="rectangular" width="100%" height={isMobile ? 200 : 100} />
      </Box>
    );
  }

  return (
    <Fade in timeout={500}>
      <AdCard
        ref={adRef}
        onClick={handleAdClick}
        tabIndex={0}
        onKeyPress={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleAdClick();
          }
        }}
        aria-label={`Advertisement: ${currentAd.title}. ${currentAd.description}`}
      >
        <Box sx={{ display: "flex", alignItems: "center", flex: 1, pr: 2 }}>
          <StyledCardMedia
            component="img"
            image={imageError ? currentAd.fallbackImageUrl : currentAd.imageUrl}
            alt={`Advertisement image for ${currentAd.title}`}
            onError={handleImageError}
          />
          <CardContent sx={{ flex: 1, py: isMobile ? 1 : 2, px: 2 }}>
            <Typography
              variant={isMobile ? "body1" : "h6"}
              sx={{ fontFamily: "'Montserrat', sans-serif'", fontWeight: 600 }}
            >
              {currentAd.title}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: "'Poppins', sans-serif'", mt: 0.5 }}>
              {currentAd.description}
            </Typography>
          </CardContent>
        </Box>
        <CardActions sx={{ px: 2, py: isMobile ? 1 : 2 }}>
          <StyledButton
            onClick={handleCtaClick}
            aria-label={currentAd.ctaText}
          >
            {currentAd.ctaText}
          </StyledButton>
          <DismissButton
            onClick={handleDismiss}
            aria-label="Dismiss advertisement banner"
            tabIndex={0}
          >
            Close
          </DismissButton>
        </CardActions>
      </AdCard>
    </Fade>
  );
}

export default AdBanner;