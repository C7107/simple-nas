package router

import (
	"net/http"
	"simple-nas-backend/handler"
	"simple-nas-backend/middleware"

	"github.com/gin-gonic/gin"
)

func InitRouter() *gin.Engine {
	r := gin.Default()
	r.Use(corsMiddleware())

	// ============ 公开接口 (不需要登录就能访问) ============

	// 1. 测试后端连通性 (前端第一个页面用)
	r.GET("/api/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"code": 200, "msg": "连接后端成功！", "data": nil})
	})

	// 2. 登录接口
	r.POST("/api/login", handler.Login)

	// ============ 受保护接口 (必须带 Token 才能访问) ============

	// 创建一个路由组，并使用我们的 JWTAuth 中间件
	authGroup := r.Group("/api")
	authGroup.Use(middleware.JWTAuth())
	{
		// 这是一个测试接口：如果没带 Token 访问，会被拦截；带了才返回秘密信息
		authGroup.GET("/secret", func(c *gin.Context) {
			username, _ := c.Get("username")
			c.JSON(http.StatusOK, gin.H{
				"code": 200,
				"msg":  "验证通过！看到这句话说明你已经登录了",
				"data": "当前用户: " + username.(string),
			})
		})

		// ======= 【新增：上传接口】 =======
		// 前端发起 POST 请求到 /api/upload
		authGroup.POST("/upload", handler.UploadFiles)

		// ======= 【新增：文件列表与文件流】 =======
		// 1. 获取相册列表
		authGroup.GET("/files", handler.ListFiles)

// ======= 【极速文件流读取接口 (0查库优化)】 =======
		authGroup.GET("/physical/:folder/:name", handler.ServeFastPhysical)
		authGroup.GET("/thumb/:name", handler.ServeFastThumb)

		// ======= 【新增：抖音式视频流】 =======
		authGroup.GET("/videos/feed", handler.VideoFeed)

		// ======= 【新增：删除文件】 =======
		authGroup.DELETE("/file/:id", handler.DeleteFile)

		// ======= 【新增：文件管理系统 API】 =======
		// 1. 新建文件夹
		authGroup.POST("/folder", handler.CreateFolder)
		// 2. 获取文件夹列表
		authGroup.GET("/folders", handler.ListFolders)
		// 3. 获取某个文件夹下的文件
		authGroup.GET("/folder/:id/files", handler.GetFolderFiles)
		// 4. 批量移动文件 (传 JSON 格式)
		authGroup.PUT("/file/move", handler.MoveFiles)
		// 5. 删除文件夹 (如果文件夹里有文件了，先把它们移到默认文件夹再删)
		authGroup.DELETE("/folder/:id", handler.DeleteFolder)

		// ======= 【回收站专属 API】 =======
		authGroup.GET("/trash", handler.GetTrashFiles)                     // 扫盘读取回收站
		authGroup.POST("/trash/restore", handler.RestoreTrash)             // 恢复文件到指定文件夹
		authGroup.DELETE("/trash/permanent", handler.PermanentDeleteTrash) // 永久删除回收站文件
	}

	return r
}

// corsMiddleware 跨域配置保持不变
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, UPDATE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length, Access-Control-Allow-Origin")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
