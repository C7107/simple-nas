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
	DB, err = gorm.Open(sqlite.Open("nas.db"), &gorm.Config{})
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}

	log.Println("SQLite 数据库连接成功！")

	err = DB.AutoMigrate(&model.File{}, &model.Folder{})
	if err != nil {
		log.Fatalf("数据库表迁移失败: %v", err)
	}

	var defaultFolder model.Folder
	if err := DB.FirstOrCreate(&defaultFolder, model.Folder{ID: 1, Name: "默认"}).Error; err != nil {
		log.Fatalf("初始化默认文件夹失败: %v", err)
	}

	DB.FirstOrCreate(&model.Folder{}, model.Folder{Name: "文本文档"})
	DB.FirstOrCreate(&model.Folder{}, model.Folder{Name: "网页文件"})

	log.Println("数据库表结构初始化成功！")
}
