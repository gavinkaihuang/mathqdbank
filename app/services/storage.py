import logging
import os
from datetime import datetime
from io import BytesIO
from urllib.parse import urlparse
from uuid import uuid4

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)


class MinioClient:
    """
    MinIO 存储服务封装类，用于文件上传下载管理。
    """

    def __init__(self):
        """初始化 MinIO 客户端连接"""
        # Accept both "host:port" and "http(s)://host:port" from env.
        endpoint = settings.MINIO_ENDPOINT
        secure = settings.MINIO_USE_SSL
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            parsed = urlparse(endpoint)
            endpoint = parsed.netloc
            secure = parsed.scheme == "https"

        self.client = Minio(
            endpoint=endpoint,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=secure,
        )
        self.bucket_name = settings.MINIO_BUCKET_NAME
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """
        确保指定的 Bucket 存在，不存在则自动创建。
        """
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"✓ Created MinIO bucket: {self.bucket_name}")
            else:
                logger.info(f"✓ MinIO bucket already exists: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"✗ Failed to ensure bucket exists: {e}")
            raise

    def upload_file(
        self,
        file_obj: BytesIO,
        original_filename: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        上传文件到 MinIO，返回相对路径。

        Args:
            file_obj: 文件对象（BytesIO）
            original_filename: 原始文件名（用于获取扩展名）
            content_type: 文件 MIME 类型

        Returns:
            str: 文件在 Bucket 中的相对路径，格式为 papers/YYYY/MM/UUID_filename

        Raises:
            S3Error: MinIO 操作异常
        """
        try:
            # 解析文件扩展名
            _, ext = os.path.splitext(original_filename)

            # 按时间戳和 UUID 生成 Safe Object Name
            now = datetime.utcnow()
            year = now.strftime("%Y")
            month = now.strftime("%m")
            unique_id = str(uuid4())[:8]
            object_name = f"papers/{year}/{month}/{unique_id}{ext}"

            # 重置 BytesIO 指针到开始位置
            file_obj.seek(0)

            # 获取文件大小
            file_obj.seek(0, 2)  # 移动到文件末尾
            file_size = file_obj.tell()
            file_obj.seek(0)  # 重置到开始

            # 上传文件
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=file_obj,
                length=file_size,
                content_type=content_type,
            )

            logger.info(f"✓ Uploaded file to MinIO: {object_name}")
            return object_name

        except S3Error as e:
            logger.error(f"✗ Failed to upload file to MinIO: {e}")
            raise

    def delete_file(self, object_name: str) -> bool:
        """
        删除 MinIO 中的文件。

        Args:
            object_name: 对象名称（相对路径）

        Returns:
            bool: 删除成功返回 True，失败返回 False
        """
        try:
            self.client.remove_object(self.bucket_name, object_name)
            logger.info(f"✓ Deleted file from MinIO: {object_name}")
            return True
        except S3Error as e:
            logger.error(f"✗ Failed to delete file from MinIO: {e}")
            return False

    def delete_files(self, object_names: list[str]) -> None:
        """
        批量删除 MinIO 中的文件（用于回滚清理）。

        Args:
            object_names: 对象名称列表

        Raises:
            S3Error: MinIO 操作异常
        """
        if not object_names:
            return

        try:
            errors = self.client.remove_objects(self.bucket_name, object_names)
            for error in errors:
                logger.warning(f"⚠ Failed to delete: {error.object_name} - {error.error}")
            logger.info(f"✓ Batch deleted {len(object_names)} files from MinIO")
        except S3Error as e:
            logger.error(f"✗ Failed to batch delete files: {e}")
            raise
