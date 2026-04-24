import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Alert, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { getBaseUrl, getToken } from '../utils/auth';

const screenWidth = Dimensions.get('window').width;
const itemSize = (screenWidth - 20 - 12) / 3;

const guessMimeType = (name) => {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  const map = {
    txt: 'text/plain', html: 'text/html', htm: 'text/html',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', flv: 'video/x-flv',
  };
  return map[ext] || 'application/octet-stream';
};

const getFileDisplayType = (file) => {
  if (file.type === 'video') return 'video';
  if (file.type === 'image') return 'image';
  const name = (file.name || file.fileName || '').toLowerCase();
  if (/\.(txt|html|htm)$/i.test(name)) return 'document';
  return 'unknown';
};

export default function UploadScreen() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);

  const mediaCount = selectedFiles.filter((f) => {
    const t = getFileDisplayType(f);
    return t === 'image' || t === 'video';
  }).length;
  const docCount = selectedFiles.filter((f) => getFileDisplayType(f) === 'document').length;

  const pickMedia = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (!result.canceled && result.assets?.length) {
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        const newFiles = result.assets.filter((f) => !existingUris.has(f.uri));
        return [...prev, ...newFiles];
      });
      setUploadResults(null);
    }
  }, []);

  const pickDocuments = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/html'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.length) {
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        const newFiles = result.assets
          .filter((f) => !existingUris.has(f.uri))
          .map((f) => ({
            uri: f.uri,
            name: f.name,
            mimeType: f.mimeType || guessMimeType(f.name),
          }));
        return [...prev, ...newFiles];
      });
      setUploadResults(null);
    }
  }, []);

  const removeFile = useCallback((uri) => {
    setSelectedFiles((prev) => prev.filter((f) => f.uri !== uri));
    setUploadResults(null);
  }, []);

  const handleCancel = useCallback(() => {
    setSelectedFiles([]);
    setUploadResults(null);
  }, []);

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
      const fileName = file.fileName || file.name || file.uri.split('/').pop() || `file_${i}`;
      const mimeType = file.mimeType || file.type
        ? file.type === 'video' ? 'video/mp4' : 'image/jpeg'
        : guessMimeType(fileName);

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
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          body: formData,
        });
        const resData = await response.json();
        if (resData.code === 200) {
          successList.push(fileName);
        } else {
          failedList.push({ name: fileName, reason: resData.message || '服务端返回错误码 ' + resData.code });
        }
      } catch (error) {
        failedList.push({ name: fileName, reason: error.message || '网络错误，请检查连接' });
      }
    }

    setUploadResults({ success: successList, failed: failedList });
    setUploading(false);

    if (failedList.length === 0) {
      Alert.alert('全部成功', `成功上传 ${successList.length} 个文件！`);
      setSelectedFiles([]);
      setUploadResults(null);
    } else {
      let msg = '';
      if (successList.length > 0) msg += `成功：${successList.length} 个\n\n`;
      msg += `失败：${failedList.length} 个\n`;
      failedList.forEach((f) => { msg += `  - ${f.name}\n    原因：${f.reason}\n`; });
      Alert.alert('上传完成', msg);
    }
  }, [selectedFiles]);

  const renderPreviewItem = useCallback(({ item, index }) => {
    const fileName = item.fileName || item.name || item.uri.split('/').pop() || `file_${index}`;
    const displayType = getFileDisplayType(item);
    const isDoc = displayType === 'document';

    return (
      <TouchableOpacity
        style={styles.previewBox}
        activeOpacity={0.7}
        onPress={() => removeFile(item.uri)}
      >
        {isDoc ? (
          <View style={styles.docPreview}>
            <Ionicons
              name={/\.html?$/i.test(fileName) ? 'code-slash' : 'document-text'}
              size={32}
              color={/\.html?$/i.test(fileName) ? '#E67E22' : '#4A90D9'}
            />
            <Text style={styles.docPreviewName} numberOfLines={3}>{fileName}</Text>
          </View>
        ) : (
          <Image source={{ uri: item.uri }} style={styles.previewImg} resizeMode="cover" />
        )}

        {displayType === 'video' && (
          <View style={styles.videoTagContainer}>
            <Text style={styles.videoTag}>视频</Text>
          </View>
        )}
        {isDoc && (
          <View style={styles.videoTagContainer}>
            <Text style={[styles.videoTag, { backgroundColor: '#5C6BC0' }]}>文档</Text>
          </View>
        )}

        <View style={styles.removeBadge}>
          <Ionicons name="close-circle" size={22} color="#FF3B30" />
        </View>
        <Text style={styles.fileNameOverlay} numberOfLines={1}>
          {fileName.length > 14 ? fileName.slice(0, 12) + '...' : fileName}
        </Text>
      </TouchableOpacity>
    );
  }, [removeFile]);

  const keyExtractor = useCallback((item) => item.uri, []);

  const statusText = useMemo(() => {
    if (!uploadResults) return null;
    const { success, failed } = uploadResults;
    if (failed.length === 0) return `全部成功 (${success.length} 个)`;
    return `${success.length} 成功 / ${failed.length} 失败`;
  }, [uploadResults]);

  return (
    <View style={styles.container}>
      {selectedFiles.length === 0 ? (
        <View style={styles.initialButtons}>
          <TouchableOpacity style={styles.pickBtn} onPress={pickMedia} disabled={uploading}>
            <Ionicons name="images-outline" size={22} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>选择照片或视频</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.pickDocBtn} onPress={pickDocuments} disabled={uploading}>
            <Ionicons name="document-text-outline" size={22} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>选择文档文件</Text>
            <Text style={styles.btnSub}>(.txt / .html)</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.actionBar}>
            <View style={styles.actionBarLeft}>
              <TouchableOpacity style={styles.addMoreBtn} onPress={pickMedia} disabled={uploading}>
                <Ionicons name="images-outline" size={18} color="#007AFF" />
                <Text style={styles.addMoreText}>媒体</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addMoreBtn} onPress={pickDocuments} disabled={uploading}>
                <Ionicons name="document-text-outline" size={18} color="#007AFF" />
                <Text style={styles.addMoreText}>文档</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={uploading}>
              <Ionicons name="close-circle" size={20} color="#FF3B30" />
              <Text style={styles.cancelTextBtn}>取消</Text>
            </TouchableOpacity>
          </View>

          {statusText && (
            <View style={[
              styles.statusBar,
              uploadResults.failed.length > 0 ? styles.statusBarWarn : styles.statusBarSuccess,
            ]}>
              <Text style={styles.statusText}>{statusText}</Text>
              {uploadResults.failed.length > 0 && (
                <TouchableOpacity onPress={() => {
                  let msg = '失败详情：\n';
                  uploadResults.failed.forEach((f) => {
                    msg += `\n- ${f.name}\n  原因：${f.reason}`;
                  });
                  Alert.alert('上传失败文件', msg);
                }}>
                  <Text style={styles.statusDetailLink}>查看详情</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.summaryRow}>
            <Text style={styles.hintText}>
              已选 {selectedFiles.length} 个文件
              {mediaCount > 0 ? ` (媒体 ${mediaCount})` : ''}
              {docCount > 0 ? ` (文档 ${docCount})` : ''}
              {'  '}点击文件可移除
            </Text>
          </View>

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

          <TouchableOpacity
            style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <View style={styles.uploadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={[styles.btnText, { marginLeft: 8 }]}>正在上传...</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>开始上传 ({selectedFiles.length} 个)</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, backgroundColor: '#fff' },

  initialButtons: {
    marginTop: 60,
    paddingHorizontal: 20,
    gap: 20,
  },

  pickBtn: {
    flexDirection: 'row', backgroundColor: '#f0ad4e', padding: 18, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#f0ad4e', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  pickDocBtn: {
    flexDirection: 'row', backgroundColor: '#5C6BC0', padding: 18, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5C6BC0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  btnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginLeft: 4 },

  actionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0', marginBottom: 4,
  },
  actionBarLeft: { flexDirection: 'row', gap: 8 },
  addMoreBtn: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#eef2ff',
  },
  addMoreText: { color: '#007AFF', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#fff0f0',
  },
  cancelTextBtn: { color: '#FF3B30', fontWeight: '600', fontSize: 14, marginLeft: 4 },

  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 10, borderRadius: 8, marginVertical: 6,
  },
  statusBarSuccess: { backgroundColor: '#e8f5e9' },
  statusBarWarn: { backgroundColor: '#fff3e0' },
  statusText: { fontSize: 14, fontWeight: '600', color: '#333' },
  statusDetailLink: { fontSize: 13, color: '#007AFF', fontWeight: '500' },

  summaryRow: { paddingVertical: 4 },
  hintText: { fontSize: 12, color: '#bbb', textAlign: 'center' },

  previewGrid: { paddingBottom: 10 },
  previewBox: {
    width: itemSize, height: itemSize, margin: 4, borderRadius: 10,
    overflow: 'hidden', backgroundColor: '#f0f0f0', position: 'relative',
  },
  previewImg: { width: '100%', height: '100%' },
  docPreview: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f8f9fa', padding: 6,
  },
  docPreviewName: { fontSize: 9, color: '#666', marginTop: 6, textAlign: 'center' },

  videoTagContainer: { position: 'absolute', bottom: 4, right: 4 },
  videoTag: {
    backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  removeBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 11,
  },
  fileNameOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff',
    fontSize: 10, paddingHorizontal: 4, paddingVertical: 2, textAlign: 'center',
  },

  uploadBtn: {
    backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', marginTop: 6, marginBottom: 20,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  uploadBtnDisabled: { backgroundColor: '#80b8ff', shadowOpacity: 0.1 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center' },
});
