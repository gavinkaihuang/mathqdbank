CREATE TABLE IF NOT EXISTS "extraction_tasks" (
    "id" SERIAL PRIMARY KEY,
    "minio_path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "json_result" JSONB,
    "error_log" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_tasks_minio_path_key"
ON "extraction_tasks"("minio_path");
