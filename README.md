# 🍽️ EdgeVision → FaceAccess Restaurant
## Document de Spécification pour Agent IA
**Objectif :** Transformer EdgeVision (détection d'objets ESP32-CAM) en un système de **contrôle d'accès restaurant par reconnaissance faciale**, avec traitement local sur PC, application mobile et site web liés.

---

## 📌 Contexte du Projet

Le projet **EdgeVision** actuel est un système de surveillance IoT basé sur :
- **ESP32-CAM** → capture images + détection d'objets (Edge Impulse FOMO)
- **MQTT (HiveMQ Cloud)** → communication
- **Node.js + MongoDB Atlas** → serveur + stockage
- **Dashboard HTML** → interface web

### Ce qu'on veut faire :
Transformer ce système pour qu'il devienne un **contrôle d'accès à un restaurant** par **reconnaissance faciale**, fonctionnant comme suit :

1. **Enregistrement (enrollment)** : Interface mobile qui ouvre la caméra, guide l'utilisateur à balayer son visage sous plusieurs angles (comme Face ID iPhone), enregistre automatiquement les photos, entraîne le modèle localement sur le PC, et ajoute ce visage à la base de connaissances.
2. **Contrôle d'accès** : L'ESP32-CAM à l'entrée du restaurant capture un visage, envoie les données au serveur local sur le PC, et reçoit une réponse **OK (accès autorisé)** ou **NON (accès refusé)**.
3. **Lien Mobile ↔ Web** : L'application mobile et le site web sont synchronisés (même backend).

---

## 🏗️ Nouvelle Architecture Cible

```
[Application Mobile React Native]
        ↕ (enrollment + gestion)
[Serveur Node.js LOCAL sur PC]  ←→  [Moteur de Reconnaissance Faciale LOCAL (Python face_recognition)]
        ↕                                        ↕
[MongoDB Local]                    [Base de visages encodés (.pkl)]
        ↕
[Site Web Admin (HTML/JS)]
        ↑
[ESP32-CAM à l'entrée du restaurant]
    → capture visage → envoie image JPEG via HTTP POST → reçoit OK/NON
```

---

## 🔧 Modifications à Apporter au Code Existant

### 1. `server-opti.js` → Remplacer par `server.js` complet

Le serveur Node.js doit être **entièrement reconfiguré** :

**Supprimer :**
- Toute la logique MQTT (HiveMQ Cloud)
- La détection d'objets generique (labels, bounding boxes)
- L'envoi MQTT depuis ESP32

**Ajouter :**

```javascript
// Nouvelles routes à ajouter dans server.js

// POST /api/recognize → reçoit image de l'ESP32-CAM, appelle Python, retourne OK/NON
app.post('/api/recognize', upload.single('image'), async (req, res) => {
  // 1. Sauvegarder l'image temporairement
  // 2. Appeler le script Python de reconnaissance faciale
  // 3. Retourner { authorized: true/false, person: "nom", confidence: 0.95 }
  // 4. Logger l'événement dans MongoDB (accès autorisé/refusé + timestamp + photo)
});

// POST /api/enroll → reçoit les photos d'enrollment depuis l'app mobile
app.post('/api/enroll', upload.array('photos', 20), async (req, res) => {
  // 1. Recevoir 15-20 photos du visage sous différents angles
  // 2. Appeler le script Python d'encoding
  // 3. Sauvegarder les encodings dans faces_db.pkl
  // 4. Enregistrer la personne dans MongoDB (nom, role: client/staff, dateEnrollment)
  // 5. Retourner { success: true, personId: "..." }
});

// GET /api/persons → liste toutes les personnes enregistrées
// DELETE /api/persons/:id → supprimer une personne de la base
// GET /api/access-logs → historique des accès (OK/NON + photos)
// GET /api/stats → statistiques (nb accès aujourd'hui, taux refus, etc.)
```

---

### 2. Nouveau Script Python : `face_engine.py`

Créer un script Python sur le PC qui fait le traitement facial **localement** :

```python
# face_engine.py - Moteur de reconnaissance faciale local
# Librairies requises : face_recognition, numpy, pickle, flask

# Mode 1: Enrollment
# Input: dossier avec 15-20 photos d'une personne
# Output: encodings sauvegardés dans faces_db.pkl

# Mode 2: Recognition  
# Input: chemin vers une image JPEG
# Output: JSON { "recognized": true, "person": "Jean Dupont", "confidence": 0.94 }

# Lancer comme microservice Flask sur port 5001
# Le serveur Node.js l'appelle en HTTP interne
```

**Installation :**
```bash
pip install face_recognition flask numpy pillow
```

---

### 3. `cupbottle.ino` → Remplacer par `face_access_esp32.ino`

Le firmware ESP32-CAM doit être **complètement réécrit** :

**Supprimer :**
- La librairie Edge Impulse FOMO
- Toute la logique MQTT
- La détection d'objets

**Nouveau comportement :**
```cpp
// face_access_esp32.ino
// 1. Capturer une image JPEG avec la caméra OV2640
// 2. Envoyer l'image en HTTP POST vers http://[IP_PC_LOCAL]:3000/api/recognize
// 3. Lire la réponse JSON : { "authorized": true/false }
// 4. Si authorized=true → ouvrir le verrou (GPIO pin HIGH)
// 5. Si authorized=false → LED rouge, buzzer
// 6. Répéter toutes les 2 secondes si mouvement détecté (PIR sensor optionnel)

// Libraries nécessaires (remplacer Edge Impulse par) :
// - esp_camera.h (inclus dans ESP32 Arduino core)
// - HTTPClient.h
// - ArduinoJson.h
// - WiFi.h
```

---

### 4. `dashboard.html` → Transformer en Interface Admin Restaurant

**Supprimer :**
- Les sections "Live Detections" (bounding boxes, labels FOMO)
- Les statistiques de détection d'objets

**Ajouter/Modifier :**

```html
<!-- Sections du nouveau dashboard restaurant -->

<!-- 1. Accueil/Stats -->
- Nombre d'accès aujourd'hui (autorisés / refusés)
- Personnes actuellement dans le restaurant
- Derniers accès en temps réel (WebSocket)
- Alerte si accès refusé répété

<!-- 2. Gestion des Personnes -->
- Liste des personnes enregistrées (clients VIP, staff, livreurs)
- Photo de profil + nom + rôle + date d'enrollment
- Bouton "Supprimer" 
- Bouton "Désactiver temporairement"

<!-- 3. Journal d'Accès -->
- Tableau : Date/Heure | Personne | Résultat (✅/❌) | Photo capturée | Confiance %
- Filtres : par date, par personne, par résultat
- Export CSV

<!-- 4. Configuration Système -->
- Seuil de confiance (défaut: 0.6, ajustable)
- IP de l'ESP32-CAM
- Status du moteur Python (en ligne/hors ligne)
- Status MongoDB
```

---

### 5. Nouvelle Application Mobile (React Native / Expo)

Créer une app mobile **liée au même backend** :

#### Écrans :

**Écran 1 : Accueil**
```
- Bouton "Enregistrer un nouveau visage"
- Bouton "Voir les accès récents"  
- Status de la connexion au serveur
```

**Écran 2 : Enrollment (comme Face ID)**
```
Interface caméra plein écran avec :
- Guide animé (cercle qui tourne) → "Tournez lentement à gauche"
- "Maintenant à droite"
- "Regardez en haut"
- "Regardez en bas"  
- "Fermez légèrement les yeux"
- Compteur de photos : 0/15
- Capture automatique toutes les 500ms pendant le scan
- Upload automatique vers POST /api/enroll quand 15 photos atteintes
- Champ : Nom de la personne + Rôle (Client VIP / Staff / Livreur)
```

**Écran 3 : Confirmation**
```
- "Visage enregistré avec succès !"
- Photo de profil générée
- Bouton "Enregistrer un autre"
```

**Écran 4 : Journal d'accès**
```
- Liste temps réel des accès (même que le dashboard web)
- Pull-to-refresh
```

**Technologies suggérées :**
```
- React Native + Expo
- expo-camera (pour accès caméra)
- axios (pour API calls)
- react-native-reanimated (pour animations d'enrollment)
```

---

## 🗄️ Schéma MongoDB (Local)

Remplacer les collections actuelles par :

```javascript
// Collection: persons
{
  _id: ObjectId,
  name: "Jean Dupont",
  role: "client_vip" | "staff" | "livreur" | "admin",
  enrolledAt: ISODate,
  enrolledBy: "admin",
  active: true,
  photoUrl: "/uploads/persons/jean_dupont_profile.jpg",
  encodingFile: "faces_db.pkl" // référence au fichier pickle Python
}

// Collection: access_logs
{
  _id: ObjectId,
  timestamp: ISODate,
  personId: ObjectId | null, // null si inconnu
  personName: "Jean Dupont" | "INCONNU",
  authorized: true | false,
  confidence: 0.94,
  capturedImagePath: "/uploads/logs/2024-01-15_14h30_access.jpg",
  espMacAddress: "AA:BB:CC:DD:EE:FF" // identifier quel ESP32
}
```

---

## 📁 Nouvelle Structure du Projet

```
EdgeVision-Restaurant/
├── server/
│   ├── server.js              ← Serveur Node.js principal (modifié)
│   ├── routes/
│   │   ├── recognize.js       ← Route POST /api/recognize
│   │   ├── enroll.js          ← Route POST /api/enroll
│   │   ├── persons.js         ← CRUD personnes
│   │   └── logs.js            ← Journal d'accès
│   ├── package.json           ← Ajouter: multer, child_process
│   └── .env                   ← MONGODB_URI=mongodb://localhost:27017/restaurant_access
│
├── face_engine/
│   ├── face_engine.py         ← Moteur Python (Flask microservice)
│   ├── faces_db.pkl           ← Base d'encodings (généré automatiquement)
│   └── requirements.txt       ← face_recognition, flask, numpy, pillow
│
├── web/
│   ├── dashboard.html         ← Dashboard admin (modifié)
│   └── login.html             ← Garder tel quel
│
├── mobile/
│   ├── App.js                 ← App React Native/Expo
│   ├── screens/
│   │   ├── HomeScreen.js
│   │   ├── EnrollScreen.js    ← L'écran "Face ID style"
│   │   ├── ConfirmScreen.js
│   │   └── LogsScreen.js
│   └── package.json
│
├── esp32/
│   └── face_access_esp32.ino ← Nouveau firmware (remplace cupbottle.ino)
│
└── uploads/
    ├── enrollment/            ← Photos temporaires d'enrollment
    ├── persons/               ← Photos de profil
    └── logs/                  ← Photos capturées lors des accès
```

---

## ⚙️ Variables d'Environnement `.ENV` (Modifier)

```env
# Supprimer les variables MQTT HiveMQ
# MQTT_HOST=...  ← SUPPRIMER
# MQTT_USER=...  ← SUPPRIMER

# Garder et modifier
MONGODB_URI=mongodb://localhost:27017/restaurant_access
SESSION_SECRET=votre_secret_ici
PORT=3000

# Ajouter
PYTHON_ENGINE_URL=http://localhost:5001
FACE_CONFIDENCE_THRESHOLD=0.60
ESP32_IP=192.168.1.xxx  # IP locale de l'ESP32-CAM
```

---

## 🔄 Flux de Données Détaillé

### Flux Enrollment (Enregistrement via App Mobile)

```
[App Mobile]
  1. Ouvre caméra
  2. Affiche guide d'animation (tourner tête)
  3. Capture auto 15 photos toutes les 500ms
  4. POST /api/enroll { name, role, photos[] }
        ↓
[Server Node.js :3000]
  5. Sauvegarde photos dans /uploads/enrollment/
  6. Appelle face_engine.py en mode encoding
        ↓
[face_engine.py Flask :5001]
  7. Génère les encodings de chaque photo
  8. Moyenne des encodings → 1 vecteur représentatif
  9. Sauvegarde dans faces_db.pkl
  10. Retourne { success: true }
        ↓
[Server Node.js]
  11. Enregistre person dans MongoDB
  12. Retourne { success: true, personId: "..." } à l'app mobile
        ↓
[App Mobile]
  13. Affiche "Enregistré avec succès !"
```

### Flux Contrôle d'Accès (ESP32-CAM → Serveur)

```
[ESP32-CAM à l'entrée restaurant]
  1. Détecte présence (optionnel: PIR sensor ou détection continue)
  2. Capture image JPEG (320x240 ou 640x480)
  3. POST /api/recognize { image: multipart/form-data }
        ↓
[Server Node.js :3000]
  4. Reçoit image, la sauvegarde temporairement
  5. POST vers face_engine.py: { imagePath: "..." }
        ↓
[face_engine.py Flask :5001]
  6. Charge faces_db.pkl
  7. Encode le visage dans l'image reçue
  8. Compare avec tous les encodings en base
  9. Si distance < seuil (0.6) → reconnu
  10. Retourne { recognized: true, person: "Jean Dupont", confidence: 0.94 }
        ↓
[Server Node.js]
  11. Log l'accès dans MongoDB (access_logs)
  12. Retourne { authorized: true, person: "Jean Dupont" } à l'ESP32
        ↓
[ESP32-CAM]
  13. Si authorized=true → GPIO HIGH (ouvrir serrure) pendant 3 secondes
  14. Si authorized=false → LED rouge + buzzer 1 seconde
  15. Envoie aussi le résultat via WebSocket au dashboard web (temps réel)
```

---

## 📦 Dépendances à Ajouter/Modifier

### `package.json` Node.js (modifications)

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.0.0",
    "express-session": "^1.17.3",
    "multer": "^1.4.5",          // ← AJOUTER (upload images)
    "node-fetch": "^3.3.0",      // ← AJOUTER (appels vers Python)
    "socket.io": "^4.6.0",       // ← AJOUTER (WebSocket temps réel)
    "cors": "^2.8.5"
  }
}
// SUPPRIMER: mqtt, mqtt-packet (plus besoin)
```

### `requirements.txt` Python (nouveau fichier)

```
face_recognition==1.3.0
flask==3.0.0
numpy==1.24.0
pillow==10.0.0
```

---

## 🔑 Points Critiques à Respecter

1. **Traitement 100% LOCAL** : Le moteur Python tourne sur le PC. Aucune donnée de visage n'est envoyée dans le cloud. MongoDB est en local (`localhost`).

2. **ESP32-CAM en HTTP simple** : L'ESP32 fait des requêtes HTTP POST au serveur local (remplace complètement MQTT). L'ESP32 et le PC doivent être sur le **même réseau WiFi local**.

3. **App Mobile connectée au même serveur** : L'app mobile pointe vers l'IP locale du PC (ex: `http://192.168.1.50:3000`). Pour un déploiement production, utiliser un tunnel (ngrok) ou déployer le serveur.

