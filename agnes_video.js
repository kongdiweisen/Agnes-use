/* METADATA
{
  "name": "agnes_video",
  "display_name": { "zh": "Agnes 视频生成", "en": "Agnes Video" },
  "description": {
    "zh": "使用 Agnes Video 2.5 创建文生视频或图片参考视频任务，查询进度并下载完成的视频。",
    "en": "Create text-to-video or image-guided Agnes Video 2.5 tasks, check progress, and download completed videos."
  },
  "category": "Video",
  "env": [
    {
      "name": "AGNES_API_KEY",
      "description": { "zh": "Agnes API Key", "en": "Agnes API key" },
      "required": true
    },
    {
      "name": "AGNES_API_BASE_URL",
      "description": {
        "zh": "可选。默认为 https://apihub.agnes-ai.com/v1",
        "en": "Optional. Defaults to https://apihub.agnes-ai.com/v1"
      },
      "required": false
    }
  ],
  "tools": [
    {
      "name": "create_video",
      "description": {
        "zh": "创建视频生成任务，返回 video_id；可纯文本生成，也可用公网图片 URL 指定首尾帧或参考图。",
        "en": "Create a video task and return its video_id. Supports text, public-image keyframes, or image references."
      },
      "parameters": [
        { "name": "prompt", "description": { "zh": "场景、动作、运镜和声音描述", "en": "Scene, motion, camera, and audio prompt" }, "type": "string", "required": true },
        { "name": "seconds", "description": { "zh": "时长 4–12 秒，默认 5 秒", "en": "Length, 4–12 seconds; default 5" }, "type": "number", "required": false },
        { "name": "size", "description": { "zh": "720P、1080P、1K、2K；默认 720P", "en": "720P, 1080P, 1K, or 2K; default 720P" }, "type": "string", "required": false },
        { "name": "aspect_ratio", "description": { "zh": "画幅，默认 16:9", "en": "Aspect ratio; default 16:9" }, "type": "string", "required": false },
        { "name": "first_frame", "description": { "zh": "可选：公开 HTTPS 首帧图片 URL", "en": "Optional public HTTPS first-frame image URL" }, "type": "string", "required": false },
        { "name": "last_frame", "description": { "zh": "可选：公开 HTTPS 尾帧图片 URL", "en": "Optional public HTTPS last-frame image URL" }, "type": "string", "required": false },
        { "name": "image_urls", "description": { "zh": "可选：公开 HTTPS 参考图片 URL 数组；不能与首尾帧同时使用", "en": "Optional public HTTPS reference image URLs; cannot be combined with keyframes" }, "type": "array", "required": false }
      ]
    },
    {
      "name": "check_video",
      "description": {
        "zh": "根据 video_id 查询任务；完成后自动下载 MP4 到本地。",
        "en": "Check a task by video_id; download the MP4 when complete."
      },
      "parameters": [
        { "name": "video_id", "description": { "zh": "create_video 返回的 video_id", "en": "video_id returned by create_video" }, "type": "string", "required": true }
      ]
    }
  ]
}*/

