package config

const (
	// ServerPort 后端运行端口
	ServerPort = ":8080"

	// HardcodedUsername 固定账号 (你自己用)
	HardcodedUsername = "zzmzsa"
	// HardcodedPassword 固定密码
	HardcodedPassword = "1@2#3@4#5@"

	// JWTSecret 用于生成 Token 的秘钥，随便敲一串乱码即可
	JWTSecret = "my_super_secret_key_for_nas"
)
