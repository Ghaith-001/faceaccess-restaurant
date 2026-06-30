import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';

// Change this to your PC's local IP
export const SERVER_URL = 'http://192.168.100.205:3000';

export default function HomeScreen({ navigation }) {
    const [serverStatus, setServerStatus] = useState('checking');

    useEffect(() => {
        checkServer();
        const interval = setInterval(checkServer, 10000);
        return () => clearInterval(interval);
    }, []);

    async function checkServer() {
        try {
            await axios.get(`${SERVER_URL}/health`, { timeout: 3000 });
            setServerStatus('online');
        } catch {
            setServerStatus('offline');
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.emoji}>🍽️</Text>
            <Text style={styles.title}>FaceAccess</Text>
            <Text style={styles.subtitle}>Contrôle d'accès restaurant</Text>

            <View style={[styles.statusBadge, serverStatus === 'online' ? styles.online : styles.offline]}>
                <View style={[styles.dot, serverStatus === 'online' ? styles.dotGreen : styles.dotRed]} />
                <Text style={styles.statusText}>
                    {serverStatus === 'checking' ? 'Vérification...' : serverStatus === 'online' ? 'Serveur en ligne' : 'Serveur hors ligne'}
                </Text>
            </View>

            <TouchableOpacity
                style={[styles.card, styles.cardBlue]}
                onPress={() => {
                    if (serverStatus !== 'online') {
                        Alert.alert('Serveur hors ligne', 'Vérifiez la connexion au serveur.');
                        return;
                    }
                    navigation.navigate('Enroll');
                }}
            >
                <Text style={styles.cardIcon}>👤</Text>
                <Text style={styles.cardTitle}>Enregistrer un visage</Text>
                <Text style={styles.cardDesc}>Scanner le visage d'une nouvelle personne</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.card, styles.cardDark]}
                onPress={() => navigation.navigate('Logs')}
            >
                <Text style={styles.cardIcon}>📋</Text>
                <Text style={styles.cardTitle}>Journal d'accès</Text>
                <Text style={styles.cardDesc}>Voir les derniers accès en temps réel</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex:1, backgroundColor:'#111827', padding:24, alignItems:'center', justifyContent:'center' },
    emoji: { fontSize:60, marginBottom:12 },
    title: { fontSize:28, fontWeight:'800', color:'#f9fafb', marginBottom:4 },
    subtitle: { fontSize:14, color:'#9ca3af', marginBottom:24 },
    statusBadge: { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:16, paddingVertical:8, borderRadius:20, marginBottom:32 },
    online: { backgroundColor:'rgba(16,185,129,.15)' },
    offline: { backgroundColor:'rgba(239,68,68,.15)' },
    dot: { width:8, height:8, borderRadius:4 },
    dotGreen: { backgroundColor:'#10b981' },
    dotRed: { backgroundColor:'#ef4444' },
    statusText: { color:'#d1d5db', fontSize:13 },
    card: { width:'100%', borderRadius:16, padding:20, marginBottom:16 },
    cardBlue: { backgroundColor:'#2563eb' },
    cardDark: { backgroundColor:'#1f2937', borderWidth:1, borderColor:'#374151' },
    cardIcon: { fontSize:32, marginBottom:10 },
    cardTitle: { fontSize:18, fontWeight:'700', color:'white', marginBottom:4 },
    cardDesc: { fontSize:13, color:'rgba(255,255,255,.7)' }
});
