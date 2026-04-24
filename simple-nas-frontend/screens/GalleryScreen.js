import React, { useState, useCallback, useMemo, memo } from 'react';
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

// ─── 工具函数 ─────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
};

const FILTER_TYPES = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '照片' },
  { key: 'video', label: '视频' },
];

// ─── 独立记忆化的列表项组件 ─────────────────────────────
const GalleryItem = memo(({
  item,
  authData,
  isSelectMode,
  selectedIdsSet,
  sortConfig,
  onItemPress,
  onItemLongPress,
}) => {
  const isVideo = item.file_type === 'video';
  const isSelected = selectedIdsSet.has(item.id);
  // 优先使用缩略图（视频 / 大图都应走缩略）
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

      {sortConfig.key === 'size' && !isSelectMode && (
        <View style={styles.sizeTag}>
          <Text style={styles.sizeTagText}>{formatBytes(item.size)}</Text>
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
  // 自定义比较：只有当这些引用变化时才重渲染
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.size === nextProps.item.size &&
    prevProps.item.file_type === nextProps.item.file_type &&
    prevProps.item.thumb_url === nextProps.item.thumb_url &&
    prevProps.item.url === nextProps.item.url &&
    prevProps.authData.baseUrl === nextProps.authData.baseUrl &&
    prevProps.authData.token === nextProps.authData.token &&
    prevProps.isSelectMode === nextProps.isSelectMode &&
    prevProps.selectedIdsSet === nextProps.selectedIdsSet &&
    prevProps.sortConfig.key === nextProps.sortConfig.key &&
    prevProps.sortConfig.asc === nextProps.sortConfig.asc
  );
});

// ─── 主组件 ──────────────────────────────────────────────
export default function GalleryScreen({ navigation }) {
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

  const [filterType, setFilterType] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'time', asc: false });
  const [isSortMenuVisible, setIsSortMenuVisible] = useState(false);

  // ─── 用 Set 加速「是否选中」判断 ──────────────────
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ─── 所有 handler 提前定义（避免 TDZ）+ useCallback ──
  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const baseUrl = await getBaseUrl();
      const token = await getToken();
      setAuthData({ baseUrl, token });
      const response = await fetch(`${baseUrl}/api/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const resData = await response.json();
      if (resData.code === 200) setMediaList(resData.data || []);
    } catch (error) {
      // 静默失败，可加 toast
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

  // ─── useFocusEffect ──────────────────────────────
  useFocusEffect(
    useCallback(() => {
      fetchGallery();
      return () => exitSelectMode();
    }, [fetchGallery, exitSelectMode])
  );

  // ─── 数据加工：过滤 + 排序（useMemo 优化） ────────
  const processedMediaList = useMemo(() => {
    const list = [...mediaList]
      .filter((item) => filterType === 'all' || item.file_type === filterType)
      .sort((a, b) => {
        if (sortConfig.key === 'size') {
          return sortConfig.asc ? a.size - b.size : b.size - a.size;
        }
        // 按时间排序
        return sortConfig.asc
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at);
      });
    return list;
  }, [mediaList, filterType, sortConfig]);

  const imagesForViewer = useMemo(
    () =>
      processedMediaList
        .filter((item) => item.file_type === 'image')
        .map((item) => ({
          uri: `${authData.baseUrl}${item.url}?token=${authData.token}`,
        })),
    [processedMediaList, authData]
  );

  // ─── 图片浏览器索引查找 ────────────────────────
  const findImageIndex = useCallback(
    (itemId) => {
      const imgList = processedMediaList.filter((m) => m.file_type === 'image');
      return imgList.findIndex((m) => m.id === itemId);
    },
    [processedMediaList]
  );

  // ─── 列表项点击 / 长按（useCallback 保持引用稳定） ──
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

  // ─── renderItem 用 useCallback 包裹 ──────────────
  const renderItem = useCallback(
    ({ item }) => (
      <GalleryItem
        item={item}
        authData={authData}
        isSelectMode={isSelectMode}
        selectedIdsSet={selectedIdsSet}
        sortConfig={sortConfig}
        onItemPress={handleItemPress}
        onItemLongPress={handleItemLongPress}
      />
    ),
    [authData, isSelectMode, selectedIdsSet, sortConfig, handleItemPress, handleItemLongPress]
  );

  // ─── ListHeader 用 useMemo 保持引用稳定 ──────────
  const listHeader = useMemo(
    () => (
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTER_TYPES.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.filterBtn,
                filterType === type.key && styles.filterBtnActive,
              ]}
              onPress={() => {
                setFilterType(type.key);
                exitSelectMode();
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  filterType === type.key && styles.filterTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.filterBtn, styles.sortTriggerBtn]}
            onPress={() => setIsSortMenuVisible(true)}
          >
            <Text style={styles.filterText}>
              {sortConfig.key === 'time' ? '按时间' : '按大小'}
              {sortConfig.asc ? ' ↑' : ' ↓'}
            </Text>
            <Ionicons
              name="caret-down"
              size={14}
              color="#666"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </ScrollView>
      </View>
    ),
    [filterType, sortConfig, exitSelectMode]
  );

  // ─── 空状态组件（用 useMemo 保持引用稳定） ────────
  const emptyComponent = useMemo(
    () => (
      <View style={styles.center}>
        <Text style={{ color: '#999' }}>没有找到相关内容</Text>
      </View>
    ),
    []
  );

  // ─── FlatList 行布局（固定尺寸辅助优化） ──────────
  const getItemLayout = useCallback(
    (_, index) => ({
      length: itemSize + 2,
      offset: (itemSize + 2) * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  // ─── handlers for multi-select bar ─────────────
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
            await fetchGallery();
            exitSelectMode();
          } catch (error) {
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [selectedIds, authData, fetchGallery, exitSelectMode]);

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
        fetchGallery();
      } catch (error) {
      } finally {
        setLoading(false);
      }
    },
    [authData, selectedIds, exitSelectMode, fetchGallery]
  );

  // ─── 底部排序菜单选项 ──────────────────────────
  const sortOptions = useMemo(
    () => [
      {
        key: 'time',
        asc: false,
        label: '按时间 (新到旧) [默认]',
      },
      { key: 'time', asc: true, label: '按时间 (旧到新)' },
      { key: 'size', asc: false, label: '按大小 (大到小)' },
      { key: 'size', asc: true, label: '按大小 (小到大)' },
    ],
    []
  );

  // ─── 主要渲染 ───────────────────────────────────
  return (
    <View style={styles.container}>
      {loading && (!mediaList || mediaList.length === 0) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ marginTop: 10, color: '#999' }}>
            {downloadingText || '正在加载...'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={processedMediaList}
          keyExtractor={keyExtractor}
          numColumns={4}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          refreshing={loading && downloadingText === ''}
          onRefresh={fetchGallery}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={
            isSelectMode ? styles.flatListContentSelect : styles.flatListContent
          }
          // ── 核心性能优化参数 ──
          removeClippedSubviews={true}
          maxToRenderPerBatch={20}
          windowSize={5}
          initialNumToRender={20}
          getItemLayout={getItemLayout}
          // numColumns 下 getItemLayout 无法精确工作，但仍可提供估算
          // 用于优化滚动条
        />
      )}

      {/* ── 排序菜单 Modal ── */}
      <Modal visible={isSortMenuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBgSheet}
          activeOpacity={1}
          onPress={() => setIsSortMenuVisible(false)}
        >
          <View style={styles.sortMenuBox}>
            <Text style={styles.sortMenuTitle}>排序方式</Text>
            {sortOptions.map((opt) => {
              const isActive =
                sortConfig.key === opt.key && sortConfig.asc === opt.asc;
              return (
                <TouchableOpacity
                  key={`${opt.key}-${opt.asc}`}
                  style={styles.sortOptionRow}
                  onPress={() => {
                    setSortConfig({ key: opt.key, asc: opt.asc });
                    setIsSortMenuVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      isActive && styles.activeSortText,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 下载进度浮层 ── */}
      {loading && downloadingText !== '' && (
        <View style={styles.downloadMask}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.downloadMaskText}>{downloadingText}</Text>
        </View>
      )}

      {/* ── 多选工具栏 ── */}
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

      {/* ── 移动文件夹 Modal ── */}
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

      {/* ── 图片浏览器 ── */}
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

// ─── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  filterScroll: { paddingVertical: 15, paddingHorizontal: 10, alignItems: 'center' },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 6,
  },
  filterBtnActive: { backgroundColor: '#007AFF' },
  filterText: { fontSize: 14, color: '#333', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  sortTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
  },

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

  sizeTag: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sizeTagText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

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

  sortMenuBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  sortMenuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#999',
    textAlign: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#eee',
    marginBottom: 10,
  },
  sortOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#f9f9f9',
  },
  sortOptionText: { fontSize: 16, color: '#333' },
  activeSortText: { color: '#007AFF', fontWeight: 'bold' },

  flatListContent: { paddingBottom: 1 },
  flatListContentSelect: { paddingBottom: 80 },
});
