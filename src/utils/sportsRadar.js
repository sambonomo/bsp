/**
 * Utility module for interacting with the SportsRadar API to fetch sports schedules.
 * Uses the native fetch API for HTTP requests, with retry logic for reliability.
 */

/**
 * API key for SportsRadar, loaded from environment variables.
 * @type {string}
 */
const API_KEY = process.env.REACT_APP_SPORTSRADAR_API_KEY;

/**
 * Base URL for SportsRadar API endpoints.
 * @type {string}
 */
const BASE_URL = 'https://api.sportsradar.us';

// Validate API key presence
if (!API_KEY) {
  throw new Error('SportsRadar API key is missing. Ensure REACT_APP_SPORTSRADAR_API_KEY is set in .env.');
}

/**
 * Retries an asynchronous operation with exponential backoff.
 * @param {string} operation - Name of the operation for logging purposes.
 * @param {Function} callback - The async function to retry.
 * @param {number} [maxRetries=3] - Maximum number of retry attempts.
 * @param {number} [retryDelayBase=1000] - Base delay in milliseconds for exponential backoff.
 * @returns {Promise<any>} The result of the callback function.
 * @throws {Error} If all retries fail, throws the last error encountered.
 */
const withRetry = async (operation, callback, maxRetries = 3, retryDelayBase = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callback();
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`Operation "${operation}" failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      const delay = Math.pow(2, attempt - 1) * retryDelayBase;
      console.warn(`Attempt ${attempt} failed for "${operation}". Retrying after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Fetches the upcoming game schedule for a given sport and season from SportsRadar.
 * @param {string} sport - The sport to fetch the schedule for (e.g., 'nfl').
 * @param {string} season - The season year (e.g., '2025').
 * @returns {Promise<Array>} A promise that resolves to an array of game objects.
 * @throws {Error} If the API request fails or returns an invalid response.
 */
export const fetchSchedule = async (sport, season) => {
  try {
    // Validate inputs
    if (!sport || typeof sport !== 'string') {
      throw new Error('Sport must be a non-empty string.');
    }
    if (!season || typeof season !== 'string') {
      throw new Error('Season must be a non-empty string.');
    }

    const url = `${BASE_URL}/${sport}/trial/v7/en/games/${season}/schedule.json?api_key=${API_KEY}`;
    const response = await withRetry(`Fetch ${sport} Schedule`, () => fetch(url));

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded for SportsRadar API. Please try again later.');
      }
      if (response.status === 401) {
        throw new Error('Invalid SportsRadar API key. Check your REACT_APP_SPORTSRADAR_API_KEY.');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.games || !Array.isArray(data.games)) {
      throw new Error('Invalid response format from SportsRadar API: games field missing or not an array.');
    }

    return data.games;
  } catch (error) {
    console.error(`Error fetching SportsRadar ${sport} schedule:`, error);
    throw new Error('Failed to fetch schedule. Please try again later.');
  }
};