from __future__ import annotations

import json
import logging
from io import BytesIO
from typing import Any

import requests
from PIL import Image
from sqlalchemy import delete

from app.core.database import SessionLocal
from app.models import Question, QuestionImage, RawPaper, Tag
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

    TAXONOMY_TREE_URL = "http://192.168.44.163:8006/api/v1/taxonomy/tree"

    def __init__(self) -> None:
        self.storage = MinioService()

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
            taxonomy_tree = self.fetch_taxonomy_tree()
            taxonomy_markdown = self.format_taxonomy_as_markdown(taxonomy_tree)

            # 为了避免重复入库，这里先清空该试卷历史识别题。
            # 注意：此动作仅用于“重新处理试卷”的场景，保证结果可重复。
            db.execute(delete(Question).where(Question.raw_paper_id == raw_paper.id))
            db.commit()

            inserted_count = 0
            for page_index, source in enumerate(page_urls, start=1):
                # 2) 从 MinIO 下载原图到内存（不落盘）
                original_bytes = self.storage.get_object_bytes(source)

                # 3) 构造 Prompt + 图片，调用 Gemini（mock 函数，后续你可接 KeyRelay）
                llm_payload = self.call_gemini_api(
                    prompt=self.build_prompt(taxonomy_markdown),
                    image_bytes=original_bytes,
                )

                # 4) 解析模型 JSON（每一项都应包含 box + OCR 内容）
                items = self.parse_llm_result(llm_payload)

                # 5) 对每个题目执行：按坐标真实切图 -> 上传 MinIO -> OCR数据入库
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

            # 6) 全部成功：进入人工质检阶段
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

    def fetch_taxonomy_tree(self) -> Any:
        response = requests.get(self.TAXONOMY_TREE_URL, timeout=20)
        response.raise_for_status()
        return response.json()

    def format_taxonomy_as_markdown(self, payload: Any) -> str:
        lines: list[str] = ["# 知识点大纲"]

        def walk(node: Any, depth: int = 0) -> None:
            if isinstance(node, dict):
                name = node.get("name") or node.get("title") or node.get("label")
                if name:
                    lines.append(f"{'  ' * depth}- {name}")
                children = node.get("children") or []
                if isinstance(children, list):
                    for child in children:
                        walk(child, depth + 1)
            elif isinstance(node, list):
                for child in node:
                    walk(child, depth)

        walk(payload, 0)
        return "\n".join(lines)

    def build_prompt(self, taxonomy_markdown: str) -> str:
        return (
            "你是数学试卷结构化助手。请识别图片中的每一道题，并返回 JSON 数组。\n"
            "每个元素必须包含字段：\n"
            "- problem_number\n"
            "- question_type\n"
            "- question_box_2d (四个 0~1000 归一化坐标: [x1,y1,x2,y2])\n"
            "- content_latex\n"
            "- options (数组)\n"
            "- tags (数组)\n\n"
            "请严格返回 JSON，不要额外解释。\n\n"
            f"可用知识点如下：\n{taxonomy_markdown}"
        )

    def call_gemini_api(self, prompt: str, image_bytes: bytes) -> Any:
        """
        这里是大模型调用占位函数（mock）。

        你后续接 KeyRelay 时，可在这里替换为真实 Gemini API 调用。
        约定返回：list[dict] 或 JSON 字符串。
        """
        _ = prompt
        _ = image_bytes
        return [
            {
                "problem_number": "1",
                "question_type": "single_choice",
                "question_box_2d": [50, 60, 950, 360],
                "content_latex": "已识别题干（示例）",
                "options": ["A", "B", "C", "D"],
                "tags": ["函数", "导数"],
            }
        ]

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
