package service

import (
	"log"
	"os"
	"path/filepath"

	"simple-nas-backend/database"
	"simple-nas-backend/model"
	"simple-nas-backend/utils"
)

// SyncStorageAndDB 双向完美同步
func SyncStorageAndDB() {
	log.Println("开始执行物理文件与数据库全量同步...")

	// ========================================================
	// 1. 扫描所有的数据库文件夹，如果物理目录没对应上，把库里的删了
	// ========================================================
	var dbFolders []model.Folder
	database.DB.Find(&dbFolders)
	for _, folder := range dbFolders {
		folderPath := filepath.Join("storage", folder.Name)
		if _, err := os.Stat(folderPath); os.IsNotExist(err) {
			if folder.ID != 1 { // 默认文件夹永远不删
				log.Printf("🗑️ 发现被电脑删除的文件夹: %s，正在清理数据库...", folder.Name)

				// 级联清理底下的文件记录和封面图
				var filesInFolder []model.File
				database.DB.Unscoped().Where("folder_id = ?", folder.ID).Find(&filesInFolder)

				for _, f := range filesInFolder {
					if f.FileType == "video" && f.ThumbName != "" {
						os.Remove(filepath.Join("storage/thumbs", f.ThumbName))
					}
					database.DB.Unscoped().Delete(&f)
				}

				// 【核心修复】：强制指定 ID 彻底删除文件夹，拒绝 GORM 传参失效！
				database.DB.Unscoped().Where("id = ?", folder.ID).Delete(&model.Folder{})
				log.Printf("✅ 文件夹 %s 数据库记录已彻底抹除", folder.Name)
			}
		}
	}

	// ========================================================
	// 2. 扫描物理硬盘所有的子目录，新增的入库
	// ========================================================
	entries, _ := os.ReadDir("storage")
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == "thumbs" {
			continue
		}

		folderName := entry.Name()
		var folder model.Folder
		database.DB.FirstOrCreate(&folder, model.Folder{Name: folderName})

		scanFilesInDir(folder.ID, folderName)
	}

	// ========================================================
	// 3. 反向检查：如果数据库里的文件在硬盘里找不到了，清理库
	// ========================================================
	var allFiles []model.File
	database.DB.Unscoped().Find(&allFiles)
	for _, file := range allFiles {
		var folder model.Folder
		// 【安全保护】：先查一下这个文件所属的文件夹还在不在
		err := database.DB.First(&folder, file.FolderID).Error

		var filePath string
		if err != nil {
			// 如果连爹（文件夹）都没了，那它必定是幽灵文件，强行触发删除
			filePath = "invalid_ghost_path_force_delete"
		} else {
			filePath = filepath.Join("storage", folder.Name, file.FileName)
		}

		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			log.Printf("🗑️ 发现被电脑删除的文件: %s，已清理数据库", file.FileName)

			// 幽灵清理：同步删除废弃封面图
			if file.FileType == "video" && file.ThumbName != "" {
				thumbPath := filepath.Join("storage/thumbs", file.ThumbName)
				err := os.Remove(thumbPath)
				if err == nil {
					log.Printf("🧹 幽灵清理：已同步删除废弃封面图 %s", file.ThumbName)
				}
			}

			// 彻底从数据库抹除
			database.DB.Unscoped().Delete(&file)
		}
	}

	log.Println("物理全量同步完成！")
}

func scanFilesInDir(folderID uint, folderName string) {
	dirPath := filepath.Join("storage", folderName)
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		fileName := entry.Name()
		filePath := filepath.Join(dirPath, fileName)

		var file model.File
		err := database.DB.Unscoped().Where("file_name = ?", fileName).First(&file).Error

		if err != nil {
			// 情况 1：库里没有，电脑拉进去的新文件
			ext := filepath.Ext(fileName)
			fileType := utils.GetFileType(ext)
			if fileType == "unknown" {
				continue
			}

			info, _ := entry.Info()
			newRecord := model.File{
				FolderID:     folderID,
				OriginalName: fileName,
				FileName:     fileName,
				FileType:     fileType,
				Size:         info.Size(),
				IsRead:       false,
				CreatedAt:    info.ModTime(),
			}

			if fileType == "video" {
				thumbName := fileName + ".jpg"
				thumbPath := filepath.Join("storage/thumbs", thumbName)
				utils.GenerateVideoThumb(filePath, thumbPath)
				newRecord.ThumbName = thumbName
			}
			database.DB.Create(&newRecord)
			log.Printf("✨ 电脑新增文件入库: %s -> %s\n", folderName, fileName)

		} else {
			// 情况 2：库里有这个文件，但被电脑跨文件夹移动了
			if file.FolderID != folderID {
				database.DB.Unscoped().Model(&file).Update("folder_id", folderID)
				log.Printf("🔄 发现电脑移动了文件: %s，已更新至 -> %s\n", fileName, folderName)
			}
		}
	}
}
