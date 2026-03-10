from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import html
import json
import math
import os
import re
import sys
import threading
from datetime import datetime
import urllib.error
import urllib.parse
import urllib.request

from django.db.models import Count, Max

from products.models import Product


TOKEN_RE = re.compile(r"[a-z0-9]+")
JSX_TEXT_RE = re.compile(r">([^<>{}][^<>]{0,400})<", re.MULTILINE)
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

GREETING_WORDS = {"hello", "hi", "hey", "morning", "afternoon", "evening"}
THANKS_WORDS = {"thanks", "thank", "appreciate"}
CAPABILITY_WORDS = {"help", "assist", "support", "can", "do", "what"}
NAVIGATION_HINTS = {
    "where",
    "find",
    "locate",
    "navigate",
    "go",
    "page",
    "section",
    "link",
    "open",
    "show",
    "route",
}

TOPIC_RULES = {
    "shipping": {
        "keywords": {"shipping", "delivery", "dispatch", "courier", "arrive"},
        "route_terms": {"shipping-and-delivery", "track-your-order", "pick-up-stations"},
    },
    "returns": {
        "keywords": {"return", "refund", "exchange", "cancel", "damaged"},
        "route_terms": {"return-policy", "returns-policy", "dispute-resolution", "store-credit"},
    },
    "payments": {
        "keywords": {"payment", "pay", "mpesa", "card", "wallet", "invoice"},
        "route_terms": {"payment-guidelines", "store-credit", "checkout"},
    },
    "orders": {
        "keywords": {"order", "checkout", "cart", "track", "status"},
        "route_terms": {"checkout", "track-your-order", "how-to-order", "cart"},
    },
    "support": {
        "keywords": {"help", "support", "contact", "assist", "issue", "problem"},
        "route_terms": {"help-center", "contact-us", "report-product"},
    },
    "account": {
        "keywords": {"login", "register", "account", "password", "sign"},
        "route_terms": {"login", "register"},
    },
    "products": {
        "keywords": {"product", "price", "stock", "category", "vendor", "buy"},
        "route_terms": {"product", "search"},
    },
}

STOP_WORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "of",
    "in",
    "on",
    "at",
    "with",
    "from",
    "is",
    "are",
    "be",
    "this",
    "that",
    "it",
    "as",
    "by",
    "i",
    "you",
    "we",
    "our",
    "your",
    "me",
    "my",
    "us",
    "about",
    "can",
    "could",
    "would",
    "please",
    "how",
    "what",
    "when",
    "where",
    "which",
    "who",
}

HARMFUL_PATTERNS = [
    re.compile(
        r"\b(how to|how do i|ways to|teach me to|help me to|help me|create|make|build|write)\b.{0,40}\b"
        r"(hack|exploit|malware|ransomware|phishing|ddos|sql injection|bruteforce)\b"
    ),
    re.compile(r"\b(bypass authentication|steal passwords|credential stuffing|keylogger|trojan)\b"),
    re.compile(r"\b(make a bomb|build a bomb|bomb recipe|how to kill|murder|assassinate)\b"),
    re.compile(r"\b(suicide|self harm|self-harm|cut myself|kill myself)\b"),
    re.compile(r"\b(credit card fraud|carding|identity theft|money laundering)\b"),
    re.compile(r"\b(rape|sexual assault|child porn|child pornography)\b"),
]

DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
SMALL_TALK_PATTERNS = [
    re.compile(r"\b(how are you|how are you doing|how's it going|how is it going|how are u)\b"),
    re.compile(r"\b(who are you|what are you)\b"),
    re.compile(r"\b(tell me a joke|joke|what's up|wassup|sup)\b"),
    re.compile(r"\b(i need help|can you help me)\b"),
]

FOLLOW_UP_HINTS = {
    "it",
    "that",
    "this",
    "those",
    "them",
    "more",
    "also",
    "and",
    "what",
    "how",
    "why",
    "when",
    "where",
    "about",
}


@dataclass(frozen=True)
class KnowledgeChunk:
    source_id: str
    source_title: str
    route: str | None
    text: str
    tokens: frozenset[str]


@dataclass(frozen=True)
class RankedChunk:
    score: float
    chunk: KnowledgeChunk


@dataclass(frozen=True)
class KnowledgeIndex:
    chunks: list[KnowledgeChunk]
    idf: dict[str, float]


