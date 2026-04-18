from __future__ import annotations

import asyncio
import base64
import json
import logging
from io import BytesIO
from typing import Any

import httpx
import requests
from cachetools import TTLCache
from PIL import Image
from sqlalchemy import delete
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import PromptTemplate
from app.models import Question, QuestionImage, RawPaper, Tag
from app.services.key_manager import KeyRelayClient
from app.services.minio_service import MinioService

logger = logging.getLogger(__name__)


class AIPipelineService:
    """
    阶段二：端到端 AI 切题与 OCR 流水线服务。

    关键点：
    1) 不再把“切图”和“OCR”拆成两条链路。
    2) 由大模型一次返回：坐标 + OCR内容 + 知识点。
    3) 后端据坐标做物理切图，并把 OCR 结果和切图 URL 一起入库。
    """

    TAXONOMY_TREE_CACHE = TTLCache(maxsize=1, ttl=12 * 60 * 60)
    TAXONOMY_TREE_CACHE_KEY = "taxonomy_markdown"

    @property
    def taxonomy_tree_url(self) -> str:
        return settings.TAXONOMY_TREE_URL

    def __init__(self) -> None:
        self.storage = MinioService()
        self.key_relay = KeyRelayClient()

    def process_paper(self, paper_id: int) -> None:
        """
        核心后台流程（供 BackgroundTasks 调用）。

        执行顺序：
        1. 读试卷源图
        2. 拉知识点大纲
        3. 调模型一次性拿“坐标+OCR+标签”
        4. 用坐标做真实裁剪并上传 MinIO
        5. 将 OCR + image_url 入 questions 表
        6. 试卷状态 processing -> qc_pending / failed
        """
        db = SessionLocal()
        try:
            raw_paper = db.get(RawPaper, paper_id)
            if raw_paper is None:
                logger.error("[PIPELINE] raw paper not found: paper_id=%s", paper_id)
                return

            page_urls = raw_paper.page_urls or []
            if not page_urls:
                raise RuntimeError("raw paper has no page_urls")

            # 1) 获取动态知识点大纲并格式化成 Markdown 文本（喂给模型做标签约束）
            taxonomy_markdown = self.get_taxonomy_markdown()

            # 2) 从数据库读取系统提示词模板，并注入知识点大纲
            full_prompt = self.build_exam_paper_decomposer_prompt(
                db=db,
                taxonomy_markdown=taxonomy_markdown,
            )

            # 3) 严格从环境变量配置读取模型名
            model_name = self.get_model_name_from_settings()

            # 为了避免重复入库，这里先清空该试卷历史识别题。
            # 注意：此动作仅用于“重新处理试卷”的场景，保证结果可重复。
            db.execute(delete(Question).where(Question.raw_paper_id == raw_paper.id))
            db.commit()

            inserted_count = 0
            for page_index, source in enumerate(page_urls, start=1):
                # 2) 从 MinIO 下载原图到内存（不落盘）
                original_bytes = self.storage.get_object_bytes(source)

                # 4) 构造 Prompt + 图片，调用 Gemini
                llm_payload = self.call_gemini_api(
                    prompt=full_prompt,
                    image_bytes=original_bytes,
                    model_name=model_name,
                )

                # 5) 解析模型 JSON（每一项都应包含 box + OCR 内容）
                items = self.parse_llm_result(llm_payload)

                # 6) 对每个题目执行：按坐标真实切图 -> 上传 MinIO -> OCR数据入库
                for idx, item in enumerate(items, start=1):
                    box_2d = item.get("question_box_2d")
                    if not isinstance(box_2d, list) or len(box_2d) != 4:
                        logger.warning(
                            "[PIPELINE] skip invalid question_box_2d: paper_id=%s page=%s idx=%s box=%s",
                            raw_paper.id,
                            page_index,
                            idx,
                            box_2d,
                        )
                        continue

                    crop_bytes = self.crop_question_image(
                        original_image_bytes=original_bytes,
                        normalized_box_2d=box_2d,
                    )

                    # 上传后拿到 object path（DB 存 object path，展示时再拼完整 URL）
                    object_path = self.storage.upload_object(
                        file_data=crop_bytes,
                        file_name=f"paper_{raw_paper.id}_p{page_index}_q{idx}.png",
                        content_type="image/png",
                    )

                    problem_number = item.get("problem_number") or str(inserted_count + 1)
                    question_type = item.get("question_type") or "unknown"
                    content_latex = item.get("content_latex") or ""
                    options = item.get("options") or []
                    tags = item.get("tags") or []

                    # 这里是“切图与OCR结合入库”的关键：
                    # - image_url：来自真实物理切图（可用于后续人工复核存根）
                    # - content_latex / options / tags：来自同一次 LLM 调用的 OCR 结果
                    question = Question(
                        raw_paper_id=raw_paper.id,
                        problem_number=str(problem_number),
                        question_type=str(question_type),
                        content_latex=str(content_latex),
                        image_url=object_path,
                        status="draft",
                        type_specific_data={
                            "options": options,
                            "tags": tags,
                            "question_box_2d": box_2d,
                            "source_page_index": page_index,
                        },
                    )
                    db.add(question)
                    db.flush()

                    db.add(
                        QuestionImage(
                            question_id=question.id,
                            image_url=object_path,
                            desc="ai_pipeline_crop",
                        )
                    )

                    self.attach_tags(db=db, question=question, tags=tags)
                    inserted_count += 1

                db.commit()

            # 7) 全部成功：进入人工质检阶段
            raw_paper.status = "qc_pending"
            db.commit()
            logger.info(
                "[PIPELINE] process finished: paper_id=%s inserted=%s status=qc_pending",
                raw_paper.id,
                inserted_count,
            )

        except Exception:
            db.rollback()
            try:
                raw_paper = db.get(RawPaper, paper_id)
                if raw_paper is not None:
                    raw_paper.status = "failed"
                    db.commit()
            except Exception:
                db.rollback()
            logger.exception("[PIPELINE] process failed: paper_id=%s", paper_id)
        finally:
            db.close()

    @classmethod
    def format_taxonomy_to_markdown(
        cls,
        taxonomy_tree: list,
        level: int = 0,
    ) -> str:
        lines: list[str] = []
        indent = "  " * level
        for node in taxonomy_tree:
            if not isinstance(node, dict):
                continue
            name = str(node.get("name") or node.get("title") or node.get("label") or "").strip()
            if not name:
                continue
            lines.append(f"{indent}- {name}")
            children = node.get("children")
            if isinstance(children, list) and children:
                child_md = cls.format_taxonomy_to_markdown(children, level + 1)
                if child_md:
                    lines.append(child_md)
        return "\n".join(lines)

    async def fetch_taxonomy_tree(self) -> list:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(self.taxonomy_tree_url)
            response.raise_for_status()
            payload = response.json()

        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            for key in ("items", "data", "children"):
                value = payload.get(key)
                if isinstance(value, list):
                    return value
            return [payload]
        return []

    def get_taxonomy_markdown(self) -> str:
        cached = self.TAXONOMY_TREE_CACHE.get(self.TAXONOMY_TREE_CACHE_KEY)
        if isinstance(cached, str) and cached:
            return cached

        taxonomy_tree = asyncio.run(self.fetch_taxonomy_tree())
        markdown_body = self.format_taxonomy_to_markdown(taxonomy_tree)
        markdown = "# 知识点大纲\n" + (markdown_body or "- （暂无知识点）")
        self.TAXONOMY_TREE_CACHE[self.TAXONOMY_TREE_CACHE_KEY] = markdown
        return markdown

    def build_exam_paper_decomposer_prompt(self, db, taxonomy_markdown: str) -> str:
        prompt_template = db.execute(
            select(PromptTemplate).where(PromptTemplate.name == "exam_paper_decomposer")
        ).scalar_one_or_none()
        if prompt_template is None:
            raise RuntimeError("Prompt template 'exam_paper_decomposer' not found")

        template = prompt_template.content or ""
        if "{{TAXONOMY_TREE}}" in template:
            return template.replace("{{TAXONOMY_TREE}}", taxonomy_markdown)

        # 兼容历史模板未放置占位符的情况。
        return f"{template}\n\n{taxonomy_markdown}"

    def get_model_name_from_settings(self) -> str:
        # 优先使用显式配置 GEMINI_MODEL_NAME，兼容历史配置 MODEL_TIER_PRO。
        model_name = (
            settings.GEMINI_MODEL_NAME.strip()
            if settings.GEMINI_MODEL_NAME
            else settings.MODEL_TIER_PRO.strip()
        )
        if not model_name:
            raise RuntimeError("Model name is required (set GEMINI_MODEL_NAME or MODEL_TIER_PRO)")
        return model_name

    def _resolve_gemini_key(self) -> tuple[str, str | None]:
        key_data = self.key_relay.get_key_sync(platform="Gemini")
        api_key = str(key_data.get("key") or key_data.get("apiKey") or "").strip()
        key_id = (
            str(key_data.get("keyId") or key_data.get("id") or "").strip() or None
        )
        if not api_key:
            raise RuntimeError("Key relay returned empty API key")
        return api_key, key_id

    def call_gemini_api(self, prompt: str, image_bytes: bytes, model_name: str) -> Any:
        api_key, key_id = self._resolve_gemini_key()

        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={api_key}"
        )

        payload = {
            "system_instruction": {"parts": [{"text": prompt}]},
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": "请按系统提示词要求解析这张试卷图片，并只输出 JSON 数组。"},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64.b64encode(image_bytes).decode("utf-8"),
                            }
                        },
                    ],
                }
            ],
        }

        response = requests.post(endpoint, json=payload, timeout=90)
        if response.status_code >= 400:
            if key_id:
                self.key_relay.report_error_sync(
                    key_id=key_id,
                    raw_error=f"HTTP_{response.status_code}: {response.text[:500]}",
                )
            response.raise_for_status()
        result = response.json()

        text = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "[]")
        )
        return text

    def parse_llm_result(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]

        if isinstance(payload, str):
            parsed = json.loads(payload)
            if isinstance(parsed, list):
                return [x for x in parsed if isinstance(x, dict)]

        raise ValueError("LLM result format is invalid, expected JSON array")

    def crop_question_image(self, original_image_bytes: bytes, normalized_box_2d: list[Any]) -> bytes:
        img = Image.open(BytesIO(original_image_bytes)).convert("RGB")
        width, height = img.size

        x1 = self._clamp_int(normalized_box_2d[0], 0, 1000)
        y1 = self._clamp_int(normalized_box_2d[1], 0, 1000)
        x2 = self._clamp_int(normalized_box_2d[2], 0, 1000)
        y2 = self._clamp_int(normalized_box_2d[3], 0, 1000)

        if x2 <= x1:
            x2 = min(1000, x1 + 1)
        if y2 <= y1:
            y2 = min(1000, y1 + 1)

        left = int(width * x1 / 1000)
        top = int(height * y1 / 1000)
        right = int(width * x2 / 1000)
        bottom = int(height * y2 / 1000)

        if right <= left:
            right = min(width, left + 1)
        if bottom <= top:
            bottom = min(height, top + 1)

        crop = img.crop((left, top, right, bottom))
        out = BytesIO()
        crop.save(out, format="PNG")
        return out.getvalue()

    def attach_tags(self, db, question: Question, tags: list[Any]) -> None:
        for raw_name in tags:
            name = str(raw_name).strip()
            if not name:
                continue

            tag = db.query(Tag).filter(Tag.name == name).first()
            if tag is None:
                tag = Tag(name=name, category="knowledge")
                db.add(tag)
                db.flush()

            if tag not in question.tags:
                question.tags.append(tag)

    def _clamp_int(self, value: Any, minimum: int, maximum: int) -> int:
        try:
            n = int(float(value))
        except (TypeError, ValueError):
            n = minimum
        return max(minimum, min(maximum, n))
