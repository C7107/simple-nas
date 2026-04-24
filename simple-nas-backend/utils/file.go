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
	default:
		return "unknown"
	}
}

// GenerateUniqueFileName 名字冲突加后缀
// 比如传了 猫.jpg，如果没冲突就叫 猫.jpg；如果已存在，就变成 猫_1699991234.jpg
func GenerateUniqueFileName(saveDir, originalName string) string {
	// 获取后缀名，比如 ".jpg"
	ext := filepath.Ext(originalName)
	// 获取去掉后缀的文件名，比如 "猫"
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
