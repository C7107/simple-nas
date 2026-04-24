package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Success 成功返回
func Success(c *gin.Context, data interface{}, msg string) {
	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"msg":  msg,
		"data": data,
	})
}

// Fail 业务失败返回 (例如密码错误)
func Fail(c *gin.Context, msg string) {
	c.JSON(http.StatusOK, gin.H{
		"code": 400,
		"msg":  msg,
		"data": nil,
	})
}

// Unauthorized 未授权返回 (例如没登录/Token过期)
func Unauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{
		"code": 401,
		"msg":  "未登录或登录已过期，请重新登录",
		"data": nil,
	})
	c.Abort() // 终止后续操作
}
