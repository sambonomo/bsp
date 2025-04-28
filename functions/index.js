const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Example Cloud Function: helloWorld
exports.helloWorld = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase!");
});

// Add more Cloud Functions as needed
// exports.anotherFunction = functions.https.onRequest((request, response) => {
//   response.send("Another function!");
// });
