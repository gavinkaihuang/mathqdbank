# MathQBank

MathQBank 是一个测试用的独立题库后端微服务，当前仓库提供的是基于 FastAPI 的可运行骨架。

## 技术栈

- Python 3.13
- FastAPI
- Uvicorn
- SQLAlchemy
- PostgreSQL
- pydantic-settings

## 项目结构

```text
MathQBank/
├── app/
│   ├── api/
│   ├── core/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── main.py
├── .env.example
├── Dockerfile
├── README.md
└── requirements.txt
```

## 本地启动

1. 创建并激活 Python 3.13 虚拟环境。

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. 安装依赖：

```bash
pip install -r requirements.txt
```

3. 创建环境变量文件：

```bash
cp .env.example .env
```

4. 启动服务：

```bash
uvicorn app.main:app --reload
```

5. 执行数据库迁移：

```bash
alembic upgrade head
```

默认访问地址：

- 应用: http://127.0.0.1:8000
- 健康检查: http://127.0.0.1:8000/ping

## 环境变量

- `DATABASE_URL`: PostgreSQL 连接字符串
- `LLM_DEBUG_ENABLED`: 是否开启大模型调试日志（true/false）
- `LLM_DEBUG_MAX_TEXT_CHARS`: 调试日志中响应文本最大长度（超出将截断）

开启后会在服务日志中输出：

- LLM 请求地址（API Key 已脱敏）
- 请求参数（图片 base64 仅输出长度和预览）
- 响应状态码与响应体截断内容

示例：

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/mathqbank
LLM_DEBUG_ENABLED=false
LLM_DEBUG_MAX_TEXT_CHARS=3000
```

## Docker 运行

构建镜像：

```bash
docker build -t mathqbank:latest .
```

启动容器：

```bash
docker run --rm -p 8000:8000 --env-file .env mathqbank:latest
```

## 当前能力

- 提供 FastAPI 应用入口
- 提供基础配置加载
- 提供 SQLAlchemy 数据库连接初始化
- 提供健康检查接口 `/ping`
- 提供 Alembic 数据库迁移入口


API 文档（Swagger UI）：http://127.0.0.1:8000/docs
备用文档（ReDoc）：http://127.0.0.1:8000/redoc



我创建了一个LLM key的分发系统， 具体的调用接口是：

1、获取一个可以使用的Key
curl -X POST "http://192.168.44.163:3010/api/external/keys/dispatch" \
  -H "Content-Type: application/json" \
  -H "X-KeyRelay-Token: 616dfb41-52de-4ef5-b9a1-43c23f100d13" \
  -d '{
    "platform": "Gemini",
    "projectName": "mathqbank"
  }'

2、如果调用LLM的时候出错，将错误信息提交给系统
  curl -X POST "http://192.168.44.163:3010/api/keys/callback" \
    -H "Content-Type: application/json" \
    -H "x-callback-token: 616dfb41-52de-4ef5-b9a1-43c23f100d13" \
    -d '{
      "keyId": "<KEY_ID>",
      "projectName": "mathqbank",
      "rawError": "RATE_LIMIT_EXCEEDED"
    }'

调用信息出错的时候，统一给的信息是：
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "错误说明"
}

# 文件上传
统一上传 API

文件：upload.py
新增接口：
POST /api/v1/upload

入参：UploadFile（字段名 file）

返回：{ "code": 200, "data": { "url": "...", "filename": "..." } }

异常处理：

空文件名/空文件：400
MinIO 配置问题：500
MinIO 上传失败：502
其他异常：500
路由注册

文件：api_router.py
已注册 upload 路由，统一挂载到 /api/v1 下。
接口示例

路径：POST /api/v1/upload
表单字段：file
成功响应示例：
{ "code": 200, "data": { "url": "http://192.168.44.130:3008/mathqbank/2026/04/xxxx.pdf", "filename": "xxx.pdf" } }


#查看知识图谱
curl -s http://localhost:8000/api/v1/taxonomy/tree | python3 -m json.tool
