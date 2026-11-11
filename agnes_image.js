/* METADATA
{
  "name": "agnes_image",
  "display_name": { "zh": "Agnes 绘图", "en": "Agnes Image" },
  "description": {
    "zh": "使用 Agnes Image 2.5 Flash 文生图、图生图，并把结果保存到本地。",
    "en": "Generate or edit images with Agnes Image 2.5 Flash and save the result locally."
  },
  "category": "Draw",
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
      "name": "generate_image",
      "description": { "zh": "根据文字生成图片并保存到手机。", "en": "Generate an image from text and save it locally." },
      "parameters": [
        { "name": "prompt", "description": { "zh": "图片内容描述", "en": "Image description" }, "type": "string", "required": true },
        { "name": "size", "description": { "zh": "输出尺寸：1K、2K、3K、4K；默认 1K", "en": "Output size: 1K, 2K, 3K, or 4K; default 1K" }, "type": "string", "required": false },
        { "name": "ratio", "description": { "zh": "宽高比，默认 1:1", "en": "Aspect ratio, default 1:1" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "edit_image",
      "description": {
        "zh": "根据提示词编辑参考图。至少提供一个 image_paths 或 image_urls；本地图片会作为 Data URI 发送，无需公开上传。",
        "en": "Edit reference images using a prompt. Provide at least one image_paths or image_urls entry. Local images are sent as data URIs."
      },
      "parameters": [
        { "name": "prompt", "description": { "zh": "要修改什么，以及哪些部分必须保留", "en": "Requested changes and what must remain" }, "type": "string", "required": true },
        { "name": "image_paths", "description": { "zh": "手机上的参考图片绝对路径数组", "en": "Absolute paths of local reference images" }, "type": "array", "required": false },
        { "name": "image_urls", "description": { "zh": "可公开访问的 HTTPS 图片链接数组", "en": "Public HTTPS reference image URLs" }, "type": "array", "required": false },
        { "name": "size", "description": { "zh": "输出尺寸：1K、2K、3K、4K；默认 1K", "en": "Output size: 1K, 2K, 3K, or 4K; default 1K" }, "type": "string", "required": false },
        { "name": "ratio", "description": { "zh": "宽高比，默认 1:1，例如 16:9 或 3:4", "en": "Aspect ratio, default 1:1, e.g. 16:9 or 3:4" }, "type": "string", "required": false }
      ]
    }
  ]
}*/

