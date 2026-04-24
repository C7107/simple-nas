import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity, Text, Dimensions,
  ActivityIndicator, Alert, Modal, TextInput, Image, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ImageView from 'react-native-image-viewing';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const FILTER_TYPES = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '照片' },
  { key: 'video', label: '视频' },
];

const SORT_OPTIONS = [
  { key: 'time', asc: false, label: '按时间 (新到旧) [默认]' },
  { key: 'time', asc: true,  label: '按时间 (旧到新)' },
  { key: 'size', asc: false, label: '按大小 (大到小)' },
  { key: 'size', asc: true,  label: '按大小 (小到大)' },
];

// ─── 文件夹格子 ─────────────────────────────────
const FolderItem = memo(({ item, onPress, onLongPress }) => (
  <TouchableOpacity
    style={styles.folderBox}
    activeOpacity={0.7}
    onPress={() => onPress(item)}
    onLongPress={() => onLongPress(item)}
  >
    <Ionicons
      name={item.id === 'trash' ? 'trash' : 'folder'}
      size={60}
      color={item.id === 'trash' ? '#FF3B30' : '#FFD15C'}
    />
    <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
    <Text style={styles.folderCount}>{item.file_count} 项</Text>
  </TouchableOpacity>
));

// ─── 媒体格子（自定义对比，同 GalleryScreen 的 GalleryItem）─
const MediaItem = memo(({
  item, authData, isSelectMode, selectedIdsSet, sortConfig,
  onPress, onLongPress,
}) => {
  const isVideo = item.file_type === 'video';
  const isSelected = selectedIdsSet.has(item.id);
  const thumbPath = item.thumb_url || item.url;
  const imageUrl = thumbPath
    ? `${authData.baseUrl}${thumbPath}?token=${authData.token}`
    : isVideo
      ? 'https://via.placeholder.com/150/333333/FFFFFF?text=VIDEO'
      : 'https://via.placeholder.com/150';

  return (
    <TouchableOpacity
      style={styles.mediaContainer}
      activeOpacity={0.8}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      <Image
        source={{ uri: imageUrl }}
        style={[styles.mediaImage, isSelected && styles.selectedImage]}
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
}, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.item.size === next.item.size &&
  prev.item.file_type === next.item.file_type &&
  prev.item.thumb_url === next.item.thumb_url &&
  prev.item.url === next.item.url &&
  prev.authData.baseUrl === next.authData.baseUrl &&
  prev.authData.token === next.authData.token &&
  prev.isSelectMode === next.isSelectMode &&
  prev.selectedIdsSet === next.selectedIdsSet &&
  prev.sortConfig.key === next.sortConfig.key &&
  prev.sortConfig.asc === next.sortConfig.asc
));

