package handler

import (
	"simple-nas-backend/config"
	"simple-nas-backend/database"
	"simple-nas-backend/model"
	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

// LoginReq 接收前端 JSON 数据的结构体
type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login 登录逻辑
func Login(c *gin.Context) {
	var req LoginReq

	// 解析前端传来的 JSON
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, "参数错误，请输入账号和密码")
		return
	}

	// 校验账号密码（和 config 里面写死的对比）
	if req.Username != config.HardcodedUsername || req.Password != config.HardcodedPassword {
		utils.Fail(c, "账号或密码错误！")
		return
	}

	// 账号密码正确，生成 Token
	token, err := utils.GenerateToken(req.Username)
	if err != nil {
		utils.Fail(c, "生成 Token 失败")
		return
	}

	database.DB.Model(&model.File{}).Where("file_type = ?", "video").Update("is_read", false)

	// 返回 Token 给前端
	utils.Success(c, gin.H{
		"token": token,
	}, "登录成功，视频流重置成功！")
}
