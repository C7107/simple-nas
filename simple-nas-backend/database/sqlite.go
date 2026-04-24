package database

import (
	"log"
	"simple-nas-backend/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB() {
	var err error
	// 连接 SQLite，文件名为 nas.db，不存在会自动创建
	DB, err = gorm.Open(sqlite.Open("nas.db"), &gorm.Config{})
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}

	log.Println("SQLite 数据库连接成功！")

	// 自动迁移 (自动创建表结构)
	err = DB.AutoMigrate(&model.File{}, &model.Folder{})
	if err != nil {
		log.Fatalf("数据库表迁移失败: %v", err)
	}

	// 【新增】：初始化创建 ID 为 1 的 "默认" 文件夹
	var defaultFolder model.Folder
	if err := DB.FirstOrCreate(&defaultFolder, model.Folder{ID: 1, Name: "默认"}).Error; err != nil {
		log.Fatalf("初始化默认文件夹失败: %v", err)
	}
	log.Println("数据库表结构初始化成功！")
}