// ─── 主组件 ──────────────────────────────────────
export default function FolderScreen({ navigation }) {
  const [authData, setAuthData] = useState({ baseUrl: '', token: '' });
  const [loading, setLoading] = useState(false);

  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [mediaList, setMediaList] = useState([]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [modalActionType, setModalActionType] = useState('move');

  const [filterType, setFilterType] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'time', asc: false });
  const [isSortMenuVisible, setIsSortMenuVisible] = useState(false);

  // ─── 用 Set 加速选中判断 ───────────────────────
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ─── 所有 handler 提前定义 + useCallback ───────
  const fetchFolders = useCallback(async () => {
    setLoading(true);
    try {
      const baseUrl = await getBaseUrl();
      const token = await getToken();
      setAuthData({ baseUrl, token });
      const res = await fetch(`${baseUrl}/api/folders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.code === 200) {
        const trashFolder = { id: 'trash', name: '回收站', file_count: '-' };
        setFolders([...(data.data || []), trashFolder]);
      }
    } catch (_) {} finally {
      setLoading(false);
    }
  }, []);

  const fetchFolderFiles = useCallback(async (folder) => {
    setCurrentFolder(folder);
    setFilterType('all');
    setSortConfig({ key: 'time', asc: false });
    setLoading(true);
    try {
      let url = `${authData.baseUrl}/api/folder/${folder.id}/files`;
      if (folder.id === 'trash') url = `${authData.baseUrl}/api/trash`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authData.token}` },
      });
      const data = await res.json();
      if (data.code === 200) setMediaList(data.data || []);
    } catch (_) {
      setMediaList([]);
    } finally {
      setLoading(false);
    }
  }, [authData]);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds([]);
  }, []);

  // ─── useFocusEffect（函数已提前定义，闭环正确）─
  useFocusEffect(
    useCallback(() => {
      fetchFolders();
      return () => exitSelectMode();
    }, [fetchFolders, exitSelectMode])
  );

  // ─── 数据加工：过滤 + 排序 ─────────────────────
  const processedMediaList = useMemo(() => {
    return [...mediaList]
      .filter((item) => filterType === 'all' || item.file_type === filterType)
      .sort((a, b) => {
        if (sortConfig.key === 'size') {
          return sortConfig.asc ? a.size - b.size : b.size - a.size;
        }
        const timeA = a.created_at || '0';
        const timeB = b.created_at || '0';
        return sortConfig.asc
          ? timeA.localeCompare(timeB)
          : timeB.localeCompare(timeA);
      });
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

  // ─── 图片索引查找 ─────────────────────────────
  const findImageIndex = useCallback(
    (itemId) => {
      const imgList = processedMediaList.filter((m) => m.file_type === 'image');
      return imgList.findIndex((m) => m.id === itemId);
    },
    [processedMediaList]
  );

  // ─── 新建文件夹 ───────────────────────────────
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return Alert.alert('提示', '文件夹名字不能为空');
    setIsModalVisible(false);
    setLoading(true);
    try {
      const res = await fetch(`${authData.baseUrl}/api/folder`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authData.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (data.code === 200) {
        setNewFolderName('');
        fetchFolders();
      }
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [newFolderName, authData, fetchFolders]);

  // ─── 删除文件夹 ───────────────────────────────
  const handleDeleteFolder = useCallback(
    (folder) => {
      if (folder.id === 1 || folder.id === 'trash')
        return Alert.alert('提示', '该文件夹不可删除');
      Alert.alert(
        '删除文件夹',
        `确定要删除 "${folder.name}" 吗？\n删除后里面的文件会自动移回默认文件夹。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定删除',
            style: 'destructive',
            onPress: async () => {
              setLoading(true);
              try {
                await fetch(`${authData.baseUrl}/api/folder/${folder.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${authData.token}` },
                });
                fetchFolders();
              } catch (_) {} finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    },
    [authData, fetchFolders]
  );

  // ─── 删除选中的文件 ───────────────────────────
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
            if (currentFolder) await fetchFolderFiles(currentFolder);
            exitSelectMode();
          } catch (_) {} finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [selectedIds, authData, currentFolder, fetchFolderFiles, exitSelectMode]);

  // ─── 移动 / 恢复操作 ──────────────────────────
  const executeModalAction = useCallback(
    async (folderId) => {
      setIsMoveModalVisible(false);
      setLoading(true);
      try {
        const url =
          modalActionType === 'move'
            ? `${authData.baseUrl}/api/file/move`
            : `${authData.baseUrl}/api/trash/restore`;
        const method = modalActionType === 'move' ? 'PUT' : 'POST';

        await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${authData.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file_ids: selectedIds, target_folder_id: folderId }),
        });
        if (currentFolder) await fetchFolderFiles(currentFolder);
        exitSelectMode();
      } catch (_) {} finally {
        setLoading(false);
      }
    },
    [authData, modalActionType, selectedIds, currentFolder, fetchFolderFiles, exitSelectMode]
  );

  // ─── 永久删除 ─────────────────────────────────
  const handlePermanentDelete = useCallback(() => {
    Alert.alert('永久删除', `将彻底删除这 ${selectedIds.length} 个文件，不可恢复！`, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await fetch(`${authData.baseUrl}/api/trash/permanent`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${authData.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ file_ids: selectedIds }),
            });
            if (currentFolder) await fetchFolderFiles(currentFolder);
            exitSelectMode();
          } catch (_) {} finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [selectedIds, authData, currentFolder, fetchFolderFiles, exitSelectMode]);

  // ─── 文件夹点击 / 长按 ────────────────────────
  const handleFolderPress = useCallback(
    (folder) => { fetchFolderFiles(folder); },
    [fetchFolderFiles]
  );

  const handleFolderLongPress = useCallback(
    (folder) => { handleDeleteFolder(folder); },
    [handleDeleteFolder]
  );

  // ─── 媒体项点击 / 长按 ────────────────────────
  const handleMediaPress = useCallback(
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

  const handleMediaLongPress = useCallback(
    (item) => {
      if (!isSelectMode) {
        setIsSelectMode(true);
        setSelectedIds([item.id]);
      }
    },
    [isSelectMode]
  );

  const handleBack = useCallback(() => {
    setCurrentFolder(null);
    fetchFolders();
    exitSelectMode();
  }, [fetchFolders, exitSelectMode]);

  // ─── renderItem（useCallback 包裹）─────────────
  const renderFolderItem = useCallback(
    ({ item }) => (
      <FolderItem
        item={item}
        onPress={handleFolderPress}
        onLongPress={handleFolderLongPress}
      />
    ),
    [handleFolderPress, handleFolderLongPress]
  );

  const renderMediaItem = useCallback(
    ({ item }) => (
      <MediaItem
        item={item}
        authData={authData}
        isSelectMode={isSelectMode}
        selectedIdsSet={selectedIdsSet}
        sortConfig={sortConfig}
        onPress={handleMediaPress}
        onLongPress={handleMediaLongPress}
      />
    ),
    [authData, isSelectMode, selectedIdsSet, sortConfig, handleMediaPress, handleMediaLongPress]
  );

  // ─── keyExtractor ─────────────────────────────
  const folderKeyExtractor = useCallback((item) => String(item.id), []);
  const mediaKeyExtractor = useCallback((item) => String(item.id), []);

  // ─── ListHeader（useMemo 缓存 JSX）─────────────
  const listHeader = useMemo(() => {
    if (!currentFolder) return null;
    return (
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
              onPress={() => { setFilterType(type.key); exitSelectMode(); }}
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
            <Ionicons name="caret-down" size={14} color="#666" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }, [currentFolder, filterType, sortConfig, exitSelectMode]);

  // ─── 空状态组件 ──────────────────────────────
  const emptyComponent = useMemo(
    () => (
      <View style={styles.center}>
        <Text style={{ color: '#999' }}>没有内容</Text>
      </View>
    ),
    []
  );

  // ─── getItemLayout ────────────────────────────
  const mediaGetItemLayout = useCallback(
    (_, index) => ({
      length: itemSize + 2,
      offset: (itemSize + 2) * index,
      index,
    }),
    []
  );

  const openMoveModal = useCallback(
    async (actionType) => {
      await fetchFolders();
      setModalActionType(actionType);
      setIsMoveModalVisible(true);
    },
    [fetchFolders]
  );

  // ═══════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* 顶栏 */}
      <View style={styles.header}>
        {currentFolder ? (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color="#007AFF" />
            <Text style={styles.headerTitle}>{currentFolder.name}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.headerTitleMain}>文件管理</Text>
        )}
        {!currentFolder && (
          <TouchableOpacity onPress={() => setIsModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={28} color="#007AFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* 主体 — 两个 FlatList 必须加不同的 key，防止 React 复用实例导致 numColumns 冲突 */}
      {loading && !currentFolder && folders.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : currentFolder ? (
        <FlatList
          key="media-list-4"               // ← 必须加 key
          data={processedMediaList}
          keyExtractor={mediaKeyExtractor}
          numColumns={4}
          renderItem={renderMediaItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={
            isSelectMode ? styles.flatListContentSelect : styles.flatListContent
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={20}
          windowSize={5}
          initialNumToRender={20}
          getItemLayout={mediaGetItemLayout}
        />
      ) : (
        <FlatList
          key="folder-list-3"              // ← 必须加 key
          data={folders}
          keyExtractor={folderKeyExtractor}
          numColumns={3}
          renderItem={renderFolderItem}
          contentContainerStyle={styles.folderGrid}
          removeClippedSubviews={true}
          maxToRenderPerBatch={12}
          windowSize={3}
          initialNumToRender={12}
        />
      )}

      {/* ── 多选工具栏 ── */}
      {currentFolder && isSelectMode && (
        <View style={styles.floatingBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={exitSelectMode}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
          {currentFolder.id === 'trash' ? (
            <>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openMoveModal('restore')}
                disabled={selectedIds.length === 0 || loading}
              >
                <Ionicons
                  name="refresh"
                  size={24}
                  color={selectedIds.length === 0 ? '#888' : '#fff'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handlePermanentDelete}
                disabled={selectedIds.length === 0 || loading}
              >
                <Ionicons
                  name="trash-bin"
                  size={24}
                  color={selectedIds.length === 0 ? '#888' : '#FF3B30'}
                />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openMoveModal('move')}
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
            </>
          )}
        </View>
      )}

      {/* ── 排序菜单 ── */}
      <Modal visible={isSortMenuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBgSheet}
          activeOpacity={1}
          onPress={() => setIsSortMenuVisible(false)}
        >
          <View style={styles.sortMenuBox}>
            <Text style={styles.sortMenuTitle}>排序方式</Text>
            {SORT_OPTIONS.map((opt) => {
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
                    style={[styles.sortOptionText, isActive && styles.activeSortText]}
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

      {/* ── 新建文件夹 ── */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>新建文件夹</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="请输入文件夹名称"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => { setIsModalVisible(false); setNewFolderName(''); }}
              >
                <Text style={{ color: '#999', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleCreateFolder}>
                <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: 'bold' }}>
                  确定
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 移动 / 恢复文件夹选择 ── */}
      <Modal visible={isMoveModalVisible} transparent animationType="slide">
        <View style={styles.modalBgSheet}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => setIsMoveModalVisible(false)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {modalActionType === 'move' ? '移动到' : '恢复到'}文件夹
              </Text>
              <TouchableOpacity onPress={() => setIsMoveModalVisible(false)}>
                <Text style={{ color: '#007AFF', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {folders
                .filter((f) => f.id !== currentFolder?.id && f.id !== 'trash')
                .map((folder) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={styles.folderRow}
                    onPress={() => executeModalAction(folder.id)}
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
    </SafeAreaView>
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

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  headerTitleMain: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginLeft: 5 },

  folderBox: {
    width: '31%',
    margin: '1%',
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  folderName: { fontSize: 14, color: '#333', marginTop: 8, fontWeight: '500' },
  folderCount: { fontSize: 12, color: '#999', marginTop: 2 },

  mediaContainer: { width: itemSize, height: itemSize, margin: 1, position: 'relative' },
  mediaImage: { width: '100%', height: '100%', backgroundColor: '#f0f0f0' },
  selectedImage: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  playIconContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  playCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  playIcon: { color: '#fff', fontSize: 14, marginLeft: 2 },
  checkboxContainer: {
    position: 'absolute', top: 5, left: 5,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12,
  },

  floatingBar: {
    position: 'absolute', bottom: 20, left: '5%', width: '90%', height: 60,
    backgroundColor: '#333', borderRadius: 30,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 25,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 10,
  },
  actionBtn: { padding: 10, justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: '#fff', fontSize: 16 },

  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalBox: {
    width: 300, backgroundColor: '#fff', borderRadius: 15, padding: 20,
  },
  modalTitle: {
    fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15,
  },
  modalInput: {
    borderWidth: 1, borderColor: '#ddd', padding: 10,
    borderRadius: 8, fontSize: 16, marginBottom: 20,
  },
  modalBtns: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderColor: '#eee', paddingTop: 15,
  },
  modalBtn: { flex: 1, alignItems: 'center' },

  modalBgSheet: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderColor: '#eee',
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', padding: 15,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  folderRowName: { flex: 1, fontSize: 16, color: '#333', marginLeft: 15 },

  sortMenuBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 40, paddingHorizontal: 20,
  },
  sortMenuTitle: {
    fontSize: 16, fontWeight: 'bold', color: '#999', textAlign: 'center',
    paddingVertical: 15, borderBottomWidth: 1, borderColor: '#eee', marginBottom: 10,
  },
  sortOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f9f9f9',
  },
  sortOptionText: { fontSize: 16, color: '#333' },
  activeSortText: { color: '#007AFF', fontWeight: 'bold' },

  flatListContent: { paddingBottom: 1 },
  flatListContentSelect: { paddingBottom: 80 },
  folderGrid: { padding: 10 },
});
