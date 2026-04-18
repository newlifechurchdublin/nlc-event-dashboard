// Firebase project: nlc-dublin
export const firebaseConfig = {
  apiKey: "AIzaSyBhxJfSFnhlkt5MMfSINtNTg04mW_vOnv4",
  authDomain: "nlc-dublin.firebaseapp.com",
  projectId: "nlc-dublin",
  storageBucket: "nlc-dublin.firebasestorage.app",
  messagingSenderId: "517075821261",
  appId: "1:517075821261:web:6ccaf5b6e03fd77484ff84"
};

// Staff passcode — required before anyone can view the dashboard.
// Share this with the church team so they can open the link.
export const VIEWER_PASSCODE = "Nlc2026";

// Admin passcode — unlocks add/edit/delete (used by Pauline only).
export const ADMIN_PASSCODE = "Nlc@event";

// Use Firestore (shared, real-time). Set to true to fall back to browser-only mode.
export const USE_LOCAL_DEMO = false;
