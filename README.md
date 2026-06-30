# FaceAccess Restaurant - Système de Contrôle d'Accès par Reconnaissance Faciale

FaceAccess Restaurant est une solution complète d'accès sécurisé par reconnaissance faciale à l'aide d'une caméra embarquée **ESP32-CAM**, couplée à un moteur de reconnaissance **Python**, un serveur **Node.js** (API & Base de données MongoDB) et une application mobile **React Native (Expo)**.

---

## 🏗️ Architecture du Système

```
[ ESP32-CAM ] --(Envoi d'images HTTP)--> [ Serveur Node.js (3000) ] <---> [ Base MongoDB ]
                                                |
                                      (Vérification d'identité)
                                                |
                                                v
                                    [ Moteur Face Python (5001) ]
                                                |
                                      (WebSocket / API HTTP)
                                                v
                                  [ App Mobile / Dashboard Web ]
```

1. **ESP32-CAM** : Capture périodiquement des images et les envoie via requête POST HTTP multipart au serveur Node.js. En cas de succès, elle pilote un relais (serrure électrique) et des LEDs d'état.
2. **Python Face Engine** : Moteur basé sur la reconnaissance faciale (ex: `face_recognition` ou OpenCV) qui tourne sur le port `5001` pour encoder et comparer les visages.
3. **Node.js Server** : Serveur central (Express) sur le port `3000` gérant les accès MongoDB, l'historique des connexions (logs), l'authentification et les notifications en temps réel par WebSockets.
4. **Application Mobile (Expo)** : Permet aux administrateurs d'enregistrer de nouvelles personnes en prenant des photos sous différents angles (visage droit, gauche, sourire, etc.) et de consulter le journal des accès.
5. **Dashboard Web** : Interface de contrôle pour surveiller les accès et gérer le personnel.

---

## 🔧 Prérequis Matériels

* **ESP32-CAM** (Modèle AI-Thinker)
* Alimentation 5V stable (recommandée)
* Un relais 5V (pour la gâche électrique)
* LEDs d'état (Verte et Rouge) & un Buzzer actif

---

## 💻 Configuration & Installation

### 1. Base de données (MongoDB)
Assurez-vous qu'une instance MongoDB locale tourne sur votre machine sur le port par défaut `27017` ou configurez l'URI dans le fichier `.env` du serveur.

### 2. Démarrage du Moteur Python (Face Engine)
Accédez au dossier et installez les dépendances :
```bash
cd face_engine
pip install -r requirements.txt
python face_engine.py
```

### 3. Démarrage du Serveur Node.js
Accédez au dossier du serveur :
```bash
cd server
npm install
npm start
```
*Le serveur crée automatiquement un compte administrateur par défaut : `admin` / `admin123`.*

### 4. Démarrage de l'Application Mobile (Expo)
Accédez au dossier de l'application :
```bash
cd mobile
npm install
npx expo start --clear --port 8082
```
*Configurez l'adresse IP locale de votre machine dans [HomeScreen.js](mobile/screens/HomeScreen.js).*

### 5. Flashage de l'ESP32-CAM
Ouvrez le fichier [face_access_esp32.ino](esp32/face_access_esp32.ino) avec l'IDE Arduino.
1. Renseignez votre SSID et mot de passe Wi-Fi.
2. Indiquez l'adresse IP locale de votre ordinateur dans la variable `SERVER_IP`.
3. Téléversez le programme sur l'ESP32-CAM.

---

## 🚀 Lancement Rapide (Windows)

Double-cliquez sur le script à la racine :
```bash
start_project.bat
```
Ce script lancera MongoDB, le moteur de reconnaissance faciale Python, le serveur Node.js, le bundler Expo pour l'application mobile et ouvrira le dashboard Web dans votre navigateur.
