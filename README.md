# Agnes-use：Operit 图片与视频工具

本仓库提供两个可导入 Operit 的普通 JS 沙盒包：

| 文件 | 包名 | 工具 | 用途 |
| --- | --- | --- | --- |
| `agnes_image.js` | `agnes_image` | `generate_image`、`edit_image` | 文生图、图生图、多图合成 |
| `agnes_video.js` | `agnes_video` | `create_video`、`check_video` | 文生视频、图片参考视频、任务查询和下载 |

图片使用 `agnes-image-2.5-flash`，视频使用 `agnes-video-2.5`。两个包都只从 Operit 的包环境变量读取 API Key，仓库不包含密钥。

## 安装

1. 在手机上下载这两个 `.js` 文件。
2. 打开 Operit 的「包管理 → Packages」，分别从本地文件导入并启用。
3. 在**两个包各自的环境变量**里填入 `AGNES_API_KEY`。如果账号使用其他兼容网关，还要在对应包中设置 `AGNES_API_BASE_URL`；默认是 `https://apihub.agnes-ai.com/v1`。
4. 确保聊天模型可以调用 `use_package`。可以先让 Operit 调用 `use_package("agnes_image")` 或 `use_package("agnes_video")`，再调用对应工具。

不要把密钥写进 JS 文件、GitHub 仓库或聊天消息。

## 图片工具

### 文生图

调用 `agnes_image:generate_image`：

```json
{
  "prompt": "雨后城市街道的夜景，电影级写实风格，霓虹灯倒影",
  "size": "1K",
  "ratio": "16:9"
}
```

### 图生图

调用 `agnes_image:edit_image`，至少提供一个手机本地路径或公开 HTTPS 图片链接：

```json
{
  "prompt": "把背景改成夜景，保留人物、姿势和原来的构图",
  "image_paths": ["/sdcard/Download/input.png"],
  "size": "1K",
  "ratio": "3:4"
}
```

也可以把 `image_paths` 换成 `image_urls`，或者传多张参考图做合成。聊天附件需要先保存成手机文件，才能使用 `image_paths`。本地图片会作为 Data URI 发送给 Agnes，无需先上传到公开图床。输出保存到 Operit 的绘图插件目录，并返回本地路径和 Markdown 图片链接。

Agnes 图片接口为 `POST /v1/images/generations`；图生图的参考图放在 `extra_body.image`。Operit 自带的 OpenAI 绘图包使用 `/v1/images/edits`，因此不能只替换模型名来调用 Agnes 图生图。

## 视频工具

### 创建任务

文生视频调用 `agnes_video:create_video`：

```json
{
  "prompt": "雨后的未来城市街道，一辆银色跑车缓慢驶过，镜头平稳跟拍",
  "seconds": 5,
  "size": "720P",
  "aspect_ratio": "16:9"
}
```

若要让图片成为首帧，额外传 `first_frame`；需要尾帧时传 `last_frame`。若要参考图片内容或风格，传 `image_urls` 数组。两种方式不能混用。**视频参考图必须是 Agnes 服务可访问的公网 HTTPS 链接**；手机本地路径不能直接用于视频工具。

视频任务创建后会返回 `video_id`。该 ID 与 `task_id` 不同，查询时请使用 `video_id`。

### 查询并下载

稍后调用 `agnes_video:check_video`：

```json
{ "video_id": "video_实际返回的ID" }
```

若仍在生成，工具返回状态和进度；完成后自动下载 MP4 到 Operit 的视频插件目录。两步调用可避免手机切后台时长时间占用一次工具调用。不要使用短间隔连续查询。

## 模型与费用

图片模型和视频模型是否可用、价格及额度以 Agnes 当前官方页面为准。**视频接口按分辨率和时长计费**；创建视频任务前请确认账户额度和预期费用。本项目未使用真实账户在 Android 设备上调用 API，已做 JS 语法与元数据检查。

## 接口资料

- [Agnes Image 2.5 Flash](https://wiki.agnes-ai.com/zh-Hans/docs/agnes-image-25-flash)
- [Agnes Video 2.5](https://wiki.agnes-ai.com/zh-Hans/docs/agnes-video-25)
- [Operit 动态工具包说明](https://github.com/AAswordman/OperitWeb/blob/main/public/content/zh/tools-and-features/ai-tools/overview.md)
