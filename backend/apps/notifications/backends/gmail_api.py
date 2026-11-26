import base64
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


class GmailAPIBackendError(Exception):
    """Sanitized error from Google OAuth token refresh or Gmail message send."""


class GmailAPIEmailBackend(BaseEmailBackend):
    """Send Django email messages through the Gmail API with a refresh token."""

    def _get_access_token(self) -> str:
        payload = urlencode(
            {
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "refresh_token": settings.GOOGLE_OAUTH_REFRESH_TOKEN,
                "grant_type": "refresh_token",
            }
        ).encode("ascii")
        request = Request(
            TOKEN_ENDPOINT,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=settings.EMAIL_TIMEOUT) as response:
                token_data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise GmailAPIBackendError(
                f"Google OAuth token refresh failed (HTTP {error.code})."
            ) from None
        except (URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError):
            raise GmailAPIBackendError("Google OAuth token refresh failed.") from None

        if not isinstance(token_data, dict):
            raise GmailAPIBackendError("Google OAuth token response was invalid.")
        access_token = token_data.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise GmailAPIBackendError("Google OAuth token response contained no access token.")
        return access_token

    def _send_message(self, message, access_token: str) -> None:
        mime_message = message.message()
        raw_message = base64.urlsafe_b64encode(mime_message.as_bytes()).decode("ascii")
        payload = json.dumps({"raw": raw_message}).encode("utf-8")
        request = Request(
            SEND_ENDPOINT,
            data=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=settings.EMAIL_TIMEOUT):
                pass
        except HTTPError as error:
            raise GmailAPIBackendError(
                f"Gmail API message send failed (HTTP {error.code})."
            ) from None
        except (URLError, TimeoutError, OSError):
            raise GmailAPIBackendError("Gmail API message send failed.") from None

    def send_messages(self, email_messages) -> int:
        if not email_messages:
            return 0

        try:
            access_token = self._get_access_token()
        except GmailAPIBackendError:
            if self.fail_silently:
                return 0
            raise

        sent_count = 0
        for message in email_messages:
            try:
                self._send_message(message, access_token)
            except GmailAPIBackendError:
                if self.fail_silently:
                    return sent_count
                raise
            sent_count += 1
        return sent_count
