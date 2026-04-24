package handler

import (
	"net/url"
	"os"
	"path/filepath"

	"simple-nas-backend/database"
	"simple-nas-backend/model"
	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

// CreateFolder 新建物理文件夹
func CreateFolder(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, "文件夹名字不能为空")
		return
	}

	// 1. 创建物理文件夹
	folderPath := filepath.Join("storage", req.Name)
	if err := os.MkdirAll(folderPath, os.ModePerm); err != nil {
		utils.Fail(c, "创建物理文件夹失败")
		return
	}

	// 2. 写入数据库
	folder := model.Folder{Name: req.Name}
	if err := database.DB.Create(&folder).Error; err != nil {
		utils.Fail(c, "文件夹名字已存在")
		return
	}
	utils.Success(c, folder, "新建成功")
}

func ListFolders(c *gin.Context) {
	var folders []model.Folder
	database.DB.Find(&folders)

	var resList []map[string]interface{}
	for _, f := range folders {
		var count int64
		database.DB.Model(&model.File{}).Where("folder_id = ?", f.ID).Count(&count)
		resList = append(resList, map[string]interface{}{
			"id":         f.ID,
			"name":       f.Name,
			"file_count": count,
			"created_at": f.CreatedAt.Format("2006-01-02"),
		})
	}
	utils.Success(c, resList, "获取成功")
}

func GetFolderFiles(c *gin.Context) {
	folderID := c.Param("id")
	var files []model.File

	// 加上 Preload
	if err := database.DB.Preload("Folder").Where("folder_id = ?", folderID).Order("created_at desc").Find(&files).Error; err != nil {
		utils.Fail(c, "获取失败")
		return
	}

	var resList []map[string]interface{}
	for _, f := range files {
		physicalUrl := "/api/physical/" + url.PathEscape(f.Folder.Name) + "/" + f.FileName
		item := map[string]interface{}{
			"id":            f.ID,
			"original_name": f.OriginalName,
			"file_type":     f.FileType,
			"size":          f.Size,
			"created_at":    f.CreatedAt.Format("2006-01-02 15:04:05"),
			"url":           physicalUrl,
		}
		if f.ThumbName != "" {
			item["thumb_url"] = "/api/thumb/" + f.ThumbName
		}
		resList = append(resList, item)
	}
	utils.Success(c, resList, "获取成功")
}

// MoveFiles 物理跨文件夹移动
func MoveFiles(c *gin.Context) {
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

	// 查出要移动的文件
	var files []model.File
	database.DB.Where("id IN ?", req.FileIDs).Find(&files)

	for _, file := range files {
		// 查出它原本属于哪个文件夹
		var oldFolder model.Folder
		database.DB.First(&oldFolder, file.FolderID)

		// 构建新老物理路径
		oldPath := filepath.Join("storage", oldFolder.Name, file.FileName)
		newPath := filepath.Join("storage", targetFolder.Name, file.FileName)

		// 真实物理移动
		if err := os.Rename(oldPath, newPath); err == nil {
			// 物理移动成功后，才更新数据库
			database.DB.Model(&file).Update("folder_id", req.TargetFolderID)
		}
	}
	utils.Success(c, nil, "物理移动成功")
}

// DeleteFolder 删除文件夹并把文件移回"默认"
func DeleteFolder(c *gin.Context) {
	id := c.Param("id")
	if id == "1" {
		utils.Fail(c, "默认文件夹不可删除")
		return
	}

	var folder model.Folder
	if err := database.DB.First(&folder, id).Error; err != nil {
		utils.Fail(c, "文件夹不存在")
		return
	}

	// 1. 查出该文件夹下所有文件
	var files []model.File
	database.DB.Unscoped().Where("folder_id = ?", id).Find(&files)

	// 2. 物理移回默认文件夹
	for _, file := range files {
		oldPath := filepath.Join("storage", folder.Name, file.FileName)
		newPath := filepath.Join("storage", "默认", file.FileName)
		os.Rename(oldPath, newPath)
	}

	// 3. 删除物理空文件夹
	os.Remove(filepath.Join("storage", folder.Name))

	// 4. 更新数据库
	database.DB.Unscoped().Model(&model.File{}).Where("folder_id = ?", id).Update("folder_id", 1)
	database.DB.Delete(&folder)

	utils.Success(c, nil, "文件夹已删除，物理文件已转移至默认")
}
