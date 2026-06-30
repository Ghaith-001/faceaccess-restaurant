#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── WiFi ───────────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "VOTRE_SSID";
const char* WIFI_PASSWORD = "VOTRE_MOT_DE_PASSE";

// ── Server ─────────────────────────────────────────────────────────────────────
const char* SERVER_IP   = "192.168.1.50";   // IP locale du PC
const int   SERVER_PORT = 3000;
// Endpoint complet: http://<SERVER_IP>:<SERVER_PORT>/api/recognize

// ── GPIO ───────────────────────────────────────────────────────────────────────
#define PIN_RELAY    12   // Commande serrure électrique (HIGH = ouvert)
#define PIN_LED_OK   13   // LED verte
#define PIN_LED_NOK  14   // LED rouge
#define PIN_BUZZER   15   // Buzzer actif

// ── Timing ────────────────────────────────────────────────────────────────────
const unsigned long CAPTURE_INTERVAL_MS = 2000;   // Délai entre captures
const unsigned long RELAY_OPEN_MS       = 3000;   // Durée d'ouverture de la serrure
const unsigned long BUZZER_DURATION_MS  = 800;

// ── Camera config (AI Thinker ESP32-CAM) ─────────────────────────────────────
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

unsigned long lastCapture = 0;

// ─────────────────────────────────────────────────────────────────────────────
void initCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sscb_sda = SIOD_GPIO_NUM;
    config.pin_sscb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size   = FRAMESIZE_VGA;   // 640x480
    config.jpeg_quality = 12;
    config.fb_count     = 1;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Init failed: 0x%x\n", err);
        while (true) delay(1000);
    }
    Serial.println("[CAM] Initialisée");
}

void connectWiFi() {
    Serial.printf("[WiFi] Connexion à %s", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 30) {
        delay(500);
        Serial.print(".");
        tries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] Connecté, IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] Échec — redémarrage");
        ESP.restart();
    }
}

// Retourne: 0 = erreur réseau/serveur, 1 = refusé, 2 = autorisé
int captureAndRecognize() {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[CAM] Capture échouée");
        return 0;
    }

    String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/recognize";
    HTTPClient http;
    http.begin(url);
    http.setTimeout(10000);

    // MAC address header pour identifier l'ESP32
    String mac = WiFi.macAddress();
    http.addHeader("X-ESP-MAC", mac);

    // Boundary multipart
    String boundary = "ESP32CAMBoundary";
    http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

    String bodyStart = "--" + boundary + "\r\n"
                     + "Content-Disposition: form-data; name=\"image\"; filename=\"capture.jpg\"\r\n"
                     + "Content-Type: image/jpeg\r\n\r\n";
    String bodyEnd = "\r\n--" + boundary + "--\r\n";

    int totalLen = bodyStart.length() + fb->len + bodyEnd.length();
    uint8_t* payload = (uint8_t*)malloc(totalLen);
    if (!payload) {
        esp_camera_fb_return(fb);
        return 0;
    }
    memcpy(payload, bodyStart.c_str(), bodyStart.length());
    memcpy(payload + bodyStart.length(), fb->buf, fb->len);
    memcpy(payload + bodyStart.length() + fb->len, bodyEnd.c_str(), bodyEnd.length());
    esp_camera_fb_return(fb);

    int httpCode = http.POST(payload, totalLen);
    free(payload);

    int result = 0; // 0 = erreur réseau
    if (httpCode == HTTP_CODE_OK) {
        String resp = http.getString();
        Serial.printf("[HTTP] Réponse: %s\n", resp.c_str());

        StaticJsonDocument<256> doc;
        if (!deserializeJson(doc, resp)) {
            bool authorized = doc["authorized"] | false;
            const char* person = doc["person"] | "INCONNU";
            float conf = doc["confidence"] | 0.0f;
            Serial.printf("[ACCESS] %s — %s (%.0f%%)\n",
                authorized ? "AUTORISÉ" : "REFUSÉ", person, conf * 100);
            result = authorized ? 2 : 1;
        }
    } else {
        Serial.printf("[HTTP] Erreur serveur: %d\n", httpCode);
    }

    http.end();
    return result;
}

void grantAccess() {
    Serial.println("[ACCESS] Accès accordé — ouverture serrure");
    digitalWrite(PIN_RELAY, HIGH);
    digitalWrite(PIN_LED_OK, HIGH);
    delay(RELAY_OPEN_MS);
    digitalWrite(PIN_RELAY, LOW);
    digitalWrite(PIN_LED_OK, LOW);
}

void denyAccess() {
    Serial.println("[ACCESS] Accès refusé");
    digitalWrite(PIN_LED_NOK, HIGH);
    // 2 bips courts avec durée depuis la constante
    for (int i = 0; i < 2; i++) {
        digitalWrite(PIN_BUZZER, HIGH);
        delay(BUZZER_DURATION_MS / 2);
        digitalWrite(PIN_BUZZER, LOW);
        delay(BUZZER_DURATION_MS / 2 - 50);
    }
    digitalWrite(PIN_LED_NOK, LOW);
}

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    Serial.println("\n[BOOT] FaceAccess ESP32-CAM v1.0");

    pinMode(PIN_RELAY,   OUTPUT); digitalWrite(PIN_RELAY,   LOW);
    pinMode(PIN_LED_OK,  OUTPUT); digitalWrite(PIN_LED_OK,  LOW);
    pinMode(PIN_LED_NOK, OUTPUT); digitalWrite(PIN_LED_NOK, LOW);
    pinMode(PIN_BUZZER,  OUTPUT); digitalWrite(PIN_BUZZER,  LOW);

    // Startup blink
    for (int i = 0; i < 3; i++) {
        digitalWrite(PIN_LED_OK, HIGH); delay(100);
        digitalWrite(PIN_LED_OK, LOW);  delay(100);
    }

    initCamera();
    connectWiFi();

    Serial.printf("[READY] Envoi vers http://%s:%d/api/recognize\n", SERVER_IP, SERVER_PORT);
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Reconnexion...");
        connectWiFi();
    }

    unsigned long now = millis();
    if (now - lastCapture >= CAPTURE_INTERVAL_MS) {
        lastCapture = now;
        int result = captureAndRecognize();
        if (result == 2)      grantAccess();
        else if (result == 1) denyAccess();
        // result == 0 : erreur réseau — on ignore silencieusement
    }
}
