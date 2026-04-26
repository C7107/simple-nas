package handler

import (
	"os"
	"path/filepath"
	"net/url"
	"simple-nas-backend/database"
	"simple-nas-backend/model"
	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

func GetTrashFiles(c *gin.Context) {
	var files []model.File
	// 加上 Preload
	database.DB.Unscoped().Preload("Folder").Where("deleted_at IS NOT NULL").Order("deleted_at desc").Find(&files)

	var resList []map[string]interface{}
	for _, f := range files {
		physicalUrl := "/api/physical/" + url.PathEscape(f.Folder.Name) + "/" + url.PathEscape(f.FileName)
		item := map[string]interface{}{
			"id":            f.ID,
			"original_name": f.OriginalName,
			"file_type":     f.FileType,
			"size":          f.Size,
			"url":           physicalUrl,
			"created_at":    f.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		if f.ThumbName != "" {
			item["thumb_url"] = "/api/thumb/" + f.ThumbName
		}
		resList = append(resList, item)
	}
	utils.Success(c, resList, "获取回收站成功")
}

func RestoreTrash(c *gin.Context) {
	var req struct {
		FileIDs        []uint `json:"file_ids" binding:"required"`
		TargetFolderID uint   `json:"target_folder_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, "参数错误")
		return
	}

	var targetFolder model.Folder
	if err := database.DB.First(&targetFolder, req.TargetFolderID).Error; err != nil {
		utils.Fail(c, "目标文件夹不存在")
		return
	}

	// 1. 查出要恢复的文件
	var files []model.File
	database.DB.Unscoped().Where("id IN ?", req.FileIDs).Find(&files)

	for _, file := range files {
		var oldFolder model.Folder
		database.DB.First(&oldFolder, file.FolderID)

		// 2. 如果目标文件夹和原来的不一样，执行物理移动
		if oldFolder.ID != targetFolder.ID {
			oldPath := filepath.Join("storage", oldFolder.Name, file.FileName)
			newPath := filepath.Join("storage", targetFolder.Name, file.FileName)
			os.Rename(oldPath, newPath)
		}

		// 3. 解除软删除并更新文件夹 ID
		database.DB.Unscoped().Model(&file).Updates(map[string]interface{}{
			"deleted_at": nil,
			"folder_id":  targetFolder.ID,
		})
	}
	utils.Success(c, nil, "恢复成功")
}

func PermanentDeleteTrash(c *gin.Context) {
	var req struct {
		FileIDs []uint `json:"file_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, "参数错误")
		return
	}

	var files []model.File
	database.DB.Unscoped().Where("id IN ?", req.FileIDs).Find(&files)

	for _, file := range files {
		var folder model.Folder
		database.DB.First(&folder, file.FolderID)

		// 彻底物理抹除
		os.Remove(filepath.Join("storage", folder.Name, file.FileName))
		if file.ThumbName != "" {
			os.Remove(filepath.Join("storage/thumbs", file.ThumbName))
		}
		database.DB.Unscoped().Delete(&file)
	}
	utils.Success(c, nil, "永久删除成功")
}
