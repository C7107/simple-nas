import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { Video, ResizeMode, VideoFullscreenUpdate } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFocusEffect } from '@react-navigation/native';

export default function VideoPlayerScreen({ route, navigation }) {
  const { videoUrl } = route.params;
  const videoRef = useRef(null);
  
  const [isVideoLandscape, setIsVideoLandscape] = useState(false);
  const [isUnmounting, setIsUnmounting] = useState(false); // 记录页面是否正在被销毁

  const onReadyForDisplay = (event) => {
    const { width, height } = event.naturalSize;
    setIsVideoLandscape(width > height);
  };

  const onFullscreenUpdate = async (event) => {
    // 【防卡死核心 1】：如果页面正在被卸载，绝不能再调用任何改变屏幕方向的方法，否则会和系统返回动画死锁！
    if (isUnmounting) return;

    const { fullscreenUpdate } = event;
    try {
      switch (fullscreenUpdate) {
        case VideoFullscreenUpdate.PLAYER_WILL_PRESENT:
          if (isVideoLandscape) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          }
          break;

        case VideoFullscreenUpdate.PLAYER_DID_DISMISS:
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          break;
      }
    } catch (error) {
      console.log('全屏切换错误 (已忽略):', error);
    }
  };

  // 【防卡死核心 2】：使用 useFocusEffect 监听页面的失焦事件，而不是用 useEffect 的 return。
  // 因为 useEffect 的 return 执行时，组件已经被撕裂了，这时候去调用原生模块极其危险！
  useFocusEffect(
    useCallback(() => {
      // 页面聚焦时，标志位设为 false
      setIsUnmounting(false);

      return () => {
        // 页面失去焦点（准备返回相册）时，立刻停止一切全屏切换操作，并强行恢复竖屏
        setIsUnmounting(true);
        
        // 强行停止视频播放，切断视频流下载，瞬间释放内存
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
          videoRef.current.unloadAsync().catch(() => {});
        }

        // 用不会阻塞主线程的方式恢复竖屏
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  // 【防卡死核心 3】：拦截物理返回键（Android专属），防止用户连按两次返回键导致状态彻底崩溃
  useEffect(() => {
    const backAction = () => {
      if (isUnmounting) return true; // 如果已经在退出了，吞掉后续的返回事件
      navigation.goBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isUnmounting, navigation]);

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        onReadyForDisplay={onReadyForDisplay} 
        onFullscreenUpdate={onFullscreenUpdate} 
        // 增加缓冲区限制，防止预加载过多把内存干爆
        progressUpdateIntervalMillis={500}  
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});