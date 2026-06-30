import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import EnrollScreen from './screens/EnrollScreen';
import ConfirmScreen from './screens/ConfirmScreen';
import LogsScreen from './screens/LogsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Home"
                screenOptions={{
                    headerStyle: { backgroundColor: '#111827' },
                    headerTintColor: '#f9fafb',
                    headerTitleStyle: { fontWeight: '700' },
                    contentStyle: { backgroundColor: '#111827' }
                }}
            >
                <Stack.Screen name="Home"    component={HomeScreen}    options={{ title: 'FaceAccess Restaurant' }} />
                <Stack.Screen name="Enroll"  component={EnrollScreen}  options={{ title: 'Enregistrer un visage', headerBackVisible: true }} />
                <Stack.Screen name="Confirm" component={ConfirmScreen} options={{ title: 'Enregistrement réussi', headerBackVisible: false }} />
                <Stack.Screen name="Logs"    component={LogsScreen}    options={{ title: 'Journal d\'accès' }} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
