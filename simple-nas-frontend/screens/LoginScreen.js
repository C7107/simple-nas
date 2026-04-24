import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { getBaseUrl, saveBaseUrl, saveToken } from '../utils/auth';

export default function LoginScreen({ navigation }) {
  const [ipAddress, setIpAddress] = useState('');
  const [username, setUsername] = useState('zzmzsa'); 
  const [password, setPassword] = useState('123');   
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadIp = async () => {
      const savedIp = await getBaseUrl();
      // 如果没存过，给个你现在的默认提示
      setIpAddress(savedIp && savedIp !== 'http://192.168.' ? savedIp : 'http://10.136.181.74:8080');
    };
    loadIp();
  }, []);

  // 真正的带超时的网络请求封装
  const fetchWithTimeout = async (url, options = {}, timeout = 3000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  // 测试连接
  const testConnection = async () => {
    if (!ipAddress) return Alert.alert('错误', '请输入后端 IP 地址');
    // 去除结尾多余的斜杠
    const cleanIp = ipAddress.trim().replace(/\/$/, '');
    
    setLoading(true);
    try {
      await saveBaseUrl(cleanIp); 
      // 使用 3 秒超时的 fetch
      const response = await fetchWithTimeout(`${cleanIp}/api/ping`);
      const resData = await response.json();
      
      if (resData.code === 200) {
        Alert.alert('成功', '✅ 成功连接到你的 NAS后端！');
      } else {
        Alert.alert('失败', '连接后端失败，返回值不对');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        Alert.alert('连接超时', '请求超时！请检查：\n1. IP格式是否为 http://ip:8080\n2. 电脑防火墙是否已关闭\n3. 后端 go run main.go 是否在运行');
      } else {
        Alert.alert('网络错误', '无法连接！请确保电脑防火墙已关闭，且 IP 填写正确。');
      }
    } finally {
      setLoading(false); // 无论成功失败，必须停止转圈
    }
  };

  // 登录逻辑
  const handleLogin = async () => {
    if (!ipAddress) return Alert.alert('错误', '请输入后端 IP 地址');
    const cleanIp = ipAddress.trim().replace(/\/$/, '');

    setLoading(true);
    try {
      await saveBaseUrl(cleanIp);
      const response = await fetchWithTimeout(`${cleanIp}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }, 3000);
      
      const resData = await response.json();
      
      if (resData.code === 200) {
        await saveToken(resData.data.token);
        navigation.replace('Main'); 
      } else {
        Alert.alert('登录失败', resData.msg || '账号或密码错误');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        Alert.alert('连接超时', '请求超时，请先点测试连接看看通不通');
      } else {
        Alert.alert('网络错误', '请求失败，请确保电脑防火墙已关闭');
      }
    } finally {
      setLoading(false); // 停止转圈
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>我的简易 NAS</Text>

      <View style={styles.card}>
        <Text style={styles.label}>1. 后端地址 (必须带 http:// 和 :8080):</Text>
        <TextInput
          style={styles.input}
          value={ipAddress}
          onChangeText={setIpAddress}
          placeholder="http://10.136.181.74:8080"
          keyboardType="url"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.testBtn} onPress={testConnection} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.testBtnText}>测试连接</Text>}
        </TouchableOpacity>

        <Text style={styles.label}>2. 账号密码:</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="账号"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="密码"
          secureTextEntry
        />

        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>登 录 并 进 入</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#333' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  label: { fontSize: 14, color: '#666', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 16 },
  testBtn: { backgroundColor: '#f0ad4e', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  testBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  loginBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  loginBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});