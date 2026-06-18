// ============================================================
//  ProjectOS — Authentication Helpers
// ============================================================

function signIn(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

function signInWithGoogle() {
  return auth.signInWithPopup(googleProvider);
}

function signOut() {
  return auth.signOut();
}

function sendPasswordReset(email) {
  return auth.sendPasswordResetEmail(email);
}

function getCurrentUser() {
  return auth.currentUser;
}

function getAuthErrorMessage(code) {
  const m = {
    'auth/invalid-email':           'Invalid email address.',
    'auth/user-disabled':           'Your account has been disabled.',
    'auth/user-not-found':          'No account found with this email.',
    'auth/wrong-password':          'Incorrect password. Try again.',
    'auth/invalid-credential':      'Invalid email or password.',
    'auth/too-many-requests':       'Too many attempts. Please wait and try again.',
    'auth/email-already-in-use':    'This email is already registered.',
    'auth/weak-password':           'Password must be at least 6 characters.',
    'auth/network-request-failed':  'Network error. Check your connection.',
    'auth/popup-closed-by-user':    'Sign-in popup was closed.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  };
  return m[code] || 'Authentication failed. Please try again.';
}

// Creates or updates user document in Firestore
async function ensureUserDoc(user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid:      user.uid,
      email:    user.email,
      name:     user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || null,
      role:     'member',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
  }
  return ref.get();
}
