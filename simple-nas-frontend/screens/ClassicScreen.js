import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  View, StyleSheet, FlatList, Image, TouchableOpacity,
  Dimensions, ActivityIndicator, Text, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ImageView from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { getBaseUrl, getToken } from '../utils/auth';

const screenWidth = Dimensions.get('window').width;
const itemSize = screenWidth / 4 - 2;

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
};

const ClassicItem = memo(({
  item,
  authData,
  isSelectMode,
  selectedIdsSet,
  onItemPress,
  onItemLongPress,
}) => {
  const isVideo = item.file_type === 'video';
  const isSelected = selectedIdsSet.has(item.id);
  const thumbPath = item.thumb_url || item.url;
  const imageUrl = thumbPath
    ? `${authData.baseUrl}${thumbPath}?token=${authData.token}`
    : 'https://via.placeholder.com/150';

  return (
    <TouchableOpacity
      style={styles.itemContainer}
      activeOpacity={0.8}
      onPress={() => onItemPress(item)}
      onLongPress={() => onItemLongPress(item)}
    >
      <Image
        source={{ uri: imageUrl }}
        style={[styles.image, isSelected && styles.selectedImage]}
        resizeMode="cover"
      />

      {isVideo && !isSelectMode && (
        <View style={styles.playIconContainer}>
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}

      {isSelectMode && (
        <View style={styles.checkboxContainer}>
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
          ) : (
            <Ionicons name="ellipse-outline" size={24} color="rgba(255,255,255,0.8)" />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.size === nextProps.item.size &&
    prevProps.item.file_type === nextProps.item.file_type &&
    prevProps.item.thumb_url === nextProps.item.thumb_url &&
    prevProps.item.url === nextProps.item.url &&
    prevProps.authData.baseUrl === nextProps.authData.baseUrl &&
    prevProps.authData.token === nextProps.authData.token &&
    prevProps.isSelectMode === nextProps.isSelectMode &&
    prevProps.selectedIdsSet === nextProps.selectedIdsSet
  );
});

export default function ClassicScreen({ navigation }) {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authData, setAuthData] = useState({ baseUrl: '', token: '' });

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [folders, setFolders] = useState([]);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [downloadingText, setDownloadingText] = useState('');

  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const fetchClassic = useCallback(async () => {
    setLoading(true);
    try {
      const baseUrl = await getBaseUrl();
      const token = await getToken();
      setAuthData({ baseUrl, token });
      const response = await fetch(`${baseUrl}/api/files/classic`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const resData = await response.json();
      if (resData.code === 200) setMediaList(resData.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds([]);
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch(`${authData.baseUrl}/api/folders`, {
        headers: { Authorization: `Bearer ${authData.token}` },
      });
      const resData = await response.json();
      if (resData.code === 200) setFolders(resData.data || []);
    } catch (error) {}
  }, [authData.baseUrl, authData.token]);

  useEffect(() => {
    fetchClassic();
  }, []); // 只在首次挂载时刷新，切tab不重复请求

  useFocusEffect(
    useCallback(() => {
      return () => exitSelectMode(); // 切走时退出多选模式
    }, [exitSelectMode])
  );

  const imagesForViewer = useMemo(
    () =>
      mediaList
        .filter((item) => item.file_type === 'image')
        .map((item) => ({
          uri: `${authData.baseUrl}${item.url}?token=${authData.token}`,
        })),
    [mediaList, authData]
  );

  const findImageIndex = useCallback(
    (itemId) => {
      const imgList = mediaList.filter((m) => m.file_type === 'image');
      return imgList.findIndex((m) => m.id === itemId);
    },
    [mediaList]
  );

  const handleItemPress = useCallback(
    (item) => {
      if (isSelectMode) {
        setSelectedIds((prev) =>
          prev.includes(item.id)
            ? prev.filter((id) => id !== item.id)
            : [...prev, item.id]
        );
      } else {
        if (item.file_type === 'video') {
          navigation.navigate('VideoPlayer', {
            videoUrl: `${authData.baseUrl}${item.url}?token=${authData.token}`,
            title: item.original_name,
          });
        } else {
          const index = findImageIndex(item.id);
          setCurrentImageIndex(index !== -1 ? index : 0);
          setIsViewerVisible(true);
        }
      }
    },
    [isSelectMode, navigation, authData, findImageIndex]
  );

  const handleItemLongPress = useCallback(
    (item) => {
      if (!isSelectMode) {
        setIsSelectMode(true);
        setSelectedIds([item.id]);
      }
    },
    [isSelectMode]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <ClassicItem
        item={item}
        authData={authData}
        isSelectMode={isSelectMode}
        selectedIdsSet={selectedIdsSet}
        onItemPress={handleItemPress}
        onItemLongPress={handleItemLongPress}
      />
    ),
    [authData, isSelectMode, selectedIdsSet, handleItemPress, handleItemLongPress]
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    Alert.alert('确认删除', `确定要把这 ${selectedIds.length} 个文件移至回收站吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await Promise.all(
              selectedIds.map((id) =>
                fetch(`${authData.baseUrl}/api/file/${id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${authData.token}` },
                })
              )
            );
            await fetchClassic();
            exitSelectMode();
          } catch (error) {
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [selectedIds, authData, fetchClassic, exitSelectMode]);

  const handleSaveSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert('无权限', '请允许访问相册。');
    setLoading(true);
    setDownloadingText(`准备保存 ${selectedIds.length} 个文件...`);
    try {
      const selectedFiles = mediaList.filter((item) =>
        selectedIds.includes(item.id)
      );
      let successCount = 0;
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setDownloadingText(`正在保存 (${i + 1}/${selectedFiles.length})...`);
        const { uri } = await FileSystem.downloadAsync(
          `${authData.baseUrl}${file.url}?token=${authData.token}`,
          FileSystem.documentDirectory + file.original_name
        );
        await MediaLibrary.saveToLibraryAsync(uri);
        await FileSystem.deleteAsync(uri, { idempotent: true });
        successCount++;
      }
      Alert.alert('保存完毕', `成功将 ${successCount} 个文件保存到手机！`);
      exitSelectMode();
    } catch (error) {
    } finally {
      setLoading(false);
      setDownloadingText('');
    }
  }, [selectedIds, mediaList, authData, exitSelectMode]);

  const handleMoveFiles = useCallback(
    async (targetFolderId) => {
      setIsMoveModalVisible(false);
      setLoading(true);
      try {
        await fetch(`${authData.baseUrl}/api/file/move`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${authData.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file_ids: selectedIds,
            target_folder_id: targetFolderId,
          }),
        });
        Alert.alert('移动成功', '已归类到新文件夹！');
        exitSelectMode();
        fetchClassic();
      } catch (error) {
      } finally {
        setLoading(false);
      }
    },
    [authData, selectedIds, exitSelectMode, fetchClassic]
  );

  return (
    <View style={styles.container}>
      {loading && (!mediaList || mediaList.length === 0) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ marginTop: 10, color: '#999' }}>
            {downloadingText || '正在精选...'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={mediaList}
          keyExtractor={keyExtractor}
          numColumns={4}
          renderItem={renderItem}
          refreshing={loading && downloadingText === ''}
          onRefresh={fetchClassic}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: '#999' }}>暂无内容</Text>
            </View>
          }
          contentContainerStyle={
            isSelectMode ? styles.flatListContentSelect : styles.flatListContent
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={20}
          windowSize={5}
          initialNumToRender={20}
        />
      )}

      {/* 下载进度浮层 */}
      {loading && downloadingText !== '' && (
        <View style={styles.downloadMask}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.downloadMaskText}>{downloadingText}</Text>
        </View>
      )}

      {/* 多选工具栏 */}
      {isSelectMode && (
        <View style={styles.floatingBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={exitSelectMode}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleSaveSelected}
            disabled={selectedIds.length === 0 || loading}
          >
            <Ionicons
              name="download-outline"
              size={24}
              color={selectedIds.length === 0 ? '#888' : '#fff'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={async () => {
              await fetchFolders();
              setIsMoveModalVisible(true);
            }}
            disabled={selectedIds.length === 0 || loading}
          >
            <Ionicons
              name="folder-open-outline"
              size={24}
              color={selectedIds.length === 0 ? '#888' : '#fff'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleDeleteSelected}
            disabled={selectedIds.length === 0 || loading}
          >
            <Ionicons
              name="trash-outline"
              size={24}
              color={selectedIds.length === 0 ? '#888' : '#FF3B30'}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* 移动文件夹 Modal */}
      <Modal visible={isMoveModalVisible} transparent animationType="slide">
        <View style={styles.modalBgSheet}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => setIsMoveModalVisible(false)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>移动到文件夹</Text>
              <TouchableOpacity onPress={() => setIsMoveModalVisible(false)}>
                <Text style={{ color: '#007AFF', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderRow}
                  onPress={() => handleMoveFiles(folder.id)}
                >
                  <Ionicons name="folder" size={24} color="#FFD15C" />
                  <Text style={styles.folderRowName}>{folder.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 图片浏览器 */}
      <ImageView
        images={imagesForViewer}
        imageIndex={currentImageIndex}
        visible={isViewerVisible}
        onRequestClose={() => setIsViewerVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  itemContainer: {
    width: itemSize,
    height: itemSize,
    margin: 1,
    position: 'relative',
  },
  image: { width: '100%', height: '100%', backgroundColor: '#f0f0f0' },
  selectedImage: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  playIconContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  playCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: { color: '#fff', fontSize: 14, marginLeft: 2 },
  checkboxContainer: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 20,
    left: '5%',
    width: '90%',
    height: 60,
    backgroundColor: '#333',
    borderRadius: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  actionBtn: { padding: 10, justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: '#fff', fontSize: 16 },
  downloadMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  downloadMaskText: {
    color: '#fff',
    marginTop: 15,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalBgSheet: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderColor: '#f5f5f5',
  },
  folderRowName: { flex: 1, fontSize: 16, color: '#333', marginLeft: 15 },
  flatListContent: { paddingBottom: 1 },
  flatListContentSelect: { paddingBottom: 80 },
});
