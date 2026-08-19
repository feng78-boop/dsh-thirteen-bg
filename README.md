# dsh-thirteen-bg

DeepSeek Harness Web GUI 动态背景插件（live wallpaper），by 十三 / thirteen。

支持 **GIF / 动图 WebP / APNG** 图片，以及 **MP4 / WebM / MOV 视频**背景——
格式自动识别：上传或填 URL 时按扩展名/MIME 判断，视频走 `<video>` 层
（静音循环、硬件加速、切后台自动暂停），图片走 CSS `background-image`。
纯客户端插件，设置存于浏览器 localStorage，上传文件存 IndexedDB（不限大小）。

## Demo

<video src="assets/demo.mp4" poster="assets/demo-poster.jpg" controls muted loop width="100%"></video>

*15 秒实拍：DeepSeek Harness Web 界面 + 动态背景效果。*

## 安装

```sh
dsh plugin --profile web add <本目录的绝对路径>
# 例如（本地路径安装）
dsh plugin --profile web add C:\Users\fhd19\deepseek_harness\dsh-thirteen-bg
# 发布到 npm 后
dsh plugin --profile web add dsh-thirteen-bg
```

装完后**重启 dsh web** 生效（或直接刷新浏览器——客户端代码改动刷新即生效）。重启后：

1. 浏览器硬刷新（Ctrl+F5）
2. 「设置」→ 通用 → 找到 **动态背景** 卡片
3. 上传本地动图/视频（**不限大小**，存 IndexedDB），或粘贴 http(s) 媒体 URL，调节压暗程度

> ⚠️ 本地文件路径（如 `C:\...` 或 `file:///...`）**不能**作为 URL 使用——浏览器会拦截。
> 本地媒体请用「上传」按钮；远程媒体才填 URL。

## 媒体标准

| 类型 | 建议 |
|---|---|
| 图片动图 | GIF / 动图 **WebP**（推荐）/ APNG；长边 ≤ 1920px；8–20 秒无缝循环 |
| 视频 | **MP4（H.264）**或 **WebM（VP9）**；1080p 足够；10–60 秒（`loop` 自动循环，无需首尾无缝） |
| 通用 | 深色/低饱和为主（背景后有文字，插件自带「压暗」滑块）；体积建议 ≤ 几十 MB 保证流畅 |

## 压缩工具

- 动图：ffmpeg `ffmpeg -i in.mp4 -vf "scale=1920:-1,fps=15,format=rgba" -loop 0 out.webp`；[Squoosh](https://squoosh.app)
- 视频：ffmpeg `ffmpeg -i in.mov -vf "scale=1920:-1" -c:v libx264 -crf 23 -an out.mp4`

## 与其它皮肤插件共存

背景层是**真实元素**（`position:fixed; z-index:-1` 的 div / video），挂在
`<html>` 下，不占用 `html::before/::after` 伪元素，因此与
`dsh-client-ui-skins`、`dsh-dream-skin` 等用伪元素做背景的皮肤**零冲突**：
本插件层按 DOM 顺序绘制在皮肤层之上，动态背景始终可见；关闭本插件即恢复静态皮肤。
