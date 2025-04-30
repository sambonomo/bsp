// /src/pages/Commissioner/sections/CommissionerMatchupsSection.js

import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc
} from "firebase/firestore";
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  Alert,
  CircularProgress,
  Box,
  Snackbar
} from "@mui/material";

import { getDb } from "../../../firebase/config";
import { logEvent } from "firebase/analytics";

// A helper to fetch upcoming games (like from Sportradar)
import { fetchSchedule } from "../../../utils/sportsRadar";

/**
 * CommissionerMatchupsSection:
 * Lets the commissioner:
 * - Fetch & list upcoming games from a sports schedule
 * - Add them as matchups into Firestore sub-collection `/pools/{poolId}/matchups`
 * - Also lists existing matchups & optionally allows removing them
 *
 * Props:
 * - user: current user
 * - poolId: Firestore doc ID
 * - poolData: the pool object
 * - analytics: optional analytics instance
 */
export default function CommissionerMatchupsSection({ user, poolId, poolData, analytics }) {
  const isCommissioner = poolData?.commissionerId === user?.uid;
  const db = getDb();

  // State for errors & success
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // State for upcoming games
  const [games, setGames] = useState([]);
  const [fetchingGames, setFetchingGames] = useState(false);

  // State for existing matchups in sub-collection
  const [matchups, setMatchups] = useState([]);
  const [loadingMatchups, setLoadingMatchups] = useState(true);

  if (!isCommissioner) {
    return null; // Hide if not commissioner
  }

  // Fetch matchups from sub-collection in real-time
  useEffect(() => {
    setLoadingMatchups(true);
    const matchupsRef = collection(db, "pools", poolId, "matchups");
    const unsubscribe = onSnapshot(
      matchupsRef,
      (snapshot) => {
        const matchupData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setMatchups(matchupData);
        setLoadingMatchups(false);
      },
      (err) => {
        setError("Failed to fetch matchups.");
        setLoadingMatchups(false);
        console.error("CommissionerMatchupsSection - onSnapshot error:", err);
      }
    );
    return () => unsubscribe();
  }, [db, poolId]);

  // Fetch upcoming games if the pool has a recognized sport/season
  useEffect(() => {
    // Only fetch if the pool has e.g. poolData.sport and poolData.season
    if (!poolData?.sport || !poolData?.season) {
      return; // Not enough info to fetch schedule
    }

    const doFetch = async () => {
      setFetchingGames(true);
      try {
        const upcoming = await fetchSchedule(poolData.sport.toLowerCase(), poolData.season);
        setGames(upcoming);
      } catch (err) {
        setError("Failed to fetch upcoming games from schedule.");
        console.error("CommissionerMatchupsSection - fetchSchedule error:", err);
      } finally {
        setFetchingGames(false);
      }
    };

    doFetch();
  }, [poolData?.sport, poolData?.season]);

  // Clear any old messages if pool changes
  useEffect(() => {
    setError("");
    setSuccessMessage("");
  }, [poolId]);

  /**
   * Adds a game as a matchup in Firestore sub-collection
   */
  const handleAddGame = async (game) => {
    setError("");
    setSuccessMessage("");

    // Build a matchup object from the `game` data
    const matchup = {
      gameId: game.id, // or game.gameId
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      startTime: game.scheduled, // ISO string
      status: "pending"
    };

    // Basic validation (you could do more if needed)
    if (!matchup.homeTeam || !matchup.awayTeam || !matchup.startTime) {
      setError("Game data is incomplete. Cannot add this matchup.");
      return;
    }

    try {
      await addDoc(collection(db, "pools", poolId, "matchups"), matchup);
      setSuccessMessage(`Added game: ${matchup.awayTeam} @ ${matchup.homeTeam}`);
      if (analytics) {
        logEvent(analytics, "add_matchup", {
          userId: user.uid,
          poolId,
          gameId: matchup.gameId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError("Failed to add game to matchups.");
      console.error("handleAddGame - error:", err);
      if (analytics) {
        logEvent(analytics, "add_matchup_failed", {
          userId: user.uid,
          poolId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  /**
   * Optional: Remove an existing matchup
   */
  const handleRemoveMatchup = async (matchupId) => {
    setError("");
    setSuccessMessage("");
    try {
      await deleteDoc(doc(db, "pools", poolId, "matchups", matchupId));
      setSuccessMessage("Matchup removed successfully.");
      if (analytics) {
        logEvent(analytics, "remove_matchup", {
          userId: user.uid,
          poolId,
          matchupId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError("Failed to remove matchup.");
      console.error("handleRemoveMatchup - error:", err);
      if (analytics) {
        logEvent(analytics, "remove_matchup_failed", {
          userId: user.uid,
          poolId,
          matchupId,
          error_message: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  return (
    <Card sx={{ mb: 3, borderRadius: 2, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Matchups Management
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert" aria-live="assertive">
            {error}
          </Alert>
        )}
        <Snackbar
          open={!!successMessage}
          autoHideDuration={3000}
          onClose={() => setSuccessMessage("")}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert severity="success" aria-live="assertive">
            {successMessage}
          </Alert>
        </Snackbar>

        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
            Upcoming Games (via Sportradar)
          </Typography>
          {fetchingGames ? (
            <Box sx={{ textAlign: "center" }}>
              <CircularProgress aria-label="Fetching upcoming games" />
              <Typography sx={{ mt: 1 }}>Fetching games...</Typography>
            </Box>
          ) : games.length === 0 ? (
            <Alert severity="info">No upcoming games found for {poolData.sport} {poolData.season}.</Alert>
          ) : (
            <Table size="small" aria-label="Upcoming games table">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Matchup</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {games.map((game) => {
                  const dateStr = new Date(game.scheduled).toLocaleString();
                  const isAlreadyAdded = matchups.some((m) => m.gameId === game.id);
                  return (
                    <TableRow key={game.id}>
                      <TableCell>{dateStr}</TableCell>
                      <TableCell>
                        {game.away.name} @ {game.home.name}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="contained"
                          disabled={isAlreadyAdded}
                          onClick={() => handleAddGame(game)}
                          aria-label={`Add game ${game.away.name} vs ${game.home.name}`}
                        >
                          {isAlreadyAdded ? "Added" : "Add to Pool"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
            Existing Matchups in Your Pool
          </Typography>
          {loadingMatchups ? (
            <CircularProgress aria-label="Loading matchups" />
          ) : matchups.length === 0 ? (
            <Alert severity="info">No matchups in this pool yet.</Alert>
          ) : (
            <Table size="small" aria-label="Existing matchups table">
              <TableHead>
                <TableRow>
                  <TableCell>Matchup ID</TableCell>
                  <TableCell>Home vs Away</TableCell>
                  <TableCell>Start Time</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matchups.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.id}</TableCell>
                    <TableCell>
                      {m.homeTeam} vs {m.awayTeam}
                    </TableCell>
                    <TableCell>
                      {m.startTime
                        ? new Date(m.startTime).toLocaleString()
                        : "N/A"}
                    </TableCell>
                    <TableCell>{m.status}</TableCell>
                    <TableCell align="right">
                      {/* Optional remove button */}
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => handleRemoveMatchup(m.id)}
                        aria-label={`Remove matchup ${m.id}`}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
