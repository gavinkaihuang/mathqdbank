import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.config import settings
from app.core.exceptions import KeyRelayException

logger = logging.getLogger(__name__)


class BaseRelayResponse(BaseModel):
    success: bool
    code: str | None = None
    message: str | None = None


class RelayKeyData(BaseModel):
    keyId: str | None = None
    id: str | None = None
    key: str | None = None
    apiKey: str | None = None
    model_config = ConfigDict(extra="allow")


class DispatchKeyResponse(BaseRelayResponse):
    data: RelayKeyData | None = None


class KeyRelayClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        token: str | None = None,
        project_name: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self.base_url = (base_url or settings.KEY_RELAY_BASE_URL).rstrip("/")
        self.token = token or settings.KEY_RELAY_TOKEN
        self.project_name = project_name or settings.PROJECT_NAME
        self.timeout = httpx.Timeout(timeout)

    async def get_key(self, platform: str = "Gemini") -> dict[str, Any]:
        url = f"{self.base_url}/api/external/keys/dispatch"
        headers = {
            "Content-Type": "application/json",
            "X-KeyRelay-Token": self.token,
        }
        payload = {
            "platform": platform,
            "projectName": self.project_name,
        }

        logger.info(
            "[CUT] key relay dispatch requested: platform=%s project=%s endpoint=%s",
            platform,
            self.project_name,
            url,
        )

        response_data = await self._post_json(url, headers=headers, json=payload)
        try:
            parsed = DispatchKeyResponse.model_validate(response_data)
        except ValidationError as exc:
            raise KeyRelayException("INVALID_RESPONSE", f"Invalid key relay response: {exc}") from exc

        if not parsed.success:
            raise KeyRelayException(parsed.code, parsed.message or "Failed to dispatch key")

        if parsed.data is None:
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response missing data")

        key_data = parsed.data.model_dump(exclude_none=True)
        key_id = key_data.get("keyId") or key_data.get("id") or ""
        key_value = str(key_data.get("key") or key_data.get("apiKey") or "")
        cooldown = self.describe_cooldown(key_data)
        logger.info(
            "[CUT] key relay dispatch succeeded: key_id=%s key_present=%s key_length=%s cooldown=%s",
            key_id,
            bool(key_value),
            len(key_value),
            cooldown,
        )

        return key_data

    def get_key_sync(self, platform: str = "Gemini") -> dict[str, Any]:
        url = f"{self.base_url}/api/external/keys/dispatch"
        headers = {
            "Content-Type": "application/json",
            "X-KeyRelay-Token": self.token,
        }
        payload = {
            "platform": platform,
            "projectName": self.project_name,
        }

        logger.info(
            "[CUT] key relay dispatch requested(sync): platform=%s project=%s endpoint=%s",
            platform,
            self.project_name,
            url,
        )

        response_data = self._post_json_sync(url, headers=headers, json=payload)
        try:
            parsed = DispatchKeyResponse.model_validate(response_data)
        except ValidationError as exc:
            raise KeyRelayException("INVALID_RESPONSE", f"Invalid key relay response: {exc}") from exc

        if not parsed.success:
            raise KeyRelayException(parsed.code, parsed.message or "Failed to dispatch key")

        if parsed.data is None:
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response missing data")

        key_data = parsed.data.model_dump(exclude_none=True)
        key_id = key_data.get("keyId") or key_data.get("id") or ""
        key_value = str(key_data.get("key") or key_data.get("apiKey") or "")
        cooldown = self.describe_cooldown(key_data)
        logger.info(
            "[CUT] key relay dispatch succeeded(sync): key_id=%s key_present=%s key_length=%s cooldown=%s",
            key_id,
            bool(key_value),
            len(key_value),
            cooldown,
        )

        return key_data

    async def report_error(self, key_id: str, raw_error: str) -> None:
        url = f"{self.base_url}/api/keys/callback"
        headers = {
            "Content-Type": "application/json",
            "x-callback-token": self.token,
        }
        payload = {
            "keyId": key_id,
            "projectName": self.project_name,
            "rawError": raw_error,
        }

        logger.info(
            "[CUT] key relay callback requested: key_id=%s project=%s endpoint=%s",
            key_id,
            self.project_name,
            url,
        )

        try:
            response_data = await self._post_json(url, headers=headers, json=payload)
            parsed = BaseRelayResponse.model_validate(response_data)
            if not parsed.success:
                logger.warning(
                    "[CUT] key relay callback rejected: key_id=%s code=%s message=%s",
                    key_id,
                    parsed.code,
                    parsed.message,
                )
            else:
                logger.info("[CUT] key relay callback accepted: key_id=%s", key_id)
        except Exception:
            logger.exception("[CUT] failed to report key relay error: key_id=%s", key_id)

    def report_error_sync(self, key_id: str, raw_error: str) -> None:
        url = f"{self.base_url}/api/keys/callback"
        headers = {
            "Content-Type": "application/json",
            "x-callback-token": self.token,
        }
        payload = {
            "keyId": key_id,
            "projectName": self.project_name,
            "rawError": raw_error,
        }

        logger.info(
            "[CUT] key relay callback requested(sync): key_id=%s project=%s endpoint=%s",
            key_id,
            self.project_name,
            url,
        )

        try:
            response_data = self._post_json_sync(url, headers=headers, json=payload)
            parsed = BaseRelayResponse.model_validate(response_data)
            if not parsed.success:
                logger.warning(
                    "[CUT] key relay callback rejected(sync): key_id=%s code=%s message=%s",
                    key_id,
                    parsed.code,
                    parsed.message,
                )
            else:
                logger.info("[CUT] key relay callback accepted(sync): key_id=%s", key_id)
        except Exception:
            logger.exception("[CUT] failed to report key relay error(sync): key_id=%s", key_id)

    async def _post_json(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=headers, json=json)
        except httpx.HTTPError as exc:
            raise KeyRelayException("NETWORK_ERROR", f"Key relay request failed: {exc}") from exc

        logger.info(
            "[CUT] key relay HTTP response: endpoint=%s status=%s",
            url,
            response.status_code,
        )

        try:
            data = response.json()
        except ValueError as exc:
            if response.is_error:
                raise KeyRelayException(
                    "HTTP_ERROR",
                    f"Key relay request failed with status {response.status_code}",
                ) from exc
            raise KeyRelayException("INVALID_RESPONSE", "Key relay returned invalid JSON") from exc

        if not isinstance(data, dict):
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response must be a JSON object")

        return data

    def describe_cooldown(self, key_data: dict[str, Any]) -> str:
        parts: list[str] = []

        cooldown_s = self._as_number(
            key_data.get("cooldownSeconds")
            or key_data.get("cooldown_seconds")
            or key_data.get("cooldownSec")
        )
        if cooldown_s is not None:
            parts.append(f"cooldown_s={cooldown_s:g}")

        cooldown_ms = self._as_number(
            key_data.get("cooldownMs")
            or key_data.get("cooldown_ms")
            or key_data.get("cooldownMillis")
        )
        if cooldown_ms is not None:
            parts.append(f"cooldown_ms={cooldown_ms:g}")

        next_available = (
            key_data.get("nextAvailableAt")
            or key_data.get("nextUsableAt")
            or key_data.get("availableAt")
            or key_data.get("cooldownUntil")
            or key_data.get("cooldown_until")
        )
        if isinstance(next_available, str) and next_available.strip():
            parts.append(f"next_available_at={next_available}")

        last_used_at = key_data.get("lastUsedAt") or key_data.get("last_used_at")
        if isinstance(last_used_at, str) and last_used_at.strip():
            parts.append(f"last_used_at={last_used_at}")
            elapsed = self._elapsed_seconds(last_used_at)
            if elapsed is not None:
                parts.append(f"elapsed_since_last_use_s={elapsed:g}")

        if not parts:
            return "none"
        return ",".join(parts)

    def _as_number(self, value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _elapsed_seconds(self, iso_text: str) -> float | None:
        try:
            normalized = iso_text.replace("Z", "+00:00")
            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            return max(0.0, (now - dt).total_seconds())
        except ValueError:
            return None

    def _post_json_sync(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, headers=headers, json=json)
        except httpx.HTTPError as exc:
            raise KeyRelayException("NETWORK_ERROR", f"Key relay request failed: {exc}") from exc

        logger.info(
            "[CUT] key relay HTTP response(sync): endpoint=%s status=%s",
            url,
            response.status_code,
        )

        try:
            data = response.json()
        except ValueError as exc:
            if response.is_error:
                raise KeyRelayException(
                    "HTTP_ERROR",
                    f"Key relay request failed with status {response.status_code}",
                ) from exc
            raise KeyRelayException("INVALID_RESPONSE", "Key relay returned invalid JSON") from exc

        if not isinstance(data, dict):
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response must be a JSON object")

        return data