@dataclass(frozen=True)
class IntentDecision:
    intent: str
    topics: frozenset[str]
    use_website_content: bool


def _tokenize(text: str) -> list[str]:
    return [token for token in TOKEN_RE.findall(text.lower()) if len(token) > 1 and token not in STOP_WORDS]


def _clean_text(text: str) -> str:
    normalized = html.unescape(text)
    normalized = normalized.replace("{/*", " ").replace("*/}", " ")
    normalized = re.sub(r"\{[^}]*\}", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" `\"'")
    return normalized


def _looks_like_noise(text: str) -> bool:
    lowered = text.lower()
    if len(text) < 4:
        return True
    if lowered in {"use client", "return", "null"}:
        return True
    if re.search(
        r"(className|import |export |from |=>|w-\d|h-\d|px-\d|py-\d|bg-|text-|rounded|shadow|const |function |onClick|href=)",
        lowered,
    ):
        return True
    if any(token in text for token in ["{", "}", "=>", "</", "/>"]):
        return True
    if re.search(r"https?://", lowered):
        return True
    alpha_count = sum(1 for char in text if char.isalpha())
    if alpha_count < max(3, int(len(text) * 0.35)):
        return True
    symbol_count = sum(1 for char in text if not char.isalnum() and char not in " .,!?':-()")
    if symbol_count > len(text) * 0.12:
        return True
    return False


def _extract_human_lines(raw_text: str) -> list[str]:
    candidates = JSX_TEXT_RE.findall(raw_text)

    unique_lines: list[str] = []
    seen = set()
    for candidate in candidates:
        cleaned = _clean_text(candidate)
        if not cleaned or _looks_like_noise(cleaned):
            continue
        normalized_key = cleaned.lower()
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        unique_lines.append(cleaned)
    return unique_lines


def _route_from_page_path(page_path: Path, app_root: Path) -> str:
    relative = page_path.relative_to(app_root)
    if relative.name != "page.tsx":
        return "/"
    parts = list(relative.parts[:-1])
    if not parts:
        return "/"
    route = "/" + "/".join(parts)
    return route


def _title_from_route(route: str) -> str:
    if route == "/":
        return "Home"
    segments = [segment for segment in route.strip("/").split("/") if segment and "[" not in segment and "]" not in segment]
    if not segments:
        return "Website"
    return " ".join(segment.replace("-", " ").title() for segment in segments)


def _build_chunks_from_lines(source_id_prefix: str, source_title: str, route: str | None, lines: list[str]) -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    chunk_lines: list[str] = []
    chunk_index = 0

    for line in lines:
        chunk_lines.append(line)
        merged = " ".join(chunk_lines)
        if len(merged) >= 300 or len(chunk_lines) >= 4:
            tokens = frozenset(_tokenize(merged))
            if tokens:
                chunks.append(
                    KnowledgeChunk(
                        source_id=f"{source_id_prefix}:{chunk_index}",
                        source_title=source_title,
                        route=route,
                        text=merged,
                        tokens=tokens,
                    )
                )
                chunk_index += 1
            chunk_lines = []

    if chunk_lines:
        merged = " ".join(chunk_lines)
        tokens = frozenset(_tokenize(merged))
        if tokens:
            chunks.append(
                KnowledgeChunk(
                    source_id=f"{source_id_prefix}:{chunk_index}",
                    source_title=source_title,
                    route=route,
                    text=merged,
                    tokens=tokens,
                )
            )
    return chunks


