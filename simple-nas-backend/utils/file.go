package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GetFileType 简单通过后缀判断是图片还是视频
func GetFileType(ext string) string {
	ext = strings.ToLower(ext)
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic":
		return "image"
	case ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv":
		return "video"
	case ".txt":
		return "text"
	case ".html", ".htm":
		return "html"
	default:
		return "unknown"
	}
}

// SanitizeFileName 替换文件名中的控制字符和特殊符号，防止 URL 编码异常
func SanitizeFileName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || (r >= 0x7F && r <= 0x9F) {
			b.WriteRune('_')
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// GenerateUniqueFileName 名字冲突加后缀
func GenerateUniqueFileName(saveDir, originalName string) string {
	originalName = SanitizeFileName(originalName)
	ext := filepath.Ext(originalName)
	baseName := strings.TrimSuffix(filepath.Base(originalName), ext)

	finalName := originalName
	targetPath := filepath.Join(saveDir, finalName)

	// os.Stat 检查文件是否存在，如果没有 error，说明文件已经存在了！
	if _, err := os.Stat(targetPath); err == nil {
		// 存在冲突，加时间戳后缀
		finalName = fmt.Sprintf("%s_%d%s", baseName, time.Now().Unix(), ext)
	}

	return finalName
}
