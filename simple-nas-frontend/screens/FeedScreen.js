import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, Dimensions, ActivityIndicator, Text, TouchableWithoutFeedback, TouchableOpacity, Image } from 'react-native';
import { Video, ResizeMode, VideoFullscreenUpdate } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { getBaseUrl, getToken } from '../utils/auth';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

// ==========================================
// 单个视频组件
// ==========================================
// 【新增】：传入 isNear 参数，代表这个视频是否在“可视范围周边”
const FeedVideoItem = ({ item, isActive, isNear, authData }) => {
  const videoRef = useRef(null);
  const [status, setStatus] = useState({});
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isVideoLandscape, setIsVideoLandscape] = useState(false);

  useEffect(() => {
    if (!isActive) setIsManuallyPaused(false);
  }, [isActive]);

  const shouldPlay = isActive && !isManuallyPaused && !isDragging;

  const togglePlayPause = () => setIsManuallyPaused(!isManuallyPaused);

  const onReadyForDisplay = (event) => {
    const { width, height } = event.naturalSize;
    setIsVideoLandscape(width > height);
  };

  const onFullscreenUpdate = async (event) => {
    const { fullscreenUpdate } = event;
    switch (fullscreenUpdate) {
      case VideoFullscreenUpdate.PLAYER_WILL_PRESENT:
        if (isVideoLandscape) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        else await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        break;
      case VideoFullscreenUpdate.PLAYER_DID_DISMISS:
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        break;
    }
  };

  const enterFullscreen = () => {
    if (videoRef.current) videoRef.current.presentFullscreenPlayer();
  };

  const onSlidingStart = () => setIsDragging(true);

  const onSlidingComplete = async (value) => {
    if (videoRef.current && status.durationMillis) {
      const targetPosition = value * status.durationMillis;
      await videoRef.current.setPositionAsync(targetPosition);
    }
    setIsDragging(false);
  };

  const currentProgress = (status.positionMillis && status.durationMillis) 
    ? status.positionMillis / status.durationMillis 
    : 0;

  const fullVideoUrl = `${authData.baseUrl}${item.url}?token=${authData.token}`;
  const thumbUrl = item.thumb_url ? `${authData.baseUrl}${item.thumb_url}?token=${authData.token}` : null;

  return (
    <View style={styles.videoContainer}>
      <TouchableWithoutFeedback onPress={togglePlayPause}>
        <View style={styles.videoWrapper}>
          
          {/* 【防闪退核心逻辑】：只有在周边 (isNear) 才加载真正的 Video 组件，否则只显示一张封面图！ */}
          {isNear ? (
            <Video
              ref={videoRef}
              source={{ uri: fullVideoUrl }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={shouldPlay}
              isLooping
              useNativeControls={false} 
              onPlaybackStatusUpdate={s => { if (!isDragging) setStatus(() => s); }} 
              onReadyForDisplay={onReadyForDisplay} 
              onFullscreenUpdate={onFullscreenUpdate} 
            />
          ) : (
            // 距离太远的视频被卸载，用封面图占位，彻底释放硬件内存！
            <Image 
              source={{ uri: thumbUrl || 'https://via.placeholder.com/300?text=Unloading' }} 
              style={styles.video} 
              resizeMode="contain" 
            />
          )}

          {!shouldPlay && !isDragging && (
            <View style={styles.centerPlayIcon}>
              <Ionicons name="play" size={80} color="rgba(255,255,255,0.7)" />
            </View>
          )}

          <View style={styles.infoBox}>
            {isNear && (
              <TouchableOpacity style={styles.fullscreenBtn} onPress={enterFullscreen}>
                <Ionicons name="expand" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>

      <View style={styles.sliderContainer}>
        <Slider
          style={{ width: screenWidth, height: 20 }}
          minimumValue={0} maximumValue={1} value={currentProgress}
          minimumTrackTintColor="#FFFFFF" maximumTrackTintColor="rgba(255,255,255,0.3)" thumbTintColor="#FFFFFF" 
          onSlidingStart={onSlidingStart} onSlidingComplete={onSlidingComplete}
        />
      </View>
    </View>
  );
};

// ==========================================
// 主页面
// ==========================================
export default function FeedScreen() {
  const [videos, setVideos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [authData, setAuthData] = useState({ baseUrl: '', token: '' });
  
  const isFocused = useIsFocused();

  useEffect(() => { loadMoreVideos(true); }, []);

  const loadMoreVideos = async (isFirstLoad = false) => {
    if (isLoading || isEnded) return;
    setIsLoading(true);
    try {
      const baseUrl = await getBaseUrl();
      const token = await getToken();
      if (isFirstLoad) setAuthData({ baseUrl, token });

      const response = await fetch(`${baseUrl}/api/videos/feed?size=3`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();

      if (resData.code === 200) {
        if (resData.data && resData.data.length > 0) {
          setVideos(prev => isFirstLoad ? resData.data : [...prev, ...resData.data]);
        } else {
          setIsEnded(true);
        }
      }
    } catch (error) {
      console.log('拉取视频流失败', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderItem = ({ item, index }) => {
    const isActive = index === currentIndex && isFocused;
    // 【防闪退核心逻辑】：只允许 当前视频、上一个视频、下一个视频 这3个位置保留视频组件
    const isNear = Math.abs(index - currentIndex) <= 1;

    return (
      <FeedVideoItem 
        item={item} 
        isActive={isActive} 
        isNear={isNear} // 传给子组件判定是否挂载 <Video>
        authData={authData} 
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={videos}
        keyExtractor={(item, index) => item.id.toString() + index}
        renderItem={renderItem}
        pagingEnabled={true} 
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() => loadMoreVideos(false)}
        onEndReachedThreshold={0.5}
        
        // 【内存优化 3 大神器】
        windowSize={3} // 严格限制 FlatList 渲染的窗口大小
        initialNumToRender={1} // 初始只渲染 1 个
        maxToRenderPerBatch={1} // 每次只加载 1 个
        removeClippedSubviews={true} // 强制卸载屏幕外的视图 (Android 尤为有效)

        ListFooterComponent={
          <View style={styles.footer}>
            {isLoading && <ActivityIndicator size="large" color="#fff" />}
            {isEnded && <Text style={styles.endText}>—— 所有的视频都刷完啦，等待新征程！ ——</Text>}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoContainer: { height: screenHeight - 53, width: screenWidth, backgroundColor: '#000'},
  videoWrapper: { flex: 1, position: 'relative', marginTop: 50,},
  video: { width: '100%', height: '100%' },
  centerPlayIcon: { position: 'absolute', top: '40%', left: '40%', justifyContent: 'center', alignItems: 'center' },
  infoBox: { position: 'absolute', bottom: 20, right: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3, flex: 1, marginRight: 20 },
  fullscreenBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  sliderContainer: { 
  position: 'absolute',
  bottom: 10, // 👈 控制位置
  width: '100%',
  height: 20,
  backgroundColor: 'transparent', // 👈 关键
},
  footer: { height: 100, justifyContent: 'center', alignItems: 'center' },
  endText: { color: '#888', fontSize: 14 }
});