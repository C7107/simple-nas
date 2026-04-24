import AsyncStorage from '@react-native-async-storage/async-storage';

// 存取后端 IP
export const saveBaseUrl = async (url) => {
  // 确保 url 结尾没有斜杠
  const cleanUrl = url.replace(/\/$/, '');
  await AsyncStorage.setItem('BASE_URL', cleanUrl);
};

export const getBaseUrl = async () => {
  const url = await AsyncStorage.getItem('BASE_URL');
  return url || 'http://192.168.'; // 给个默认提示
};

// 存取 Token
export const saveToken = async (token) => {
  await AsyncStorage.setItem('USER_TOKEN', token);
};

export const getToken = async () => {
  return await AsyncStorage.getItem('USER_TOKEN');
};

// 退出登录清除 Token
export const clearAuth = async () => {
  await AsyncStorage.removeItem('USER_TOKEN');
};