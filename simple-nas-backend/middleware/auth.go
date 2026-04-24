package middleware

import (
	"strings"

	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

func JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// 1. 先尝试从 Header 取
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		// 2. 如果 Header 里没有，尝试从 URL Query 取 (专门为了 <img> 和 <video> 标签准备的)
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		// 3. 还是没有，直接拦截
		if tokenString == "" {
			utils.Unauthorized(c)
			return
		}

		// 4. 校验 Token 真伪
		claims, err := utils.ParseToken(tokenString)
		if err != nil {
			utils.Unauthorized(c)
			return
		}

		// 放行
		c.Set("username", claims.Username)
		c.Next()
	}
}
