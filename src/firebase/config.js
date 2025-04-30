/**
 * Firebase configuration file for Bonomo Sports Pools.
 * This file initializes Firebase services using environment variables.
 * To set up the environment variables, create a `.env` file in the root directory
 * with the following required variables:
 * - REACT_APP_FIREBASE_API_KEY
 * - REACT_APP_FIREBASE_AUTH_DOMAIN
 * - REACT_APP_FIREBASE_PROJECT_ID
 * - REACT_APP_FIREBASE_STORAGE_BUCKET
 * - REACT_APP_FIREBASE_MESSAGING_SENDER_ID
 * - REACT_APP_FIREBASE_APP_ID
 * 
 * Optional variable for Analytics:
 * - REACT_APP_FIREBASE_MEASUREMENT_ID
 * 
 * Example `.env` file:
 * ```
 * REACT_APP_FIREBASE_API_KEY="your-api-key"
 * REACT_APP_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
 * REACT_APP_FIREBASE_PROJECT_ID="your-project-id"
 * REACT_APP_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
 * REACT_APP_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
 * REACT_APP_FIREBASE_APP_ID="your-app-id"
 * REACT_APP_FIREBASE_MEASUREMENT_ID="G-XXXXXXXXXX"
 * ```
 * 
 * Ensure the `.env` file is included in `.gitignore` to prevent exposing sensitive information.
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";

// Required environment variables for Firebase configuration
const requiredEnvVars = [
  "REACT_APP_FIREBASE_API_KEY",
  "REACT_APP_FIREBASE_AUTH_DOMAIN",
  "REACT_APP_FIREBASE_PROJECT_ID",
  "REACT_APP_FIREBASE_STORAGE_BUCKET",
  "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
  "REACT_APP_FIREBASE_APP_ID",
];

// Optional environment variables (e.g., for Analytics)
const optionalEnvVars = ["REACT_APP_FIREBASE_MEASUREMENT_ID"];

// Validate required environment variables
const missingEnvVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar] || process.env[envVar].trim() === ""
);
if (missingEnvVars.length > 0) {
  console.error("Firebase Config - Missing or empty required environment variables:", missingEnvVars);
  throw new Error(
    `Missing required Firebase environment variables: ${missingEnvVars.join(", ")}. Please check your .env file.`
  );
}

// Warn about missing optional environment variables
const missingOptionalEnvVars = optionalEnvVars.filter(
  (envVar) => !process.env[envVar] || process.env[envVar].trim() === ""
);
if (missingOptionalEnvVars.length > 0) {
  console.warn(
    "Firebase Config - Missing optional environment variables (Analytics may not work):",
    missingOptionalEnvVars
  );
}

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Log the configuration for debugging (mask sensitive fields)
console.log("Firebase Config:", {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? "[REDACTED]" : undefined,
  appId: firebaseConfig.appId ? "[REDACTED]" : undefined,
});

// Validate measurementId format if present
let measurementId = firebaseConfig.measurementId;
if (measurementId && !/^G-[A-Z0-9]{8,10}$/.test(measurementId)) {
  console.warn("Firebase Config - Invalid measurementId format. Expected format: 'G-XXXXXXXXXX'. Analytics will not be initialized.");
  measurementId = undefined; // Disable Analytics if invalid
}

// Retry logic for Firebase service initialization
const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callback();
    } catch (error) {
      const delay = Math.pow(2, attempt - 1) * retryDelayBase; // Fixed: Moved delay calculation inside the loop
      console.warn(`${operation} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Singleton pattern for Firebase services
let services = {
  app: null,
  db: null,
  auth: null,
  analytics: null,
};

// Initialization state to prevent duplicate logs in Strict Mode
const hasLoggedAppInitialized = { current: false };
const hasLoggedAppReinitialized = { current: false };

// Initialize Firebase with retry logic
const initializeFirebaseServices = async () => {
  try {
    services.app = await withRetry("Firebase App Initialization", async () => {
      const initializedApp = initializeApp(firebaseConfig);
      return initializedApp;
    });
    console.log("Firebase App Initialized:", services.app);
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
    // Log to console directly since analytics may not be initialized
    console.log("Firebase Config - App initialization failed:", error.message);
    throw new Error("Failed to initialize Firebase: " + error.message);
  }

  // Initialize Firestore service with retry logic
  try {
    services.db = await withRetry("Firestore Service Initialization", async () => {
      const initializedDb = getFirestore(services.app);
      return initializedDb;
    });
    console.log("Firestore Service Initialized:", services.db);
  } catch (error) {
    console.error("Firestore Service Initialization Error:", error);
    console.log("Firebase Config - Firestore initialization failed:", error.message);
    throw new Error("Failed to initialize Firestore: " + error.message);
  }

  // Initialize Auth service with retry logic
  try {
    services.auth = await withRetry("Auth Service Initialization", async () => {
      const initializedAuth = getAuth(services.app);
      return initializedAuth;
    });
    console.log("Auth Service Initialized:", services.auth);
  } catch (error) {
    console.error("Auth Service Initialization Error:", error);
    console.log("Firebase Config - Auth initialization failed:", error.message);
    throw new Error("Failed to initialize Firebase Auth: " + error.message);
  }

  // Initialize Analytics (optional, with fallback)
  try {
    if (measurementId) {
      services.analytics = await withRetry("Analytics Service Initialization", async () => {
        const initializedAnalytics = getAnalytics(services.app);
        return initializedAnalytics;
      });
      console.log("Analytics Service Initialized:", services.analytics);
      // Log app initialization event (only once)
      if (!hasLoggedAppInitialized.current && services.analytics) {
        logEvent(services.analytics, "app_initialized", {
          projectId: firebaseConfig.projectId,
          environment: process.env.NODE_ENV || "development",
          timestamp: new Date().toISOString(),
        });
        console.log("Firebase Config - App initialization logged to Firebase Analytics");
        hasLoggedAppInitialized.current = true;
      }
    } else {
      console.warn("Firebase Config - Analytics not initialized (missing or invalid measurementId).");
      services.analytics = null;
    }
  } catch (error) {
    console.error("Analytics Service Initialization Error:", error);
    if (services.analytics) {
      logEvent(services.analytics, "analytics_initialization_failed", {
        projectId: firebaseConfig.projectId,
        error_message: error.message,
        timestamp: new Date().toISOString(),
      });
      console.log("Firebase Config - Analytics initialization failure logged to Firebase Analytics");
    } else {
      console.log("Firebase Config - Analytics initialization failed:", error.message);
    }
    services.analytics = null; // Fallback to null if Analytics fails
  }
};

// Initialize services on load
initializeFirebaseServices();

// Log Firebase SDK version for debugging
const firebaseVersion = require("firebase/package.json").version;
console.log("Firebase SDK Version:", firebaseVersion);

// Function to reinitialize Firebase services (e.g., for testing or recovery)
export const reinitializeFirebase = async () => {
  try {
    console.log("Firebase Config - Reinitializing Firebase services...");
    services.app = await withRetry("Firebase App Reinitialization", async () => initializeApp(firebaseConfig));
    services.db = await withRetry("Firestore Service Reinitialization", async () => getFirestore(services.app));
    services.auth = await withRetry("Auth Service Reinitialization", async () => getAuth(services.app));
    if (measurementId) {
      services.analytics = await withRetry("Analytics Service Reinitialization", async () => {
        const newAnalytics = getAnalytics(services.app);
        // Log app reinitialization event (only once)
        if (!hasLoggedAppReinitialized.current && newAnalytics) {
          logEvent(newAnalytics, "app_reinitialized", {
            projectId: firebaseConfig.projectId,
            environment: process.env.NODE_ENV || "development",
            timestamp: new Date().toISOString(),
          });
          console.log("Firebase Config - App reinitialization logged to Firebase Analytics");
          hasLoggedAppReinitialized.current = true;
        }
        return newAnalytics;
      });
    } else {
      services.analytics = null;
    }
    console.log("Firebase Config - Services reinitialized successfully.");
  } catch (error) {
    console.error("Firebase Reinitialization Error:", error);
    if (services.analytics) {
      logEvent(services.analytics, "app_reinitialization_failed", {
        projectId: firebaseConfig.projectId,
        error_message: error.message,
        timestamp: new Date().toISOString(),
      });
      console.log("Firebase Config - App reinitialization failure logged to Firebase Analytics");
    } else {
      console.log("Firebase Config - App reinitialization failed:", error.message);
    }
    throw new Error("Failed to reinitialize Firebase services: " + error.message);
  }
};

// Export functions to access services
export const getApp = () => services.app;
export const getDb = () => services.db;
export const getAuthService = () => services.auth;
export const getAnalyticsService = () => services.analytics;