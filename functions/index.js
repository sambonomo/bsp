const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Firestore instance
const db = admin.firestore();

// Utility to generate a unique invite code
const generateInviteCode = async () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code;
  let isUnique = false;
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts && !isUnique; attempt++) {
    code = Array(8)
        .fill()
        .map(() => characters.charAt(
            Math.floor(Math.random() * characters.length),
        ))
        .join("");

    const snapshot = await db.collection("pools")
        .where("inviteCode", "==", code)
        .get();
    isUnique = snapshot.empty;
  }

  if (!isUnique) {
    throw new functions.https.HttpsError(
        "internal",
        "Failed to generate a unique invite code after maximum attempts.",
    );
  }

  return code;
};

// Cloud Function to generate a unique invite code
exports.generateInviteCode = functions.https.onCall(async (data, context) => {
  try {
    const inviteCode = await generateInviteCode();
    return {inviteCode};
  } catch (error) {
    throw new functions.https.HttpsError(
        "internal",
        "Failed to generate invite code: " + error.message,
    );
  }
});
