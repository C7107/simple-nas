package handler

import (
	"simple-nas-backend/service"
	"simple-nas-backend/utils"

	"github.com/gin-gonic/gin"
)

// UploadFiles 处理多文件上传接口
func UploadFiles(c *gin.Context) {
	// 解析前端发来的 multipart/form-data 表单
	form, err := c.MultipartForm()
	if err != nil {
		utils.Fail(c, "解析表单失败: "+err.Error())
		return
	}

	// 前端上传时，文件的字段名必须叫 "files"
	// 例如 HTML 里是 <input type="file" name="files" multiple>
	files := form.File["files"]
	if len(files) == 0 {
		utils.Fail(c, "没有接收到文件")
		return
	}

	var successCount int
	var failMsgs []string

	// 循环处理用户选中的所有文件
	for _, file := range files {
		err := service.ProcessUpload(c, file)
		if err != nil {
			// 如果某个文件失败了，记录下来，不影响其他文件
			failMsgs = append(failMsgs, file.Filename+": "+err.Error())
		} else {
			successCount++
		}
	}

	// 构造返回给前端的信息
	if len(failMsgs) > 0 {
		utils.Success(c, gin.H{
			"success_count": successCount,
			"fail_count":    len(failMsgs),
			"fail_msgs":     failMsgs,
		}, "部分文件上传完成")
		return
	}

	utils.Success(c, gin.H{
		"success_count": successCount,
	}, "全部文件上传成功！")
}
