// ─────────────────────────────────────────────────────────────────────────────
// VYPLŇ SVOU FIREBASE KONFIGURACI
// Najdeš ji na: Firebase Console → Project Settings → Your apps → SDK setup
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyAulLZ-6t5RjbLrjQ1uv_M7jCOKm9ekOR0",
  authDomain:        "sklenka-trial-park.firebaseapp.com",
  projectId:         "sklenka-trial-park",
  storageBucket:     "sklenka-trial-park.firebasestorage.app",
  messagingSenderId: "33417812664",
  appId:             "1:33417812664:web:dbdd6031f483956a93f24d",
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
