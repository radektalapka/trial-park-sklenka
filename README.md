# 🏍️ MX Pozemek – Check-in aplikace

Webová aplikace pro sledování přítomnosti jezdců na pozemku v reálném čase.

---

## 🚀 Nasazení krok za krokem

### 1. Firebase projekt (5 minut)

1. Jdi na **https://console.firebase.google.com**
2. Klikni **"Add project"** → pojmenuj ho (např. `moto-track`)
3. Google Analytics: můžeš vypnout, není potřeba
4. Po vytvoření jdi do projektu

**Firestore databáze:**
1. Vlevo klikni na **"Firestore Database"**
2. **"Create database"**
3. Vyber **"Start in test mode"** (pravidla nastavíme hned)
4. Region: `eur3 (europe-west)` → **Enable**

**Zkopíruj konfiguraci:**
1. Vlevo nahoře ⚙️ → **Project settings**
2. Dolů na **"Your apps"** → klikni ikonu **`</>`** (Web)
3. Pojmenuj appku (např. `moto-web`) → **Register app**
4. Zkopíruj celý objekt `firebaseConfig`

---

### 2. Nastav konfiguraci v kódu

Otevři soubor `src/firebase.js` a nahraď hodnoty:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",        // ← tvoje hodnoty
  authDomain:        "moto-track-xxx.firebaseapp.com",
  projectId:         "moto-track-xxx",
  storageBucket:     "moto-track-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
}
```

---

### 3. Nastav Firestore pravidla

Ve Firebase Console:
1. **Firestore Database** → záložka **"Rules"**
2. Nahraď vše obsahem souboru `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /riders/{id} {
      allow read, write: if true;
    }
    match /checkins/{id} {
      allow read, write: if true;
    }
  }
}
```

3. Klikni **"Publish"**

---

### 4. Spusť lokálně (testování)

```bash
npm install
npm run dev
```

Otevři **http://localhost:5173**

---

### 5. Nasaď na Vercel (produkce)

```bash
npm install -g vercel
vercel
```

Nebo přes GitHub:
1. Nahraj projekt na GitHub
2. Jdi na **vercel.com** → New Project → importuj repo
3. Deploy → dostaneš URL jako `moto-track.vercel.app`

---

## ⚙️ Konfigurace

### Admin PIN
V souboru `src/App.jsx` na řádku 8:
```js
const ADMIN_PIN = '1234'  // ← změň!
```

### Přespání / upozornění
V `src/App.jsx` funkce `isOvernight`:
```js
function isOvernight(ts) {
  return Date.now() - d.getTime() > 8 * 3600000  // 8 hodin → změň dle potřeby
}
```

---

## 📱 Struktura aplikace

```
moto-track/
├── src/
│   ├── App.jsx        ← hlavní aplikace
│   ├── firebase.js    ← konfigurace Firebase ← SEM VLOŽ SVŮJ CONFIG
│   └── main.jsx       ← vstupní bod
├── index.html
├── firestore.rules    ← pravidla pro Firestore
├── package.json
└── vite.config.js
```

---

## 🔥 Firebase kolekce

| Kolekce | Popis |
|---------|-------|
| `riders` | Seznam jezdců (name, pin) |
| `checkins` | Záznamy příjezdů/odjezdů (riderId, name, inAt, outAt) |

---

## ❓ Časté problémy

**"Missing or insufficient permissions"**
→ Firestore pravidla nejsou správně nastavena. Zkontroluj krok 3.

**Data se nezobrazují**
→ Zkontroluj `src/firebase.js` – projectId musí odpovídat tvému Firebase projektu.

**Aplikace se nenačítá**
→ Spusť `npm install` a zkontroluj chyby v konzoli prohlížeče (F12).
