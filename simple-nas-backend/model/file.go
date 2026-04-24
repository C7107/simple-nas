package model

import (
	"time"

	"gorm.io/gorm"
)

// Folder 文件夹表
type Folder struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"size:255;uniqueIndex"` // 文件夹名字，不能重复
	CreatedAt time.Time
}

// File 对应数据库中的 files 表
type File struct {
	ID           uint           `gorm:"primaryKey"`
	FolderID     uint           `gorm:"default:1"`
	Folder       Folder         `gorm:"foreignKey:FolderID"`
	OriginalName string         `gorm:"size:255"`             // 原始文件名 (例如: 我的小猫.jpg)
	FileName     string         `gorm:"size:255;uniqueIndex"` // 存到硬盘的名字 (例如: 1699991234.jpg)
	FileType     string         `gorm:"size:50"`              // 文件类型 (image / video)
	Size         int64          // 文件大小 (字节)
	ThumbName    string         `gorm:"size:255"`      // 视频封面的文件名 (图片则为空)
	IsRead       bool           `gorm:"default:false"` // 【新增】：是否已刷过 (默认未刷)
	CreatedAt    time.Time      // 上传时间
	DeletedAt    gorm.DeletedAt `gorm:"index"` // 【新增：核心软删除标志】
}
