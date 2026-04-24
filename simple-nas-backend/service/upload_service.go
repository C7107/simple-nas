package service

import (
	"fmt"
	"mime/multipart"
	"path/filepath"
	"time"

	"simple-nas-backend/database"
	"simple-nas-backend/model"
	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

// ProcessUpload 处理上传文件的保存和入库逻辑
func ProcessUpload(c *gin.Context, file *multipart.FileHeader) error {
	originalName := file.Filename
	ext := filepath.Ext(originalName)
	fileType := utils.GetFileType(ext)

	if fileType == "unknown" {
		return fmt.Errorf("不支持的文件格式: %s", ext)
	}

	saveDir := "storage/默认"


	finalName := utils.GenerateUniqueFileName(saveDir, originalName)
	savePath := filepath.Join(saveDir, finalName)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		return fmt.Errorf("保存文件失败: %v", err)
	}

	fileRecord := model.File{
		FolderID:     1,
		OriginalName: originalName,
		FileName:     finalName,
		FileType:     fileType,
		Size:         file.Size,
		CreatedAt:    time.Now(),
	}

	// ================= 【新增：如果是视频，生成封面】 =================
	if fileType == "video" {
		// 封面名字用 "原视频名.jpg"
		thumbName := finalName + ".jpg"
		thumbPath := filepath.Join("storage/thumbs", thumbName)

		err := utils.GenerateVideoThumb(savePath, thumbPath)
		if err == nil {
			// 如果生成成功，记录到数据库
			fileRecord.ThumbName = thumbName
		} else {
			// 生成失败也不影响视频上传，只是没封面而已
			fileRecord.ThumbName = ""
		}
	}
	// =============================================================

	if err := database.DB.Create(&fileRecord).Error; err != nil {
		return fmt.Errorf("入库失败: %v", err)
	}

	return nil
}
