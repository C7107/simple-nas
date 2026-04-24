import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, Text, ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export default function FileViewerScreen({ route, navigation }) {
  const { fileUrl, title, fileType } = route.params;
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fileType === 'html') {
      WebBrowser.openBrowserAsync(fileUrl);
      navigation.goBack();
      return;
    }

    fetch(fileUrl)
      .then((res) => res.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent('无法读取文件内容');
        setLoading(false);
      });
  }, [fileUrl, fileType, navigation]);

  if (fileType === 'html') return null;

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ marginTop: 10, color: '#999' }}>加载中...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.text} selectable>
            {content}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  contentContainer: { padding: 16 },
  text: {
    fontSize: 14,
    lineHeight: 22,
    color: '#333',
    fontFamily: 'monospace',
  },
});