class WebsiteKnowledgeBase:
    _lock = threading.Lock()
    _cached_signature: tuple | None = None
    _cached_index: KnowledgeIndex | None = None

    @classmethod
    def get_index(cls) -> KnowledgeIndex:
        signature = cls._build_signature()
        with cls._lock:
            if cls._cached_signature == signature and cls._cached_index is not None:
                return cls._cached_index
            index = cls._build_index()
            cls._cached_signature = signature
            cls._cached_index = index
            return index

    @classmethod
    def _project_root(cls) -> Path:
        return Path(__file__).resolve().parents[2]

    @classmethod
    def _frontend_app_root(cls) -> Path:
        return cls._project_root() / "frontend" / "app"

    @classmethod
    def _frontend_component_paths(cls) -> list[Path]:
        component_root = cls._project_root() / "frontend" / "src" / "components"
        include_names = {"Footer.tsx", "Navbar.tsx", "ComingSoon.tsx", "ComingSoonBanner.tsx"}
        paths = [component_root / name for name in include_names]
        return [path for path in paths if path.exists()]

    @classmethod
    def _iter_public_pages(cls) -> Iterable[Path]:
        app_root = cls._frontend_app_root()
        if not app_root.exists():
            return []
        pages = sorted(app_root.rglob("page.tsx"))
        return pages

    @classmethod
    def _build_signature(cls) -> tuple:
        file_stats: list[tuple[str, int, int]] = []
        project_root = cls._project_root()

        for page in cls._iter_public_pages():
            stat = page.stat()
            file_stats.append((str(page.relative_to(project_root)), int(stat.st_mtime), stat.st_size))

        for component in cls._frontend_component_paths():
            stat = component.stat()
            file_stats.append((str(component.relative_to(project_root)), int(stat.st_mtime), stat.st_size))

        try:
            aggregate = Product.objects.aggregate(count=Count("id"), max_updated=Max("updated_at"))
            product_count = int(aggregate.get("count") or 0)
            max_updated = aggregate.get("max_updated")
            max_updated_ts = int(max_updated.timestamp()) if max_updated else 0
        except Exception:
            product_count = 0
            max_updated_ts = 0

        return (tuple(sorted(file_stats)), product_count, max_updated_ts)

    @classmethod
    def _build_frontend_chunks(cls) -> list[KnowledgeChunk]:
        chunks: list[KnowledgeChunk] = []
        app_root = cls._frontend_app_root()
        project_root = cls._project_root()

        for page in cls._iter_public_pages():
            route = _route_from_page_path(page, app_root)
            title = _title_from_route(route)
            try:
                lines = _extract_human_lines(page.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                continue
            if not lines:
                continue
            source_id_prefix = str(page.relative_to(project_root)).replace("\\", "/")
            chunks.extend(_build_chunks_from_lines(source_id_prefix, title, route, lines))

        for component in cls._frontend_component_paths():
            try:
                lines = _extract_human_lines(component.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                continue
            if not lines:
                continue
            source_id_prefix = str(component.relative_to(project_root)).replace("\\", "/")
            title = component.stem
            chunks.extend(_build_chunks_from_lines(source_id_prefix, title, None, lines))

        return chunks

    @classmethod
    def _build_product_chunks(cls) -> list[KnowledgeChunk]:
        chunks: list[KnowledgeChunk] = []
        products = Product.objects.select_related("vendor", "category").filter(is_active=True).order_by("-updated_at")

        for product in products:
            category_name = product.category.name if product.category else "General"
            vendor_name = getattr(product.vendor, "store_name", "Vendor")
            route = f"/product/{product.slug or product.id}"
            text = (
                f"{product.title}. {product.description} "
                f"Category: {category_name}. Vendor: {vendor_name}. "
                f"Price: KES {product.price}. Stock available: {product.stock}. "
                f"{'This product is currently active.' if product.is_active else 'This product is currently inactive.'}"
            )
            cleaned = _clean_text(text)
            tokens = frozenset(_tokenize(cleaned))
            if not tokens:
                continue
            chunks.append(
                KnowledgeChunk(
                    source_id=f"product:{product.id}",
                    source_title=product.title,
                    route=route,
                    text=cleaned,
                    tokens=tokens,
                )
            )
        return chunks

    @classmethod
    def _build_index(cls) -> KnowledgeIndex:
        chunks = cls._build_frontend_chunks() + cls._build_product_chunks()

        if not chunks:
            fallback = "King-Kush Stores support is available for products, orders, payments, shipping, returns, and policy questions."
            chunks = [
                KnowledgeChunk(
                    source_id="fallback:0",
                    source_title="Support",
                    route="/",
                    text=fallback,
                    tokens=frozenset(_tokenize(fallback)),
                )
            ]

        document_frequency: dict[str, int] = {}
        for chunk in chunks:
            for token in chunk.tokens:
                document_frequency[token] = document_frequency.get(token, 0) + 1

        total_documents = len(chunks)
        idf = {
            token: math.log((total_documents + 1) / (df + 1)) + 1.0
            for token, df in document_frequency.items()
        }
        return KnowledgeIndex(chunks=chunks, idf=idf)


def _is_navigation_request(tokens: set[str], lowered: str) -> bool:
    if tokens & NAVIGATION_HINTS:
        return True
    phrases = ["where can i find", "how do i get to", "which page", "how to navigate", "where is"]
    return any(phrase in lowered for phrase in phrases)


def _is_greeting(tokens: set[str]) -> bool:
    return bool(tokens & GREETING_WORDS) and len(tokens) <= 5


def _is_thanks(tokens: set[str]) -> bool:
    return bool(tokens & THANKS_WORDS) and len(tokens) <= 6


def _asks_capabilities(tokens: set[str], lowered: str) -> bool:
    return ("what can you do" in lowered) or ("how can you help" in lowered) or bool(tokens & CAPABILITY_WORDS and {"help", "support"} & tokens)


def _is_small_talk(lowered: str) -> bool:
    return any(pattern.search(lowered) for pattern in SMALL_TALK_PATTERNS)


def _is_support_request(tokens: set[str], lowered: str, topics: set[str]) -> bool:
    if topics:
        return True

    support_phrases = [
        "where can i find",
        "help me with",
        "i have an issue",
        "problem with",
        "track my",
        "checkout",
    ]
    return any(phrase in lowered for phrase in support_phrases) or bool(tokens & NAVIGATION_HINTS)


def _recent_user_messages(history: list[dict] | None) -> list[str]:
    if not history:
        return []
    return [
        str(item.get("text", "")).strip()
        for item in history[-8:]
        if isinstance(item, dict) and item.get("sender") == "user" and item.get("text")
    ]


def _recent_topics_from_history(history: list[dict] | None) -> set[str]:
    topics: set[str] = set()
    for message in _recent_user_messages(history):
        tokens = set(_tokenize(message.lower()))
        topics |= _detect_topics(tokens)
    return topics


def _is_follow_up_message(tokens: set[str], lowered: str) -> bool:
    if len(tokens) <= 2:
        return True
    if tokens and tokens <= FOLLOW_UP_HINTS:
        return True
    if lowered.startswith("what about") or lowered.startswith("and "):
        return True
    return False


def _day_period() -> str:
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 23:
        return "evening"
    return "hello"


def _display_name(user_profile: dict | None) -> str | None:
    if not user_profile or not user_profile.get("is_authenticated"):
        return None

    first_name = (user_profile.get("first_name") or "").strip()
    if first_name:
        return first_name.title()

    email = (user_profile.get("email") or "").strip()
    if not email or "@" not in email:
        return None
    local = email.split("@", 1)[0].replace(".", " ").replace("_", " ").strip()
    return local.title() if local else None


def _build_dynamic_greeting(user_profile: dict | None, history: list[dict] | None, user_message: str) -> str:
    name = _display_name(user_profile)
    day_period = _day_period()
    is_returning = bool(history and len(history) > 0)

    if day_period == "hello":
        generic = "Hello"
    else:
        generic = f"Good {day_period}"

    if name:
        templates = [
            f"{generic}, {name}! How may I assist you today?",
            f"{generic}, {name}. Welcome back to King-Kush Stores. What can I help you with today?",
            f"Hello {name}, great to see you again. How can I support you today?",
        ]
    else:
        templates = [
            f"{generic}! Welcome to King-Kush Stores. How may I assist you today?",
            "Hello! Welcome to King-Kush Stores support. How can I help you today?",
            "Hi there. I am here to help with products, orders, payments, shipping, and returns. What do you need?",
        ]

    if not is_returning and len(templates) > 1:
        return templates[0]

    choice_index = (len(user_message) + (len(history) if history else 0)) % len(templates)
    return templates[choice_index]


def _build_small_talk_reply(user_profile: dict | None) -> str:
    name = _display_name(user_profile)
    if name:
        return (
            f"I'm doing great, {name}. Thanks for asking. How may I help you today?"
        )
    return "I'm doing well, thank you for asking. How can I assist you today?"


def _build_irrelevant_reply(user_profile: dict | None) -> str:
    name = _display_name(user_profile)
    if name:
        return (
            f"I hear you, {name}. I can help with King-Kush topics like products, orders, payments, shipping, returns, "
            "and account support. What would you like to do?"
        )
    return (
        "I can help with King-Kush topics like products, orders, payments, shipping, returns, and account support. "
        "What would you like to do?"
    )


def _classify_intent(message: str, history: list[dict] | None) -> IntentDecision:
    lowered = message.lower().strip()
    tokens = set(_tokenize(lowered))
    topics = _detect_topics(tokens)

    if _is_small_talk(lowered):
        return IntentDecision(intent="small_talk", topics=frozenset(), use_website_content=False)

    if _is_greeting(tokens) and not _is_support_request(tokens, lowered, topics):
        return IntentDecision(intent="greeting", topics=frozenset(), use_website_content=False)

    if _is_thanks(tokens):
        return IntentDecision(intent="thanks", topics=frozenset(), use_website_content=False)

    if _asks_capabilities(tokens, lowered):
        return IntentDecision(intent="capabilities", topics=frozenset(), use_website_content=False)

    if _is_support_request(tokens, lowered, topics):
        return IntentDecision(intent="website_support", topics=frozenset(topics), use_website_content=True)

    history_topics = _recent_topics_from_history(history)
    if history_topics and _is_follow_up_message(tokens, lowered):
        return IntentDecision(intent="website_support_followup", topics=frozenset(history_topics), use_website_content=True)

    return IntentDecision(intent="irrelevant_or_unclear", topics=frozenset(), use_website_content=False)


def _best_snippet(text: str, query_tokens: set[str]) -> str:
    sentences = SENTENCE_RE.split(text)
    for sentence in sentences:
        sentence_tokens = set(_tokenize(sentence))
        if sentence_tokens & query_tokens:
            cleaned = _clean_text(sentence)
            if cleaned and not _looks_like_noise(cleaned):
                return cleaned
    fallback = _clean_text(sentences[0]) if sentences else _clean_text(text)
    if fallback and not _looks_like_noise(fallback):
        return fallback
    return ""


def _route_matches_topics(route: str, query_topics: set[str]) -> bool:
    if not query_topics:
        return True

    route_lower = route.lower()
    for topic in query_topics:
        rule = TOPIC_RULES.get(topic)
        if not rule:
            continue
        if any(term in route_lower for term in rule["route_terms"]):
            return True
    return False


def _detect_topics(query_tokens: set[str]) -> set[str]:
    topics = set()
    for topic, rule in TOPIC_RULES.items():
        if query_tokens & rule["keywords"]:
            topics.add(topic)
    return topics


def _topic_bonus(chunk: KnowledgeChunk, query_topics: set[str]) -> float:
    if not query_topics:
        return 0.0

    chunk_text_lower = chunk.text.lower()
    route_lower = (chunk.route or "").lower()
    bonus = 0.0

    for topic in query_topics:
        rule = TOPIC_RULES.get(topic)
        if not rule:
            continue
        if any(keyword in chunk_text_lower for keyword in rule["keywords"]):
            bonus += 0.6
        if route_lower and any(term in route_lower for term in rule["route_terms"]):
            bonus += 1.2
        if topic == "products" and chunk.source_id.startswith("product:"):
            bonus += 1.2

    if chunk.route and query_topics:
        route_lower = chunk.route.lower()
        if not _route_matches_topics(chunk.route, query_topics):
            bonus -= 2.0
        if "orders" in query_topics and "privacy" in route_lower:
            bonus -= 1.5

    return bonus


def _score_chunk(query_lower: str, query_tokens: set[str], query_topics: set[str], index: KnowledgeIndex, chunk: KnowledgeChunk) -> float:
    overlap = query_tokens & set(chunk.tokens)
    if not overlap:
        return 0.0
    score = sum(index.idf.get(token, 1.0) for token in overlap)
    score += len(overlap) / max(1.0, len(query_tokens))

    if query_lower in chunk.text.lower():
        score += 2.5
    if chunk.route:
        route_tokens = set(_tokenize(chunk.route.replace("/", " ")))
        if route_tokens & query_tokens:
            score += 0.8
    if chunk.source_id.startswith("product:"):
        score += 0.5
    score += _topic_bonus(chunk, query_topics)
    return score


def _rank_chunks(query: str, index: KnowledgeIndex, limit: int = 6) -> list[RankedChunk]:
    query_lower = query.lower()
    query_tokens = set(_tokenize(query_lower))
    if not query_tokens:
        return []
    query_topics = _detect_topics(query_tokens)

    ranked: list[RankedChunk] = []
    for chunk in index.chunks:
        score = _score_chunk(query_lower, query_tokens, query_topics, index, chunk)
        if score > 0:
            ranked.append(RankedChunk(score=score, chunk=chunk))

    ranked.sort(key=lambda item: item.score, reverse=True)
    return ranked[:limit]


def _moderation_refusal(message: str) -> str | None:
    lowered = message.lower()
    for pattern in HARMFUL_PATTERNS:
        if pattern.search(lowered):
            return (
                "Sorry, I can't help with harmful, illegal, or malicious requests. "
                "I can help with products, ordering, payments, shipping, returns, and site navigation."
            )
    return None


def _build_fallback_reply() -> str:
    return (
        "I can assist using all public King-Kush Stores content, including products, checkout, payments, shipping, "
        "returns, support pages, and policies.\n\n"
        "Examples:\n"
        "- \"How do I place an order?\"\n"
        "- \"What is your return policy?\"\n"
        "- \"Show me products related to furniture\"\n"
        "- \"Where can I track my order?\""
    )


def _ai_enabled() -> bool:
    # Avoid external API calls during automated test runs.
    if "test" in sys.argv:
        return False
    if os.getenv("CHATBOT_USE_AI", "true").strip().lower() in {"0", "false", "no", "off"}:
        return False
    return True


def _selected_ai_provider() -> str | None:
    if not _ai_enabled():
        return None

    provider = os.getenv("CHATBOT_AI_PROVIDER", "auto").strip().lower()
    has_openai = bool(os.getenv("OPENAI_API_KEY", "").strip())
    has_gemini = bool(os.getenv("GEMINI_API_KEY", "").strip())

    if provider == "openai":
        return "openai" if has_openai else None
    if provider == "gemini":
        return "gemini" if has_gemini else None

    # auto mode: prefer OpenAI, then Gemini.
    if has_openai:
        return "openai"
    if has_gemini:
        return "gemini"
    return None


def _safe_history_lines(history: list[dict] | None) -> list[str]:
    if not history:
        return []

    lines: list[str] = []
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        sender = str(item.get("sender", "user")).strip().lower()
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        role = "User" if sender == "user" else "Assistant"
        lines.append(f"{role}: {text}")
    return lines


def _format_user_profile(user_profile: dict | None) -> str:
    if not user_profile:
        return "Visitor (not signed in)."

    if not user_profile.get("is_authenticated"):
        return "Visitor (not signed in)."

    email = user_profile.get("email") or "Unknown email"
    customer_id = user_profile.get("customer_id") or "No customer ID"
    first_name = user_profile.get("first_name") or "Customer"
    return f"Signed-in customer: {first_name}, email: {email}, customer_id: {customer_id}."


def _call_gemini(prompt: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
    encoded_model = urllib.parse.quote(model, safe="")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{encoded_model}:generateContent?key={api_key}"

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.35,
            "topP": 0.9,
            "maxOutputTokens": 420,
        },
    }
    request_body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None

    candidates = parsed.get("candidates") or []
    if not candidates:
        return None

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text = "".join(str(part.get("text", "")) for part in parts).strip()
    if not text:
        return None
    return text


def _call_openai(prompt: str) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    endpoint = "https://api.openai.com/v1/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a professional and friendly customer support assistant."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.35,
        "max_tokens": 420,
    }

    request_body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=request_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None

    choices = parsed.get("choices") or []
    if not choices:
        return None
    message = choices[0].get("message") or {}
    text = str(message.get("content", "")).strip()
    if not text:
        return None
    return text


