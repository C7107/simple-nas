import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons'; // Expo 自带的图标库

// 导入页面
import LoginScreen from './screens/LoginScreen';
import GalleryScreen from './screens/GalleryScreen';
import UploadScreen from './screens/UploadScreen';
import VideoPlayerScreen from './screens/VideoPlayerScreen';
import ClassicScreen from './screens/ClassicScreen';
import FeedScreen from './screens/FeedScreen';
import FolderScreen from './screens/FolderScreen';
import FileViewerScreen from './screens/FileViewerScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// 底部 Tab 导航
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Gallery') iconName = 'images';
          else if (route.name === 'Classic') iconName = 'star';
          else if (route.name === 'Upload') iconName = 'cloud-upload';
          else if (route.name === 'Feed') iconName = 'play-circle';
          else if (route.name === 'Folder') iconName = 'folder'; // 【新增：文件夹图标】
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen
        name="Gallery"
        component={GalleryScreen}
        options={{ title: '我的相册', headerStyle: { backgroundColor: '#fff' } }}
      />

            {/* ===== 【新增：相册精典页面】 ===== */}
      <Tab.Screen
        name="Classic"
        component={ClassicScreen}
        options={{ title: '精典相册', headerStyle: { backgroundColor: '#fff' } }}
      />

            {/* ===== 【新增：刷视频页面】 ===== */}
      <Tab.Screen 
        name="Feed" 
        component={FeedScreen} 
        options={{ 
          title: '刷视频', 
          headerShown: false, // 隐藏顶部导航，像抖音一样全屏沉浸
          tabBarStyle: { backgroundColor: '#000' }, // 切到这个页面时，底部导航变成纯黑
          tabBarActiveTintColor: '#fff', 
        }} 
      />

            {/* ===== 【新增：文件管理系统 Tab】 ===== */}
      <Tab.Screen 
        name="Folder" 
        component={FolderScreen} 
        options={{ 
          title: '文件管理', 
          headerShown: false // 因为我们在页面内部自定义了好看的 Header，所以这里把原生的隐藏掉
        }} 
      />

      <Tab.Screen 
        name="Upload" 
        component={UploadScreen} 
        options={{ title: '上传文件' }} 
      />
    </Tab.Navigator>
  );
}

// 根导航器
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        
        {/* 主界面 (底部导航) */}
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        
        {/* 视频播放器页 (覆盖在主界面之上的 Stack) */}
        <Stack.Screen
          name="VideoPlayer"
          component={VideoPlayerScreen}
          options={({ route }) => ({
            title: route.params.title || '视频播放',
            headerStyle: { backgroundColor: '#000' },
            headerTintColor: '#fff',
            headerBackTitle: '返回'
          })}
        />

        {/* 文本/HTML 文件查看器 */}
        <Stack.Screen
          name="FileViewer"
          component={FileViewerScreen}
          options={({ route }) => ({
            title: route.params.title || '文件浏览',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#007AFF',
            headerBackTitle: '返回'
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}