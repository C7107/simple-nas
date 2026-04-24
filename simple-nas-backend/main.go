package main

import (
	"log"
	"os"

	"simple-nas-backend/config"
	"simple-nas-backend/database"
	"simple-nas-backend/router"
	"simple-nas-backend/service"
)

func main() {
	// 1. 初始化物理基础目录
	initStorageDirs()

	// 2. 初始化数据库
	database.InitDB()

	// 3. 启动时：物理文件扫描与数据库全量同步
	service.SyncStorageAndDB()

	// 4. 初始化路由
	r := router.InitRouter()

	log.Printf("后端服务已启动，监听端口 %s\n", config.ServerPort)
	if err := r.Run(config.ServerPort); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}

func initStorageDirs() {
	// 真正的物理文件夹，"默认" 文件夹对应 ID=1
	dirs := []string{
		"storage/默认",
		"storage/thumbs",
		"storage/文本文档",
		"storage/网页文件",
	}

	for _, dir := range dirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			err := os.MkdirAll(dir, os.ModePerm)
			if err != nil {
				log.Fatalf("创建目录 %s 失败: %v", dir, err)
			}
			log.Printf("成功创建目录: %s\n", dir)
		}
	}
}