def _enhance_with_ai(
    user_message: str,
    history: list[dict] | None,
    grounded_reply: str,
    user_profile: dict | None,
) -> str:
    provider = _selected_ai_provider()
    if not provider:
        return grounded_reply

    history_lines = _safe_history_lines(history)
    history_block = "\n".join(history_lines) if history_lines else "No prior messages."
    user_context = _format_user_profile(user_profile)

    prompt = (
        "You are King-Kush Stores customer support assistant.\n"
        "Write a professional, warm, and practical response.\n"
        "Rules:\n"
        "1) Use ONLY the grounded facts provided below. Do not invent details.\n"
        "2) Answer directly first, then add short actionable next steps.\n"
        "3) Include at most 2 markdown links, and only when clearly helpful.\n"
        "4) Keep response concise and clear.\n"
        "5) If grounded data is insufficient, say what is missing and offer the next best help.\n"
        "6) Avoid repetitive scripted phrasing. Keep greeting responses short and natural.\n"
        "7) Use the customer's first name when available.\n\n"
        f"User profile:\n{user_context}\n\n"
        f"Conversation history:\n{history_block}\n\n"
        f"User latest message:\n{user_message}\n\n"
        f"Grounded website response draft:\n{grounded_reply}\n\n"
        "Now produce the final response."
    )

    if provider == "openai":
        refined = _call_openai(prompt)
    elif provider == "gemini":
        refined = _call_gemini(prompt)
    else:
        refined = None
    return refined or grounded_reply


