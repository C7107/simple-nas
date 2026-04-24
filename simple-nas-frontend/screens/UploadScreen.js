import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Alert, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getBaseUrl, getToken } from '../utils/auth';

const screenWidth = Dimensions.get('window').width;
const itemSize = (screenWidth - 20 - 12) / 3; // 3 columns with proper spacing

export default function UploadScreen() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null); // { success: [], failed: [{name, reason}] }

  // ─── 选择文件（追加模式） ─────────────────────────────
  const pickFiles = useCallback(async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedFiles(prev => {
        // 用 uri 去重，避免重复选择同一个文件
        const existingUris = new Set(prev.map(f => f.uri));
        const newFiles = result.assets.filter(f => !existingUris.has(f.uri));
        return [...prev, ...newFiles];
      });
    }
  }, []);

  // ─── 移除单个文件 ──────────────────────────────────
  const removeFile = useCallback((uri) => {
    setSelectedFiles(prev => prev.filter(f => f.uri !== uri));
    setUploadResults(null); // 改变选择后清除之前的上传结果
  }, []);

  // ─── 取消全部 ─────────────────────────────────────
  const handleCancel = useCallback(() => {
    setSelectedFiles([]);
    setUploadResults(null);
  }, []);

  // ─── 逐个上传，精确报告每个文件的结果 ────────────────
  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return Alert.alert('提示', '请先选择文件');

    setUploading(true);
    setUploadResults(null);

    const baseUrl = await getBaseUrl();
    const token = await getToken();

    const successList = [];
    const failedList = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const fileName = file.fileName || file.uri.split('/').pop() || `file_${i}.jpg`;
      const mimeType = file.type === 'video' ? 'video/mp4' : 'image/jpeg';

      try {
        const formData = new FormData();
        formData.append('files', {
          uri: file.uri,
          name: fileName,
          type: mimeType,
        });

        const response = await fetch(`${baseUrl}/api/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          body: formData,
        });

        const resData = await response.json();

        if (resData.code === 200) {
          successList.push(fileName);
        } else {
          failedList.push({
            name: fileName,
            reason: resData.message || '服务端返回错误码 ' + resData.code,
          });
        }
      } catch (error) {
        failedList.push({
          name: fileName,
          reason: error.message || '网络错误，请检查连接',
        });
      }
    }

    setUploadResults({ success: successList, failed: failedList });
    setUploading(false);

    // ─── 弹出详细结果 ────────────────────────────────
    if (failedList.length === 0) {
      Alert.alert('✅ 全部成功', `成功上传 ${successList.length} 个文件！`);
      setSelectedFiles([]);
      setUploadResults(null);
    } else {
      let msg = '';
      if (successList.length > 0) {
        msg += `✅ 成功：${successList.length} 个\n\n`;
      }
      msg += `❌ 失败：${failedList.length} 个\n`;
      failedList.forEach(f => {
        msg += `  • ${f.name}\n    原因：${f.reason}\n`;
      });
      Alert.alert('上传完成', msg);
      // 不清空已选，用户可以查看失败文件再重试
    }
  }, [selectedFiles]);

  // ─── 渲染预览项 ────────────────────────────────────
  const renderPreviewItem = useCallback(({ item, index }) => {
    const fileName = item.fileName || item.uri.split('/').pop() || `file_${index}`;
    return (
      <TouchableOpacity
        style={styles.previewBox}
        activeOpacity={0.7}
        onPress={() => removeFile(item.uri)}
      >
        <Image source={{ uri: item.uri }} style={styles.previewImg} resizeMode="cover" />
        {item.type === 'video' && (
          <View style={styles.videoTagContainer}>
            <Text style={styles.videoTag}>视频</Text>
          </View>
        )}
        {/* 删除按钮 */}
        <View style={styles.removeBadge}>
          <Ionicons name="close-circle" size={22} color="#FF3B30" />
        </View>
        {/* 文件名（短） */}
        <Text style={styles.fileNameOverlay} numberOfLines={1}>
          {fileName.length > 12 ? fileName.slice(0, 10) + '…' : fileName}
        </Text>
      </TouchableOpacity>
    );
  }, [removeFile]);

  const keyExtractor = useCallback((item) => item.uri, []);

  // ─── 计算状态文本 ──────────────────────────────────
  const statusText = useMemo(() => {
    if (!uploadResults) return null;
    const { success, failed } = uploadResults;
    if (failed.length === 0) return `✅ 全部成功 (${success.length} 个)`;
    return `✅ ${success.length} 成功 · ❌ ${failed.length} 失败`;
  }, [uploadResults]);

  // ─── 渲染 ──────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── 初始选择按钮 ── */}
      {selectedFiles.length === 0 && (
        <TouchableOpacity style={styles.pickBtn} onPress={pickFiles} disabled={uploading}>
          <Ionicons name="images-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.btnText}>选择照片或视频 (可多选)</Text>
        </TouchableOpacity>
      )}

      {/* ── 文件预览区 ── */}
      {selectedFiles.length > 0 && (
        <>
          {/* 顶部操作栏：添加更多 + 取消 + 状态 */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.addMoreBtn} onPress={pickFiles} disabled={uploading}>
              <Ionicons name="add-circle" size={20} color="#007AFF" />
              <Text style={styles.addMoreText}>添加更多</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={uploading}>
              <Ionicons name="close-circle" size={20} color="#FF3B30" />
              <Text style={styles.cancelTextBtn}>取消</Text>
            </TouchableOpacity>
          </View>

          {/* 上传结果状态 */}
          {statusText && (
            <View style={[
              styles.statusBar,
              uploadResults.failed.length > 0 ? styles.statusBarWarn : styles.statusBarSuccess,
            ]}>
              <Text style={styles.statusText}>{statusText}</Text>
              {uploadResults.failed.length > 0 && (
                <TouchableOpacity onPress={() => {
                  let msg = '失败详情：\n';
                  uploadResults.failed.forEach(f => {
                    msg += `\n• ${f.name}\n  原因：${f.reason}`;
                  });
                  Alert.alert('上传失败文件', msg);
                }}>
                  <Text style={styles.statusDetailLink}>查看详情</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 提示：点击图片可移除 */}
          <Text style={styles.hintText}>点击文件可移除</Text>

          {/* 文件网格 */}
          <FlatList
            data={selectedFiles}
            keyExtractor={keyExtractor}
            numColumns={3}
            renderItem={renderPreviewItem}
            contentContainerStyle={styles.previewGrid}
            removeClippedSubviews={true}
            maxToRenderPerBatch={15}
            windowSize={3}
          />

          {/* ── 上传按钮 ── */}
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <View style={styles.uploadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={[styles.btnText, { marginLeft: 8 }]}>正在上传…</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>
                开始上传 ({selectedFiles.length} 个)
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
  },

  // ── 初始选择按钮 ──
  pickBtn: {
    flexDirection: 'row',
    backgroundColor: '#f0ad4e',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    shadowColor: '#f0ad4e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  // ── 顶部操作栏 ──
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 4,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
  },
  addMoreText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 15,
    marginLeft: 4,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#fff0f0',
  },
  cancelTextBtn: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 15,
    marginLeft: 4,
  },

  // ── 状态栏 ──
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginVertical: 6,
  },
  statusBarSuccess: { backgroundColor: '#e8f5e9' },
  statusBarWarn: { backgroundColor: '#fff3e0' },
  statusText: { fontSize: 14, fontWeight: '600', color: '#333' },
  statusDetailLink: { fontSize: 13, color: '#007AFF', fontWeight: '500' },

  // ── 提示 ──
  hintText: {
    fontSize: 12,
    color: '#bbb',
    textAlign: 'center',
    marginBottom: 6,
  },

  // ── 文件网格 ──
  previewGrid: {
    paddingBottom: 10,
  },
  previewBox: {
    width: itemSize,
    height: itemSize,
    margin: 4,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative',
  },
  previewImg: {
    width: '100%',
    height: '100%',
  },
  videoTagContainer: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  videoTag: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  removeBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 11,
  },
  fileNameOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    textAlign: 'center',
  },

  // ── 上传按钮 ──
  uploadBtn: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  uploadBtnDisabled: {
    backgroundColor: '#80b8ff',
    shadowOpacity: 0.1,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