const agnesImage = (() => {
  const client = OkHttp.newBuilder()
    .connectTimeout(180000)
    .readTimeout(180000)
    .writeTimeout(180000)
    .build();
  const baseDir = getPluginConfigDir("draw");
  const outputDir = `${baseDir}/agnes_image`;
  const allowedSizes = ["1K", "2K", "3K", "4K"];
  const allowedRatios = ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"];

  function toList(value, name) {
    if (value == null || value === "") return [];
    if (typeof value === "string") {
      try { value = JSON.parse(value); }
      catch (_) { value = [value]; }
    }
    if (!Array.isArray(value) || !value.every(x => typeof x === "string")) {
      throw new Error(`${name} 必须是字符串数组。`);
    }
    return value.map(x => x.trim()).filter(Boolean);
  }

  function mimeFor(path) {
    const clean = path.toLowerCase().split("?")[0];
    if (clean.endsWith(".png")) return "image/png";
    if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
    if (clean.endsWith(".webp")) return "image/webp";
    throw new Error(`仅支持 PNG、JPG/JPEG 和 WebP 参考图：${path}`);
  }

  function apiEndpoint() {
    const base = (getEnv("AGNES_API_BASE_URL") || "https://apihub.agnes-ai.com/v1")
      .trim().replace(/\/+$/, "");
    return base.endsWith("/images/generations")
      ? base
      : `${base.endsWith("/v1") ? base : `${base}/v1`}/images/generations`;
  }

  async function makeImage(params, editing) {
    const key = (getEnv("AGNES_API_KEY") || "").trim();
    if (!key) throw new Error("请在包的环境变量中设置 AGNES_API_KEY。");
    const prompt = String(params?.prompt || "").trim();
    if (!prompt) throw new Error("prompt 不能为空。");
    const paths = toList(params.image_paths, "image_paths");
    const urls = toList(params.image_urls, "image_urls");
    if (editing && paths.length + urls.length === 0) {
      throw new Error("至少提供一张参考图：image_paths 或 image_urls。");
    }
    if (!editing && paths.length + urls.length > 0) {
      throw new Error("文生图不接受参考图；需要参考图请调用 edit_image。");
    }
    const size = params.size || "1K";
    const ratio = params.ratio || "1:1";
    if (!allowedSizes.includes(size)) throw new Error(`不支持的 size：${size}`);
    if (!allowedRatios.includes(ratio)) throw new Error(`不支持的 ratio：${ratio}`);

    const images = [];
    for (const path of paths) {
      const mime = mimeFor(path);
      const result = await Tools.Files.readBinary(path);
      const data = result?.contentBase64;
      if (!data) throw new Error(`无法读取参考图：${path}`);
      images.push(`data:${mime};base64,${data}`);
    }
    for (const url of urls) {
      if (!url.startsWith("https://")) throw new Error(`参考图需要公开 HTTPS 链接：${url}`);
      images.push(url);
    }

    const body = {
      model: "agnes-image-2.5-flash",
      prompt,
      size,
      ratio
    };
    if (editing) {
      body.extra_body = { image: images, response_format: "b64_json" };
    } else {
      body.return_base64 = true;
    }
    const request = client.newRequest()
      .url(apiEndpoint())
      .method("POST")
      .headers({
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      })
      .body(JSON.stringify(body), "json");
    const response = await request.build().execute();
    if (!response.isSuccessful()) {
      throw new Error(`Agnes 图片接口返回 HTTP ${response.statusCode}：${String(response.content || "").slice(0, 500)}`);
    }
    let data;
    try { data = JSON.parse(response.content); }
    catch (_) { throw new Error("Agnes 返回的内容不是 JSON。"); }
    const item = data?.data?.[0];
    if (!item) throw new Error("Agnes 响应缺少 data[0]。");

    await Tools.Files.mkdir(baseDir);
    await Tools.Files.mkdir(outputDir);
    const path = `${outputDir}/agnes_${editing ? "edit" : "generate"}_${Date.now()}.png`;
    if (item.b64_json) {
      const base64 = item.b64_json.replace(/^data:[^,]+,/, "");
      const saved = await Tools.Files.writeBinary(path, base64);
      if (!saved.successful) throw new Error(`保存图片失败：${saved.details}`);
    } else if (item.url) {
      const saved = await Tools.Files.download(item.url, path);
      if (!saved.successful) throw new Error(`下载图片失败：${saved.details}`);
    } else {
      throw new Error("Agnes 响应缺少图片数据或链接。");
    }

    const markdown = `![Agnes 图生图结果](file://${path})`;
    return { path, markdown, model: body.model, reference_count: images.length,
      hint: `图片已保存：${path}\n请在回复中输出：${markdown}` };
  }

  async function editImageWrapper(params) {
    try {
      const result = await makeImage(params, true);
      complete({ success: true, message: result.hint, data: result });
    } catch (error) {
      complete({ success: false, message: `图生图失败：${error?.message || error}` });
    }
  }

  async function generateImageWrapper(params) {
    try {
      const result = await makeImage(params, false);
      complete({ success: true, message: result.hint, data: result });
    } catch (error) {
      complete({ success: false, message: `文生图失败：${error?.message || error}` });
    }
  }

  return { edit_image: editImageWrapper, generate_image: generateImageWrapper };
})();

exports.edit_image = agnesImage.edit_image;
exports.generate_image = agnesImage.generate_image;
