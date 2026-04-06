import logging
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
    keyId: str
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

        response_data = await self._post_json(url, headers=headers, json=payload)
        try:
            parsed = DispatchKeyResponse.model_validate(response_data)
        except ValidationError as exc:
            raise KeyRelayException("INVALID_RESPONSE", f"Invalid key relay response: {exc}") from exc

        if not parsed.success:
            raise KeyRelayException(parsed.code, parsed.message or "Failed to dispatch key")

        if parsed.data is None:
            raise KeyRelayException("INVALID_RESPONSE", "Key relay response missing data")

        return parsed.data.model_dump(exclude_none=True)

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

        try:
            response_data = await self._post_json(url, headers=headers, json=payload)
            parsed = BaseRelayResponse.model_validate(response_data)
            if not parsed.success:
                logger.warning(
                    "Key relay callback rejected for key_id=%s, code=%s, message=%s",
                    key_id,
                    parsed.code,
                    parsed.message,
                )
        except Exception:
            logger.exception("Failed to report key relay error for key_id=%s", key_id)

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