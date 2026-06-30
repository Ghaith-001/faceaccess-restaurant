import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ConfirmScreen({ route, navigation }) {
    const { name, role, samplesUsed } = route.params || {};

    return (
        <View style={styles.container}>
            <Text style={styles.icon}>✅</Text>
            <Text style={styles.title}>Enregistrement réussi !</Text>
            <Text style={styles.name}>{name}</Text>

            <View style={styles.card}>
                <Row label="Rôle" value={role} />
                <Row label="Photos utilisées" value={`${samplesUsed} échantillons`} />
                <Row label="Statut" value="Actif" green />
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('Enroll')}>
                <Text style={styles.btnText}>Enregistrer une autre personne</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSecondary} onPress={() => navigation.navigate('Home')}>
                <Text style={styles.btnSecText}>Retour à l'accueil</Text>
            </TouchableOpacity>
        </View>
    );
}

function Row({ label, value, green }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={[styles.rowValue, green && { color: '#10b981' }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex:1, backgroundColor:'#111827', padding:24, alignItems:'center', justifyContent:'center' },
    icon: { fontSize:72, marginBottom:16 },
    title: { fontSize:24, fontWeight:'800', color:'#f9fafb', marginBottom:8 },
    name: { fontSize:18, color:'#60a5fa', marginBottom:24 },
    card: { width:'100%', backgroundColor:'#1f2937', borderRadius:12, padding:20, marginBottom:24, borderWidth:1, borderColor:'#374151' },
    row: { flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#374151' },
    rowLabel: { color:'#9ca3af', fontSize:14 },
    rowValue: { color:'#f9fafb', fontSize:14, fontWeight:'600' },
    btnPrimary: { width:'100%', backgroundColor:'#2563eb', borderRadius:12, padding:16, alignItems:'center', marginBottom:12 },
    btnText: { color:'white', fontSize:16, fontWeight:'700' },
    btnSecondary: { width:'100%', borderRadius:12, padding:16, alignItems:'center', borderWidth:1, borderColor:'#374151' },
    btnSecText: { color:'#9ca3af', fontSize:15 }
});
