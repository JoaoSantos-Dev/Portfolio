import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";

// Configuração do Firebase Web SDK.
// Se trocar de projeto Firebase, cole aqui as chaves reais do novo app web.
const firebaseConfig = {
  apiKey: "AIzaSyDs0FLesHEudN-GoUYMroBGwHHdBT_J1kQ",
  authDomain: "radar-gamedev.firebaseapp.com",
  projectId: "radar-gamedev",
  storageBucket: "radar-gamedev.firebasestorage.app",
  messagingSenderId: "993779612169",
  appId: "1:993779612169:web:ba0f1fe7ba777d6bc316d8"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