4. **Sécurité biométrique** : Les données de visage (encodings) restent en local dans `faces_db.pkl`. Ne pas les synchroniser dans le cloud sans consentement.

5. **Performance ESP32** : L'ESP32-CAM ne fait **plus de traitement IA** en local (supprimer Edge Impulse). Il est juste une caméra + client HTTP. Tout le traitement IA se fait sur le PC.

---

## 🚀 Ordre d'Implémentation Recommandé

1. **Étape 1** : Créer `face_engine.py` (Flask + face_recognition) et tester en local
2. **Étape 2** : Modifier `server.js` (nouvelles routes, supprimer MQTT, ajouter multer + socket.io)
3. **Étape 3** : Modifier `dashboard.html` (nouveau UI restaurant)
4. **Étape 4** : Réécrire `face_access_esp32.ino` (HTTP POST simple)
5. **Étape 5** : Créer l'app mobile React Native/Expo avec l'écran d'enrollment

---

## 🧪 Test End-to-End

```bash
# Terminal 1: Démarrer le moteur Python
cd face_engine/
python face_engine.py
# → Flask running on http://localhost:5001

# Terminal 2: Démarrer le serveur Node.js
cd server/
node server.js
# → Server running on http://localhost:3000

# Test enrollment via curl:
curl -X POST http://localhost:3000/api/enroll \
  -F "name=Jean Dupont" \
  -F "role=client_vip" \
  -F "photos=@photo1.jpg" \
  -F "photos=@photo2.jpg"

# Test recognition via curl:
curl -X POST http://localhost:3000/api/recognize \
  -F "image=@test_face.jpg"
# → { "authorized": true, "person": "Jean Dupont", "confidence": 0.94 }
```

---
