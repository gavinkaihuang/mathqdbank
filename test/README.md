# 本地 Gemma OCR 测试说明

这个目录用于验证本地多模态模型对“一本涂书”页面图片的识别效果，并将结果导出为 JSON，方便和在线模型结果做对比。

## 目录说明

```text
test/
├── README.md
├── run_local_gemma_ocr.py
├── images/
│   └── .gitkeep
└── output/
    └── .gitkeep
```

- `images/`: 放待识别的一本涂书页面图片
- `output/`: 脚本输出的 JSON 结果目录
- `run_local_gemma_ocr.py`: 调用本地 Gemma 模型进行识别的测试脚本

## 当前实现方式

当前脚本默认按下面的本地推理方式工作：

- 本地推理服务：Ollama
- 默认接口地址：`http://127.0.0.1:11434`
- 默认模型名：`gemma3:latest`

脚本会：

1. 读取指定图片，或扫描 `test/images/` 下所有图片
2. 调用本地 Gemma 多模态模型
3. 按当前项目线上 OCR 的输出结构解析结果
4. 将每张图片的结果保存为一个独立 JSON 文件到 `test/output/`

## 一、安装并启动本地 Gemma 模型

### 1. 安装 Ollama

如果本机还没有安装 Ollama，可以先安装：

```bash
brew install ollama
```

如果你已经装好了，可以跳过这一步。

### 2. 启动 Ollama 服务

```bash
ollama serve
```

默认会监听：

```text
http://127.0.0.1:11434
```

你需要保持这个服务在后台运行。

### 3. 拉取本地 Gemma 多模态模型

先确认你准备测试的模型支持图片输入。

一个常见示例是：

```bash
ollama pull gemma3:latest
```

如果你本地用的是其他变体，也可以替换成你实际的模型名，例如：

```bash
ollama pull gemma3:12b
```

拉取完成后，可以查看本地模型列表：

```bash
ollama list
```

## 二、准备测试图片

将一本涂书的页面图片放到：

[images](./images)

例如：

```text
test/images/page_0011.jpg
test/images/page_0012.jpg
```

支持的图片类型包括：

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`
- `.bmp`
- `.gif`
- `.tiff`

## 三、运行识别脚本

### 方式 1：处理 `test/images/` 下全部图片

在项目根目录执行：

```bash
python test/run_local_gemma_ocr.py
```

执行后会自动扫描 `test/images/` 下所有图片，并将结果输出到：

[output](./output)

### 方式 2：只处理指定图片

```bash
python test/run_local_gemma_ocr.py test/images/page_0011.jpg
```

也可以一次指定多张：

```bash
python test/run_local_gemma_ocr.py test/images/page_0011.jpg test/images/page_0012.jpg
```

### 方式 3：指定本地模型名

如果你本地不是 `gemma3:latest`，可以手动指定：

```bash
python test/run_local_gemma_ocr.py test/images/page_0011.jpg --model gemma3:12b
```

### 方式 4：指定本地服务地址

如果你的 Ollama 不是跑在默认地址：

```bash
python test/run_local_gemma_ocr.py test/images/page_0011.jpg --base-url http://127.0.0.1:11434
```

### 方式 5：自定义输出目录

```bash
python test/run_local_gemma_ocr.py test/images/page_0011.jpg --output-dir test/output_local
```

## 四、输出结果说明

每张图片会生成一个单独的 JSON 文件，文件名与图片名对应。

例如：

```text
test/images/page_0011.jpg
test/output/page_0011.json
```

输出 JSON 结构会尽量对齐当前线上 OCR 的结构：

```json
{
  "items": [
    {
      "content_type": "TIP",
      "latex_content": "...",
      "expert_note": "..."
    }
  ],
  "questions": [
    {
      "body": "...",
      "solution": "...",
      "difficulty": 1
    }
  ]
}
```

## 五、常见问题

### 1. 报错 `Connection refused`

说明本地 Ollama 服务没有启动。

先执行：

```bash
ollama serve
```

### 2. 报错 `model not found`

说明本地还没有拉取对应模型。

执行：

```bash
ollama pull gemma3:latest
```

或者改成你本地实际存在的模型名。

### 3. 能运行，但输出不是合法 JSON

说明本地模型没有稳定按要求输出结构化结果。

可以尝试：

1. 更大的 Gemma 模型版本
2. 重跑同一张图做稳定性比较
3. 后续增加结果清洗或字段修复逻辑

## 六、建议的测试流程

建议你这样做对比：

1. 先在 `test/images/` 放 5 到 10 张典型页面图片
2. 用本地 Gemma 跑一轮，生成 `test/output/*.json`
3. 再和线上 Gemini 的结果按页对比
4. 重点观察：公式 LaTeX、红笔批注、知识点分类、题目完整度

## 七、补充说明

当前脚本是一个独立测试工具，不会写数据库，也不会走线上任务表流程。

它只做两件事：

1. 调用本地模型识别图片
2. 保存 JSON 结果，便于人工对比
