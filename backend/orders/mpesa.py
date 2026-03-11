import base64
import json
import os
from decimal import Decimal, ROUND_HALF_UP
from urllib import error as urlerror
from urllib import request as urlrequest

from django.conf import settings
from django.utils import timezone


def _setting(name: str, default=None):
    if hasattr(settings, name):
        return getattr(settings, name)
    return os.getenv(name, default)


def _bool_setting(name: str, default: bool = False) -> bool:
    raw = _setting(name, default)
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _api_base() -> str:
    env = str(_setting("MPESA_ENVIRONMENT", _setting("MPESA_ENV", "sandbox"))).strip().lower()
    if env in {"live", "production"}:
        return "https://api.safaricom.co.ke"
    return "https://sandbox.safaricom.co.ke"


def normalize_phone_number(phone_number: str) -> str:
    digits = "".join(ch for ch in str(phone_number or "") if ch.isdigit())
    if digits.startswith("0") and len(digits) == 10:
        digits = f"254{digits[1:]}"
    elif digits.startswith("7") and len(digits) == 9:
        digits = f"254{digits}"
    elif digits.startswith("254") and len(digits) == 12:
        pass
    elif digits.startswith("01") and len(digits) == 10:
        digits = f"254{digits[1:]}"
    if len(digits) != 12 or not digits.startswith("254"):
        raise ValueError("Invalid Kenyan phone number format for M-Pesa.")
    return digits


def _money_to_int(amount) -> int:
    value = Decimal(str(amount)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(value)


def _json_request(url: str, payload: dict, token: str | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urlrequest.Request(url=url, data=body, headers=headers, method="POST")
    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urlerror.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"M-Pesa API error ({exc.code}): {err_body or exc.reason}")
    except urlerror.URLError as exc:
        raise ValueError(f"M-Pesa API connection error: {exc.reason}")


def _fetch_access_token() -> str:
    consumer_key = str(_setting("MPESA_CONSUMER_KEY", "")).strip()
    consumer_secret = str(_setting("MPESA_CONSUMER_SECRET", "")).strip()
    if not consumer_key or not consumer_secret:
        raise ValueError("M-Pesa consumer key/secret not configured.")
    auth = base64.b64encode(f"{consumer_key}:{consumer_secret}".encode("utf-8")).decode("utf-8")
    url = f"{_api_base()}/oauth/v1/generate?grant_type=client_credentials"
    req = urlrequest.Request(url=url, headers={"Authorization": f"Basic {auth}"}, method="GET")
    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"M-Pesa auth failed ({exc.code}): {err_body or exc.reason}")
    except urlerror.URLError as exc:
        raise ValueError(f"M-Pesa auth connection error: {exc.reason}")
    token = payload.get("access_token")
    if not token:
        raise ValueError("M-Pesa auth failed: access token missing.")
    return token


def mpesa_live_enabled() -> bool:
    if not _bool_setting("MPESA_ENABLE_LIVE", False):
        return False
    required = [
        str(_setting("MPESA_CONSUMER_KEY", "")).strip(),
        str(_setting("MPESA_CONSUMER_SECRET", "")).strip(),
        str(_setting("MPESA_SHORTCODE", "")).strip(),
        str(_setting("MPESA_PASSKEY", "")).strip(),
        str(_setting("MPESA_STK_CALLBACK_URL", "")).strip(),
    ]
    return all(required)


def mpesa_b2c_enabled() -> bool:
    if not mpesa_live_enabled():
        return False
    required = [
        str(_setting("MPESA_B2C_SHORTCODE", _setting("MPESA_SHORTCODE", ""))).strip(),
        str(_setting("MPESA_B2C_RESULT_URL", "")).strip(),
        str(_setting("MPESA_B2C_TIMEOUT_URL", "")).strip(),
    ]
    return all(required)