def generate_support_response(message: str, history: list[dict] | None = None, user_profile: dict | None = None) -> str:
    normalized_message = (message or "").strip()
    if not normalized_message:
        return "Please type your question, and I'll help using the current website content."

    moderation_reply = _moderation_refusal(normalized_message)
    if moderation_reply:
        return moderation_reply

    intent = _classify_intent(normalized_message, history)

    if intent.intent == "greeting":
        return _build_dynamic_greeting(user_profile, history, normalized_message)

    if intent.intent == "small_talk":
        return _build_small_talk_reply(user_profile)

    if intent.intent == "thanks":
        return "You're welcome. If you share the exact issue, I can provide a precise next step."

    if intent.intent == "capabilities":
        return _build_fallback_reply()

    if intent.intent == "irrelevant_or_unclear":
        return _build_irrelevant_reply(user_profile)

    search_query = normalized_message
    lowered = normalized_message.lower()
    tokens = set(_tokenize(lowered))
    # Use recent user context for short follow-ups.
    if history and (intent.intent == "website_support_followup" or len(tokens) <= 4):
        prior_user_messages = [
            item.get("text", "").strip()
            for item in history[-6:]
            if isinstance(item, dict) and item.get("sender") == "user" and item.get("text")
        ]
        if prior_user_messages:
            search_query = " ".join(prior_user_messages[-2:] + [normalized_message])

    index = WebsiteKnowledgeBase.get_index()
    ranked = _rank_chunks(search_query, index)

    if not ranked:
        draft = _build_fallback_reply()
        return _enhance_with_ai(normalized_message, history, draft, user_profile)

    query_tokens = set(_tokenize(search_query))
    query_topics = set(intent.topics) or _detect_topics(query_tokens)
    is_navigation_request = _is_navigation_request(tokens, lowered)

    response_points: list[str] = []
    helpful_links: list[tuple[str, str]] = []
    seen_snippets = set()
    seen_routes = set()

    for ranked_chunk in ranked:
        route = ranked_chunk.chunk.route
        if query_topics and route and not _route_matches_topics(route, query_topics):
            continue

        snippet = _best_snippet(ranked_chunk.chunk.text, query_tokens)
        if snippet.lower() == normalized_message.lower():
            continue
        if snippet:
            snippet_key = snippet.lower()
            if snippet_key not in seen_snippets:
                seen_snippets.add(snippet_key)
                response_points.append(snippet)
        if route and route not in seen_routes and "[" not in route and "]" not in route:
            seen_routes.add(route)
            helpful_links.append((ranked_chunk.chunk.source_title, route))
        if len(response_points) >= 3 and len(helpful_links) >= 3:
            break

    if not response_points:
        draft = _build_fallback_reply()
        return _enhance_with_ai(normalized_message, history, draft, user_profile)

    if is_navigation_request:
        intro = "Certainly. Based on the current site content, here is the best path:"
    else:
        intro = "Certainly. Based on the current King-Kush Stores content:"

    reply_lines = [intro]
    reply_lines.extend(f"- {point}" for point in response_points[:3])

    if helpful_links:
        reply_lines.append("")
        reply_lines.append("Helpful links:")
        for title, route in helpful_links[:3]:
            reply_lines.append(f"- [{title}]({route})")

    reply_lines.append("")
    reply_lines.append("If needed, I can now give you a step-by-step action for this exact issue.")

    draft = "\n".join(reply_lines)
    return _enhance_with_ai(normalized_message, history, draft, user_profile)
