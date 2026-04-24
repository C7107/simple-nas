package handler

import (
	"net/url"
	"path/filepath"
	"strconv"

	"simple-nas-backend/database"
	"simple-nas-backend/model"
	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

func ListFiles(c *gin.Context) {
	var files []model.File
	// 【核心修复 Bug2】：用 Preload 提前查出 Folder
	database.DB.Preload("Folder").Order("created_at desc").Find(&files)

	var resList []map[string]interface{}
	for _, f := range files {
		// 【提速秘诀】：直接把物理文件夹名字写进 URL 里发给前端
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

func VideoFeed(c *gin.Context) {
	sizeStr := c.DefaultQuery("size", "3")
	size, _ := strconv.Atoi(sizeStr)

	var videos []model.File
	err := database.DB.Preload("Folder").Where("file_type = ? AND is_read = ?", "video", false).
		Order("RANDOM()").
		Limit(size).
		Find(&videos).Error

	if err != nil || len(videos) == 0 {
		utils.Success(c, []interface{}{}, "所有视频已刷完")
		return
	}

	var resList []map[string]interface{}
	var idsToUpdate []uint
	for _, f := range videos {
		physicalUrl := "/api/physical/" + url.PathEscape(f.Folder.Name) + "/" + f.FileName
		item := map[string]interface{}{
			"id":            f.ID,
			"original_name": f.OriginalName,
			"url":           physicalUrl,
		}
		if f.ThumbName != "" {
			item["thumb_url"] = "/api/thumb/" + f.ThumbName
		}
		resList = append(resList, item)
		idsToUpdate = append(idsToUpdate, f.ID)
	}

	database.DB.Model(&model.File{}).Where("id IN ?", idsToUpdate).Update("is_read", true)
	utils.Success(c, resList, "获取视频流成功")
}

func DeleteFile(c *gin.Context) {
	id := c.Param("id")
	var file model.File
	if err := database.DB.First(&file, id).Error; err != nil {
		utils.Fail(c, "文件不存在")
		return
	}
	database.DB.Delete(&file)
	utils.Success(c, nil, "已移至回收站")
}

// ===============================================
// 极速读取接口：直接通过 URL 截取路径读取硬盘，零查库！
// ===============================================
func ServeFastPhysical(c *gin.Context) {
	folderName, _ := url.PathUnescape(c.Param("folder"))
	fileName := c.Param("name")
	c.File(filepath.Join("storage", folderName, fileName))
}

func ServeFastThumb(c *gin.Context) {
	fileName := c.Param("name")
	c.File(filepath.Join("storage/thumbs", fileName))
}