def initiate_stk_push(*, phone_number: str, amount, account_reference: str, transaction_desc: str) -> dict:
    token = _fetch_access_token()
    shortcode = str(_setting("MPESA_SHORTCODE", "")).strip()
    passkey = str(_setting("MPESA_PASSKEY", "")).strip()
    callback_url = str(_setting("MPESA_STK_CALLBACK_URL", "")).strip()
    if not shortcode or not passkey or not callback_url:
        raise ValueError("M-Pesa STK configuration is incomplete.")

    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode("utf-8")).decode("utf-8")
    phone = normalize_phone_number(phone_number)
    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": str(_setting("MPESA_STK_TRANSACTION_TYPE", "CustomerPayBillOnline")),
        "Amount": _money_to_int(amount),
        "PartyA": phone,
        "PartyB": shortcode,
        "PhoneNumber": phone,
        "CallBackURL": callback_url,
        "AccountReference": account_reference[:12] if account_reference else "KING-KUSH",
        "TransactionDesc": (transaction_desc or "Marketplace payment")[:20],
    }
    return _json_request(f"{_api_base()}/mpesa/stkpush/v1/processrequest", payload, token)


def parse_stk_callback_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    if "Body" in payload:
        callback = ((payload.get("Body") or {}).get("stkCallback") or {})
        metadata_items = ((callback.get("CallbackMetadata") or {}).get("Item") or [])
        item_map = {}
        for item in metadata_items:
            name = item.get("Name")
            if name:
                item_map[name] = item.get("Value")
        return {
            "checkout_request_id": callback.get("CheckoutRequestID"),
            "merchant_request_id": callback.get("MerchantRequestID"),
            "result_code": str(callback.get("ResultCode", "")),
            "result_desc": str(callback.get("ResultDesc", "")),
            "transaction_id": item_map.get("TransactionID") or item_map.get("MpesaReceiptNumber"),
            "mpesa_receipt_number": item_map.get("MpesaReceiptNumber"),
            "phone_number": item_map.get("PhoneNumber"),
            "raw": payload,
        }
    return {
        "checkout_request_id": payload.get("checkout_request_id") or payload.get("CheckoutRequestID"),
        "merchant_request_id": payload.get("merchant_request_id") or payload.get("MerchantRequestID"),
        "result_code": str(payload.get("result_code", payload.get("ResultCode", ""))),
        "result_desc": str(payload.get("result_desc", payload.get("ResultDesc", ""))),
        "transaction_id": payload.get("transaction_id") or payload.get("TransactionID"),
        "mpesa_receipt_number": payload.get("mpesa_receipt_number") or payload.get("MpesaReceiptNumber"),
        "raw": payload,
    }


def initiate_b2c_disbursement(*, phone_number: str, amount, remarks: str = "", occasion: str = "") -> dict:
    token = _fetch_access_token()
    party_a = str(_setting("MPESA_B2C_SHORTCODE", _setting("MPESA_SHORTCODE", ""))).strip()
    result_url = str(_setting("MPESA_B2C_RESULT_URL", "")).strip()
    timeout_url = str(_setting("MPESA_B2C_TIMEOUT_URL", "")).strip()
    initiator_name = str(_setting("MPESA_B2C_INITIATOR_NAME", "")).strip()
    security_credential = str(_setting("MPESA_B2C_SECURITY_CREDENTIAL", "")).strip()
    if not party_a or not result_url or not timeout_url:
        raise ValueError("M-Pesa B2C configuration is incomplete.")

    phone = normalize_phone_number(phone_number)
    payload = {
        "InitiatorName": initiator_name,
        "SecurityCredential": security_credential,
        "CommandID": str(_setting("MPESA_B2C_COMMAND_ID", "BusinessPayment")),
        "Amount": _money_to_int(amount),
        "PartyA": party_a,
        "PartyB": phone,
        "Remarks": (remarks or "Vendor payout")[:100],
        "QueueTimeOutURL": timeout_url,
        "ResultURL": result_url,
        "Occasion": (occasion or "King-Kush payout")[:100],
    }
    return _json_request(f"{_api_base()}/mpesa/b2c/v1/paymentrequest", payload, token)


def parse_b2c_result_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    result = payload.get("Result") or payload.get("result") or {}
    params = ((result.get("ResultParameters") or {}).get("ResultParameter") or [])
    param_map = {}
    for param in params:
        key = param.get("Key")
        if key:
            param_map[key] = param.get("Value")
    return {
        "result_code": str(result.get("ResultCode", "")),
        "result_desc": str(result.get("ResultDesc", "")),
        "conversation_id": result.get("ConversationID"),
        "originator_conversation_id": result.get("OriginatorConversationID"),
        "transaction_id": param_map.get("TransactionReceipt") or param_map.get("TransactionID"),
        "receiver_party_public_name": param_map.get("ReceiverPartyPublicName"),
        "raw": payload,
    }