const agnesVideo = (() => {
  const model = "agnes-video-2.5";
  const client = OkHttp.newBuilder()
    .connectTimeout(60000)
    .readTimeout(60000)
    .writeTimeout(60000)
    .build();
  const baseDir = getPluginConfigDir("video");
  const outputDir = `${baseDir}/agnes_video`;
  const sizes = ["720P", "1080P", "1K", "2K"];
  const ratios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

  function key() {
    const value = (getEnv("AGNES_API_KEY") || "").trim();
    if (!value) throw new Error("请在包的环境变量中设置 AGNES_API_KEY。");
    return value;
  }

  function baseUrl() {
    const value = (getEnv("AGNES_API_BASE_URL") || "https://apihub.agnes-ai.com/v1")
      .trim().replace(/\/+$/, "");
    if (!value.endsWith("/v1")) {
      throw new Error("AGNES_API_BASE_URL 应以 /v1 结尾，例如 https://apihub.agnes-ai.com/v1。");
    }
    return value;
  }

  function httpsUrl(value, name) {
    const text = String(value || "").trim();
    if (text && !text.startsWith("https://")) {
      throw new Error(`${name} 必须是 Agnes 可公开访问的 HTTPS 链接。`);
    }
    return text;
  }

  function urlList(value) {
    if (value == null || value === "") return [];
    if (typeof value === "string") {
      try { value = JSON.parse(value); }
      catch (_) { value = [value]; }
    }
    if (!Array.isArray(value) || !value.every(x => typeof x === "string")) {
      throw new Error("image_urls 必须是字符串数组。");
    }
    return value.map((x, i) => httpsUrl(x, `image_urls[${i}]`)).filter(Boolean);
  }

  async function request(url, method, body) {
    const builder = client.newRequest()
      .url(url)
      .method(method)
      .headers({
        "Accept": "application/json",
        "Authorization": `Bearer ${key()}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      });
    if (body) builder.body(JSON.stringify(body), "json");
    const response = await builder.build().execute();
    if (!response.isSuccessful()) {
      throw new Error(`Agnes 视频接口返回 HTTP ${response.statusCode}：${String(response.content || "").slice(0, 500)}`);
    }
    try { return JSON.parse(response.content); }
    catch (_) { throw new Error("Agnes 返回的内容不是 JSON。"); }
  }

  async function createVideo(params) {
    const prompt = String(params?.prompt || "").trim();
    if (!prompt) throw new Error("prompt 不能为空。");
    const seconds = Number(params.seconds == null ? 5 : params.seconds);
    if (!Number.isInteger(seconds) || seconds < 4 || seconds > 12) {
      throw new Error("seconds 必须是 4–12 的整数。");
    }
    const size = params.size || "720P";
    const aspect = params.aspect_ratio || "16:9";
    if (!sizes.includes(size)) throw new Error(`不支持的 size：${size}`);
    if (!ratios.includes(aspect)) throw new Error(`不支持的 aspect_ratio：${aspect}`);
    const first = httpsUrl(params.first_frame, "first_frame");
    const last = httpsUrl(params.last_frame, "last_frame");
    const images = urlList(params.image_urls);
    if (images.length > 8) throw new Error("最多提供 8 张参考图片。");
    if ((first || last) && images.length) {
      throw new Error("首尾帧与 image_urls 不能同时使用。");
    }

    const mode = (first || last) ? "keyframe" : images.length ? "reference" : "text";
    const body = {
      model, prompt, seconds: String(seconds), mode, size,
      aspect_ratio: aspect
    };
    if (mode === "keyframe") {
      if (first) body.first_frame = first;
      if (last) body.last_frame = last;
    }
    if (mode === "reference") body.images = images;

    const data = await request(`${baseUrl()}/videos`, "POST", body);
    const videoId = data.video_id;
    if (!videoId) throw new Error("创建任务成功，但响应缺少 video_id。");
    return {
      video_id: videoId,
      task_id: data.task_id || data.id || null,
      mode,
      status: data.status || "queued",
      hint: `视频任务已创建，video_id=${videoId}。稍后调用 agnes_video:check_video 查询进度。`
    };
  }

  async function checkVideo(params) {
    const videoId = String(params?.video_id || "").trim();
    if (!videoId) throw new Error("video_id 不能为空。");
    const root = baseUrl().slice(0, -3);
    const url = `${root}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`;
    const data = await request(url, "GET");
    const status = data.status || "unknown";
    if (status === "failed") {
      const reason = data.error?.message || JSON.stringify(data.error || "未知原因");
      throw new Error(`视频任务失败：${reason}`);
    }
    if (status !== "completed") {
      return { video_id: videoId, status, progress: data.progress ?? null,
        hint: `当前状态：${status}，进度：${data.progress ?? "未知"}%。稍后再调用 agnes_video:check_video。` };
    }
    const videoUrl = httpsUrl(data.url, "生成结果 URL");
    if (!videoUrl) throw new Error("任务已完成，但响应缺少视频 URL。");
    await Tools.Files.mkdir(baseDir);
    await Tools.Files.mkdir(outputDir);
    const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${outputDir}/${safeId}.mp4`;
    const existing = await Tools.Files.exists(path);
    if (!existing.exists) {
      const saved = await Tools.Files.download(videoUrl, path);
      if (!saved.successful) throw new Error(`视频下载失败：${saved.details}`);
    }
    return { video_id: videoId, status, progress: 100, url: videoUrl, path,
      markdown: `[播放或保存 Agnes 视频](file://${path})`,
      hint: `视频已保存：${path}\n可在回复中输出：[播放或保存 Agnes 视频](file://${path})` };
  }

  async function wrap(fn, params) {
    try {
      const result = await fn(params);
      complete({ success: true, message: result.hint, data: result });
    } catch (error) {
      complete({ success: false, message: `视频生成失败：${error?.message || error}` });
    }
  }

  return {
    create_video: params => wrap(createVideo, params),
    check_video: params => wrap(checkVideo, params)
  };
})();

exports.create_video = agnesVideo.create_video;
exports.check_video = agnesVideo.check_video;
