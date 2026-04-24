package utils

import (
	"log"
	"os/exec"
)

// GenerateVideoThumb 使用 FFmpeg 截取视频第一秒作为封面
func GenerateVideoThumb(videoPath, thumbPath string) error {
	// 拼接命令: ffmpeg -y -i input.mp4 -ss 00:00:01 -vframes 1 output.jpg
	// -y 表示如果封面已存在则覆盖
	// -ss 00:00:01 表示截取第 1 秒的内容（防止第 0 秒是纯黑屏）
	cmd := exec.Command("ffmpeg", "-y", "-i", videoPath, "-ss", "00:00:00.1", "-vframes", "1", thumbPath)

	// 执行命令
	err := cmd.Run()
	if err != nil {
		log.Printf("FFmpeg 生成封面失败: %v, 命令: %s", err, cmd.String())
		return err
	}
	return nil
}
