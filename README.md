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

python3 -m venv .venv
source .venv/bin/activate

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

默认访问地址：

- 应用: http://127.0.0.1:8000
- 健康检查: http://127.0.0.1:8000/ping

## 环境变量

- `DATABASE_URL`: PostgreSQL 连接字符串

示例：

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/mathqbank
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