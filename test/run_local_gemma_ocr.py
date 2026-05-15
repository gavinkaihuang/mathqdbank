from __future__ import annotations

import argparse
import base64
import json
import logging
import sys
from pathlib import Path
from typing import Iterable

import httpx
from dotenv import load_dotenv
from pydantic import ValidationError

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.models.parsing import BookPageExtraction  # noqa: E402


SYSTEM_PROMPT = """
你是一个资深的数学教研专家和 OCR 专家。

任务：
1. 识别截图中所有的知识片段和题目。
2. 所有数学公式和行内变量必须严格转换成 LaTeX 格式。
3. 图片中的红笔手写备注必须精准提取到 expert_note 字段。
4. 根据语境将知识片段分类为 METHOD（通性通法）、TRAP（易错点）、TIP（心得）或 THEORY（基础）。

输出要求：
- 只输出符合如下 JSON 结构的数据：
  {
    "items": [
      {"content_type": "METHOD|TRAP|TIP|THEORY", "latex_content": "...", "expert_note": "...或null"}
    ],
    "questions": [
      {"body": "...", "solution": "...", "difficulty": 1}
    ]
  }
- 不要输出 Markdown 代码块。
- 不要输出任何 JSON 以外的解释。
- 如果某字段不存在，使用空数组或 null，不要省略顶层字段。
""".strip()

USER_PROMPT = "请解析这张一本涂书数学页面截图，并按约定 JSON 结构返回识别结果。"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff"}

logger = logging.getLogger("local_gemma_ocr")


class OllamaVisionClient:
    def __init__(self, base_url: str, model: str, timeout: float = 300.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def recognize(self, image_bytes: bytes) -> BookPageExtraction:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": USER_PROMPT,
                    "images": [image_b64],
                },
            ],
            "options": {
                "temperature": 0.1,
            },
        }

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()

        content = self._extract_content(data)
        parsed_json = self._parse_json_content(content)
        try:
            return BookPageExtraction.model_validate(parsed_json)
        except ValidationError as exc:
            raise RuntimeError(f"Model output does not match BookPageExtraction schema: {exc}") from exc

    @staticmethod
    def _extract_content(data: dict) -> str:
        message = data.get("message") if isinstance(data, dict) else None
        if not isinstance(message, dict):
            raise RuntimeError(f"Unexpected Ollama response: {data}")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError(f"Empty model content: {data}")
        return content.strip()

    @staticmethod
    def _parse_json_content(content: str) -> dict:
        normalized = content.strip()
        if normalized.startswith("```"):
            normalized = normalized.strip("`")
            if normalized.startswith("json"):
                normalized = normalized[4:].strip()

        try:
            parsed = json.loads(normalized)
        except json.JSONDecodeError:
            start = normalized.find("{")
            end = normalized.rfind("}")
            if start < 0 or end < 0 or end <= start:
                raise RuntimeError(f"Model did not return valid JSON: {content[:500]}")
            parsed = json.loads(normalized[start : end + 1])

        if not isinstance(parsed, dict):
            raise RuntimeError(f"Model JSON root must be an object: {parsed!r}")
        return parsed


def discover_images(image_args: list[str], images_dir: Path) -> list[Path]:
    if image_args:
        paths = [Path(arg).expanduser() for arg in image_args]
    else:
        paths = sorted(
            path for path in images_dir.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        )

    resolved: list[Path] = []
    for path in paths:
        candidate = path if path.is_absolute() else (PROJECT_ROOT / path)
        if not candidate.exists():
            raise FileNotFoundError(f"Image not found: {path}")
        if candidate.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image type: {candidate}")
        resolved.append(candidate)
    return resolved


def write_result(output_dir: Path, image_path: Path, extraction: BookPageExtraction) -> Path:
    output_path = output_dir / f"{image_path.stem}.json"
    output_path.write_text(
        json.dumps(extraction.model_dump(mode="json"), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_path


def process_images(client: OllamaVisionClient, images: Iterable[Path], output_dir: Path) -> int:
    failures = 0
    for image_path in images:
        logger.info("Processing image: %s", image_path)
        try:
            extraction = client.recognize(image_path.read_bytes())
            output_path = write_result(output_dir, image_path, extraction)
            logger.info("Saved JSON result: %s", output_path)
        except Exception as exc:
            failures += 1
            logger.exception("Failed to process image %s: %s", image_path, exc)
    return failures


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Use a local Gemma vision model to OCR math page images and save one JSON per image.",
    )
    parser.add_argument(
        "images",
        nargs="*",
        help="Optional image paths. If omitted, all images under test/images are processed.",
    )
    parser.add_argument(
        "--model",
        default="gemma3:latest",
        help="Local Ollama model name, e.g. gemma3:latest",
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:11434",
        help="Local Ollama base URL",
    )
    parser.add_argument(
        "--images-dir",
        default=str(PROJECT_ROOT / "test" / "images"),
        help="Default image directory when no positional images are supplied",
    )
    parser.add_argument(
        "--output-dir",
        default=str(PROJECT_ROOT / "test" / "output"),
        help="Directory for OCR JSON outputs",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="HTTP timeout in seconds for the local model request",
    )
    return parser


def main() -> int:
    load_dotenv(PROJECT_ROOT / ".env")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    args = build_arg_parser().parse_args()
    images_dir = Path(args.images_dir).expanduser()
    output_dir = Path(args.output_dir).expanduser()
    images_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    images = discover_images(args.images, images_dir)
    if not images:
        logger.error("No images found. Put images under %s or pass image paths explicitly.", images_dir)
        return 1

    client = OllamaVisionClient(base_url=args.base_url, model=args.model, timeout=args.timeout)
    failures = process_images(client, images, output_dir)
    if failures:
        logger.warning("Finished with %s failed image(s).", failures)
        return 2

    logger.info("Finished successfully. Processed %s image(s).", len(images))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
