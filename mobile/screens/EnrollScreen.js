import React, { useRef, useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, Animated, Easing
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';
import { SERVER_URL } from './HomeScreen';

const STEPS = [
    { label: 'Regardez droit', hint: 'Centrez votre visage' },
    { label: 'Tournez à gauche', hint: 'Légèrement à gauche' },
    { label: 'Tournez à droite', hint: 'Légèrement à droite' },
    { label: 'Regardez en haut', hint: 'Levez légèrement le regard' },
    { label: 'Regardez en bas', hint: 'Baissez légèrement le regard' },
    { label: 'Souriez', hint: 'Expression naturelle' },
];
const PHOTOS_PER_STEP = 3;
const TOTAL_PHOTOS = STEPS.length * PHOTOS_PER_STEP;

const ROLES = ['client', 'staff', 'admin', 'livreur'];

export default function EnrollScreen({ navigation }) {
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef(null);
    const [name, setName] = useState('');
    const [role, setRole] = useState('client');
    const [phase, setPhase] = useState('form'); // form | scanning | uploading
    const [stepIdx, setStepIdx] = useState(0);
    const [photos, setPhotos] = useState([]);
    const [uploading, setUploading] = useState(false);

    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(rotateAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
        ).start();
    }, []);

    const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    async function startScan() {
        if (!name.trim()) { Alert.alert('Champ requis', 'Entrez un nom.'); return; }
        if (!permission?.granted) { await requestPermission(); return; }
        setPhotos([]);
        setStepIdx(0);
        setPhase('scanning');
        setTimeout(() => captureStep([], 0), 1000);
    }

    // Photos and stepIdx are passed as parameters to avoid stale closure bugs.
    // React state (setPhotos / setStepIdx) is only used to update the UI.
    async function captureStep(accPhotos, currentStep) {
        if (!cameraRef.current) return;
        const stepPhotos = [];
        for (let i = 0; i < PHOTOS_PER_STEP; i++) {
            try {
                const pic = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
                stepPhotos.push(pic.uri);
                if (i < PHOTOS_PER_STEP - 1) await delay(400);
            } catch (e) {
                console.warn('Capture error', e);
            }
        }
        const newPhotos = [...accPhotos, ...stepPhotos];
        setPhotos(newPhotos);

        const nextStep = currentStep + 1;
        if (nextStep < STEPS.length) {
            setStepIdx(nextStep);
            setTimeout(() => captureStep(newPhotos, nextStep), 1200);
        } else {
            await uploadPhotos(newPhotos);
        }
    }

    async function uploadPhotos(uris) {
        setPhase('uploading');
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('role', role);
            uris.forEach((uri, i) => {
                formData.append('photos', { uri, name: `photo_${i}.jpg`, type: 'image/jpeg' });
            });

            const resp = await axios.post(`${SERVER_URL}/api/enroll`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000
            });

            navigation.replace('Confirm', { name: name.trim(), role, personId: resp.data.personId, samplesUsed: resp.data.samplesUsed });
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            Alert.alert('Erreur', msg, [{ text: 'Réessayer', onPress: () => setPhase('form') }]);
        } finally {
            setUploading(false);
        }
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── Form phase ──────────────────────────────────────────────────────────
    if (phase === 'form') {
        return (
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>Informations de la personne</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Nom complet"
                    placeholderTextColor="#6b7280"
                    value={name}
                    onChangeText={setName}
                />

                <Text style={styles.label}>Rôle</Text>
                <View style={styles.roleRow}>
                    {ROLES.map(r => (
                        <TouchableOpacity
                            key={r}
                            style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                            onPress={() => setRole(r)}
                        >
                            <Text style={[styles.roleBtnText, role === r && styles.roleBtnTextActive]}>{r}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity style={styles.btnPrimary} onPress={startScan}>
                    <Text style={styles.btnPrimaryText}>Démarrer le scan facial</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Uploading phase ─────────────────────────────────────────────────────
    if (phase === 'uploading') {
        return (
            <View style={[styles.container, { justifyContent:'center', alignItems:'center' }]}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={[styles.label, { marginTop:16, textAlign:'center' }]}>
                    Encodage du visage...{'\n'}Cette opération peut prendre quelques secondes.
                </Text>
            </View>
        );
    }

    // ── Scanning phase ──────────────────────────────────────────────────────
    const step = STEPS[stepIdx];
    const progress = photos.length / TOTAL_PHOTOS;

    return (
        <View style={{ flex:1 }}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
            <View style={styles.overlay}>
                {/* Guide circle */}
                <View style={styles.guideOuter}>
                    <Animated.View style={[styles.guideRing, { transform: [{ rotate }] }]} />
                    <View style={styles.guideInner} />
                </View>

                {/* Step info */}
                <View style={styles.stepBox}>
                    <Text style={styles.stepLabel}>{step.label}</Text>
                    <Text style={styles.stepHint}>{step.hint}</Text>
                    <Text style={styles.stepCounter}>{`Étape ${stepIdx + 1} / ${STEPS.length}`}</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>{photos.length} / {TOTAL_PHOTOS} photos</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex:1, backgroundColor:'#111827', padding:24 },
    sectionTitle: { fontSize:18, fontWeight:'700', color:'#f9fafb', marginBottom:20 },
    label: { color:'#9ca3af', fontSize:13, marginBottom:8, marginTop:16 },
    input: {
        backgroundColor:'rgba(255,255,255,.08)', borderWidth:1, borderColor:'#374151',
        borderRadius:10, padding:14, color:'white', fontSize:16
    },
    roleRow: { flexDirection:'row', flexWrap:'wrap', gap:8 },
    roleBtn: { paddingHorizontal:14, paddingVertical:8, borderRadius:20, borderWidth:1, borderColor:'#374151' },
    roleBtnActive: { backgroundColor:'#2563eb', borderColor:'#2563eb' },
    roleBtnText: { color:'#9ca3af', fontSize:13 },
    roleBtnTextActive: { color:'white', fontWeight:'600' },
    btnPrimary: { marginTop:32, backgroundColor:'#2563eb', borderRadius:12, padding:16, alignItems:'center' },
    btnPrimaryText: { color:'white', fontSize:16, fontWeight:'700' },
    // Camera overlay
    overlay: { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
    guideOuter: { width:220, height:220, alignItems:'center', justifyContent:'center', marginBottom:30 },
    guideRing: {
        position:'absolute', width:220, height:220, borderRadius:110,
        borderWidth:3, borderColor:'#2563eb', borderStyle:'dashed',
        borderTopColor:'transparent'
    },
    guideInner: { width:180, height:240, borderRadius:90, borderWidth:2, borderColor:'rgba(255,255,255,.3)' },
    stepBox: {
        backgroundColor:'rgba(0,0,0,.6)', borderRadius:12, padding:16,
        alignItems:'center', marginBottom:20, width:'80%'
    },
    stepLabel: { color:'white', fontSize:20, fontWeight:'700', marginBottom:4 },
    stepHint: { color:'#9ca3af', fontSize:13 },
    stepCounter: { color:'#2563eb', fontSize:12, marginTop:6 },
    progressBar: { width:'80%', height:6, backgroundColor:'rgba(255,255,255,.2)', borderRadius:3, overflow:'hidden' },
    progressFill: { height:'100%', backgroundColor:'#10b981', borderRadius:3 },
    progressText: { color:'rgba(255,255,255,.7)', fontSize:12, marginTop:6 }
});
