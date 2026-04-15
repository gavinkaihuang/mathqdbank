from __future__ import annotations

import logging
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from uuid import uuid4

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)


class MinioService:
    """MinIO object storage service used by API endpoints across the project."""

    def __init__(self) -> None:
        endpoint, secure = self._normalize_endpoint(settings.MINIO_ENDPOINT, settings.MINIO_USE_SSL)
        self._raw_endpoint = endpoint
        self._secure = secure
        self.bucket_name = settings.MINIO_BUCKET_NAME

        self.client = Minio(
            endpoint=endpoint,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=secure,
        )

        self._ensure_bucket_exists()

    @staticmethod
    def _normalize_endpoint(endpoint: str, use_ssl: bool) -> tuple[str, bool]:
        normalized = endpoint.strip().rstrip("/")
        if normalized.startswith(("http://", "https://")):
            parsed = urlparse(normalized)
            if not parsed.netloc:
                raise ValueError("MINIO_ENDPOINT URL must include host:port")
            return parsed.netloc, parsed.scheme == "https"
        return normalized, use_ssl

    def _ensure_bucket_exists(self) -> None:
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info("Created MinIO bucket: %s", self.bucket_name)
        except S3Error:
            logger.exception("Failed to ensure MinIO bucket exists")
            raise

    def _build_object_name(self, file_name: str) -> str:
        file_ext = Path(file_name).suffix
        now = datetime.now(UTC)
        return f"{now:%Y/%m}/{uuid4().hex}{file_ext}"

    def upload_file(self, file_data: bytes, file_name: str, content_type: str) -> str:
        """
        Upload binary data to MinIO.

        The object name is generated as: YYYY/MM/uuid.ext
        Returns a direct absolute URL.
        """
        object_name = self.upload_object(
            file_data=file_data,
            file_name=file_name,
            content_type=content_type,
        )

        return self.build_object_url(object_name)

    def upload_object(self, file_data: bytes, file_name: str, content_type: str) -> str:
        """Upload binary data and return MinIO object name (relative path)."""
        object_name = self._build_object_name(file_name)

        stream = BytesIO(file_data)
        length = len(file_data)

        try:
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=stream,
                length=length,
                content_type=content_type or "application/octet-stream",
            )
        except S3Error:
            logger.exception("Failed to upload object to MinIO")
            raise

        return object_name

    def delete_files(self, object_names: list[str]) -> None:
        """Delete objects by relative object names or full URLs."""
        normalized = [self.extract_object_name(item) for item in object_names if item]
        if not normalized:
            return
        try:
            errors = self.client.remove_objects(self.bucket_name, normalized)
            for error in errors:
                logger.warning(
                    "Failed to delete object from MinIO: object=%s error=%s",
                    error.object_name,
                    error.error,
                )
        except S3Error:
            logger.exception("Failed to batch delete objects from MinIO")
            raise

    def get_object_bytes(self, object_path: str) -> bytes:
        """Read object bytes by relative object name or full URL."""
        object_name = self.extract_object_name(object_path)
        response = self.client.get_object(self.bucket_name, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def extract_object_name(self, object_path: str) -> str:
        """
        Normalize an object path into MinIO object name.

        Accepts:
        - Relative object name: 2026/04/abc.jpg
        - Absolute URL: http://host:port/bucket/2026/04/abc.jpg
        """
        raw = object_path.strip()
        if raw.startswith(("http://", "https://")):
            parsed = urlparse(raw)
            path = parsed.path.lstrip("/")
            bucket_prefix = f"{self.bucket_name}/"
            if path.startswith(bucket_prefix):
                return unquote(path[len(bucket_prefix) :])
            return unquote(path)
        return raw.lstrip("/")

    def build_object_url(self, object_name: str) -> str:
        scheme = "https" if self._secure else "http"
        encoded_object_name = quote(object_name)
        return f"{scheme}://{self._raw_endpoint}/{self.bucket_name}/{encoded_object_name}"
