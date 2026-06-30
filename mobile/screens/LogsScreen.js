import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, FlatList, StyleSheet, ActivityIndicator,
    TouchableOpacity, RefreshControl
} from 'react-native';
import axios from 'axios';
import { SERVER_URL } from './HomeScreen';

export default function LogsScreen() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => { fetchLogs(1, true); }, []);

    async function fetchLogs(p = 1, reset = false) {
        try {
            setError(null);
            const r = await axios.get(`${SERVER_URL}/api/logs?limit=30&page=${p}`, { timeout: 8000 });
            const newLogs = r.data.logs || [];
            setLogs(prev => reset ? newLogs : [...prev, ...newLogs]);
            setPage(p);
            setHasMore(p < (r.data.pages || 1));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    const onRefresh = useCallback(() => { setRefreshing(true); fetchLogs(1, true); }, []);
    const onEndReached = () => { if (hasMore && !loading) fetchLogs(page + 1); };

    function renderItem({ item }) {
        const dt = new Date(item.timestamp).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' });
        return (
            <View style={[styles.item, item.authorized ? styles.itemOk : styles.itemKo]}>
                <Text style={styles.itemIcon}>{item.authorized ? '✅' : '❌'}</Text>
                <View style={{ flex:1 }}>
                    <Text style={styles.itemName}>{item.personName}</Text>
                    <Text style={styles.itemTime}>{dt}</Text>
                </View>
                {item.confidence > 0 && (
                    <Text style={styles.itemConf}>{(item.confidence * 100).toFixed(0)}%</Text>
                )}
            </View>
        );
    }

    if (loading) return (
        <View style={[styles.container, { justifyContent:'center', alignItems:'center' }]}>
            <ActivityIndicator size="large" color="#2563eb" />
        </View>
    );

    if (error) return (
        <View style={[styles.container, { justifyContent:'center', alignItems:'center' }]}>
            <Text style={styles.errorText}>Erreur: {error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchLogs(1, true); }}>
                <Text style={{ color:'white' }}>Réessayer</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={logs}
                keyExtractor={item => item._id?.toString() || Math.random().toString()}
                renderItem={renderItem}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={<Text style={styles.empty}>Aucun accès enregistré.</Text>}
                ListFooterComponent={hasMore ? <ActivityIndicator color="#2563eb" style={{ padding:16 }} /> : null}
                contentContainerStyle={{ padding:16 }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex:1, backgroundColor:'#111827' },
    item: { flexDirection:'row', alignItems:'center', padding:14, borderRadius:12, marginBottom:10, borderWidth:1 },
    itemOk: { backgroundColor:'rgba(16,185,129,.08)', borderColor:'rgba(16,185,129,.2)' },
    itemKo: { backgroundColor:'rgba(239,68,68,.08)', borderColor:'rgba(239,68,68,.2)' },
    itemIcon: { fontSize:22, marginRight:12 },
    itemName: { color:'#f9fafb', fontSize:15, fontWeight:'600' },
    itemTime: { color:'#9ca3af', fontSize:12, marginTop:2 },
    itemConf: { color:'#6b7280', fontSize:13 },
    empty: { color:'#9ca3af', textAlign:'center', marginTop:60, fontSize:15 },
    errorText: { color:'#ef4444', marginBottom:16 },
    retryBtn: { backgroundColor:'#2563eb', paddingHorizontal:20, paddingVertical:10, borderRadius:8 }
});
