// ============================================================
//  ProjectOS — Firebase Configuration
//  Replace the placeholder values with your Firebase project config.
//  Get these from: Firebase Console → Project Settings → General
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBaa8iCIrgrNRqsPxsY7yFpww2dwkx8RPM",
  authDomain: "dex-dashboard-eef82.firebaseapp.com",
  projectId: "dex-dashboard-eef82",
  storageBucket: "dex-dashboard-eef82.firebasestorage.app",
  messagingSenderId: "788331971969",
  appId: "1:788331971969:web:8037e8308e58633002d480"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firestore + Auth instances (used globally)
const db   = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
