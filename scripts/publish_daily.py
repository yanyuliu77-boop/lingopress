#!/usr/bin/env python3
"""Build one original LingoPress lesson from a current English news report."""

from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "content" / "articles.js"
ASSET_DIR = ROOT / "assets"
TIMEZONE = ZoneInfo("Asia/Shanghai")
MODELS_URL = "https://models.github.ai/inference/chat/completions"
MODEL = os.environ.get("LINGOPRESS_MODEL", "openai/gpt-4.1-mini")
USER_AGENT = "LingoPress lesson builder/1.0 (+https://github.com/yanyuliu77-boop/lingopress)"

SOURCES = [
    {
        "name": "BBC NEWS",
        "feed": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "category": "国际视野",
        "topic": "World · Society",
    },
    {
        "name": "THE GUARDIAN",
        "feed": "https://www.theguardian.com/world/rss",
        "category": "全球议题",
        "topic": "World · Policy",
    },
    {
        "name": "THE NEW YORK TIMES",
        "feed": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        "category": "国际新闻",
        "topic": "World · Current Affairs",
    },
    {
        "name": "BBC BUSINESS",
        "feed": "https://feeds.bbci.co.uk/news/business/rss.xml",
        "category": "全球商业",
        "topic": "Business · Economy",
    },
    {
        "name": "BBC INNOVATION",
        "feed": "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "category": "科技创新",
        "topic": "Technology · Future",
    },
]


def load_catalog() -> dict:
    raw = DATA_FILE.read_text(encoding="utf-8").strip()
    prefix = "window.LINGOPRESS_DATA = "
    if not raw.startswith(prefix) or not raw.endswith(";"):
        raise ValueError("content/articles.js has an unexpected wrapper")
    body = raw[len(prefix) : -1]
    body = re.sub(r"(?m)^(\s*)([A-Za-z][A-Za-z0-9]*):", r'\1"\2":', body)
    return json.loads(body)


def save_catalog(catalog: dict) -> None:
    catalog["generatedAt"] = datetime.now(TIMEZONE).isoformat(timespec="seconds")
    payload = json.dumps(catalog, ensure_ascii=False, indent=2)
    DATA_FILE.write_text(f"window.LINGOPRESS_DATA = {payload};\n", encoding="utf-8")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


class ParagraphExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_paragraph = False
        self.current: list[str] = []
        self.paragraphs: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "p":
            self.in_paragraph = True
            self.current = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self.in_paragraph:
            text = " ".join("".join(self.current).split())
            if text:
                self.paragraphs.append(text)
            self.in_paragraph = False

    def handle_data(self, data: str) -> None:
        if self.in_paragraph:
            self.current.append(data)


def request_bytes(url: str, *, timeout: int = 30, data: bytes | None = None, headers: dict | None = None) -> tuple[bytes, str]:
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    request = Request(url, data=data, headers=request_headers, method="POST" if data is not None else "GET")
    with urlopen(request, timeout=timeout) as response:
        return response.read(), response.headers.get("content-type", "")


def clean_html(value: str) -> str:
    parser = TextExtractor()
    parser.feed(html.unescape(value or ""))
    return " ".join(" ".join(parser.parts).split())


def feed_items(source: dict) -> list[dict]:
    payload, _ = request_bytes(source["feed"], timeout=25)
    root = ET.fromstring(payload)
    items = []
    for node in root.findall(".//item"):
        title = clean_html(node.findtext("title", ""))
        link = clean_html(node.findtext("link", ""))
        description = clean_html(node.findtext("description", ""))
        if title and link and not re.search(r"\b(live|podcast|quiz|photos?)\b", title, re.I):
            items.append({"title": title, "url": link, "description": description, "source": source})
    return items


def choose_story(catalog: dict, today) -> dict:
    used = {item.get("sourceUrl") for item in catalog["articles"]}
    start = today.toordinal() % len(SOURCES)
    errors = []
    for offset in range(len(SOURCES)):
        source = SOURCES[(start + offset) % len(SOURCES)]
        try:
            candidates = feed_items(source)
            story = next((item for item in candidates if item["url"] not in used), None)
            if story:
                return story
        except Exception as exc:  # A failed publisher should not block other sources.
            errors.append(f"{source['name']}: {exc}")
    raise RuntimeError("No unused RSS story was available. " + " | ".join(errors))


def extract_story(story: dict) -> str:
    payload, content_type = request_bytes(story["url"], timeout=30)
    charset = "utf-8"
    match = re.search(r"charset=([^;\s]+)", content_type, re.I)
    if match:
        charset = match.group(1).strip('"')
    parser = ParagraphExtractor()
    parser.feed(payload.decode(charset, errors="replace"))
    paragraphs = []
    for text in parser.paragraphs:
        if 45 <= len(text) <= 1200 and text not in paragraphs:
            paragraphs.append(text)
    extracted = "\n".join(paragraphs[:24])
    if len(extracted) < 500:
        extracted = f"{story['title']}\n{story['description']}"
    return extracted[:14000]


def generation_prompt(story: dict, source_text: str) -> str:
    return f"""
You are the senior editor of LingoPress, a daily English close-reading product for Chinese university and exam-prep students.

Create a factually conservative, ORIGINAL educational adaptation based only on the source material below. Do not reproduce the report. Do not reuse a source sentence or a sequence longer than 10 words. Do not invent names, numbers, quotations or causal claims. Attribute uncertain claims. The published English lesson should stand on its own and be 520-680 words at CEFR C1 level.

Return one JSON object only, with exactly this structure:
{{
  "homeTitle": "concise Chinese headline",
  "dek": "one Chinese sentence explaining the question and significance",
  "title": "English lesson headline",
  "standfirst": "English standfirst",
  "keyTakeaway": "one Chinese takeaway",
  "summaryPoints": ["three Chinese factual points", "...", "..."],
  "phrase": {{"term":"a useful phrase that appears verbatim in the lesson", "phonetic":"IPA", "meaning":"Chinese meaning", "example":"one lesson sentence containing it"}},
  "syntax": {{"sentence":"one exact complex sentence from the lesson", "explanation":"Chinese breakdown identifying the main clause and dependent structures"}},
  "paragraphs": [
    {{"en":"90-120 words", "zh":"faithful Chinese translation", "note":"Chinese knowledge point, prefixed with 写作观察：/长难句：/词义辨析：/衔接逻辑：/修辞亮点：/段落作用："}}
  ],
  "dictionary": {{
    "lowercase term appearing verbatim in the lesson": {{"phonetic":"IPA", "meaning":"part of speech plus Chinese meaning", "example":"short original example"}}
  }},
  "quizzes": [
    {{"q":"Chinese comprehension question", "options":["three Chinese options"], "answer":0}}
  ],
  "imageQuery": "2-5 concrete English search words suitable for Wikimedia Commons"
}}

Requirements: exactly 6 paragraphs, 12-15 dictionary entries, exactly 3 quizzes, three options per quiz, and answer must be 0, 1 or 2. The English must be an original synthesis, not a translation or close paraphrase of the source. Avoid long direct quotations. Use straight apostrophes. No markdown and no HTML.

Source publication: {story['source']['name']}
Source headline: {story['title']}
Source URL: {story['url']}
RSS summary: {story['description']}
Source material for fact-checking only:
{source_text}
""".strip()


def parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def generate_lesson(story: dict, source_text: str) -> dict:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("MODELS_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN or MODELS_TOKEN is required")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "Return strict JSON. Accuracy and copyright-safe original writing are mandatory."},
            {"role": "user", "content": generation_prompt(story, source_text)},
        ],
        "temperature": 0.25,
        "max_tokens": 6500,
        "response_format": {"type": "json_object"},
    }
    last_error = None
    for attempt in range(3):
        try:
            raw, _ = request_bytes(
                MODELS_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                timeout=120,
            )
            response = json.loads(raw)
            return parse_json_response(response["choices"][0]["message"]["content"])
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            last_error = RuntimeError(f"HTTP {exc.code}: {detail}")
            time.sleep(3 * (attempt + 1))
        except Exception as exc:
            last_error = exc
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"GitHub Models generation failed: {last_error}")


def validate_lesson(lesson: dict) -> None:
    required = ["homeTitle", "dek", "title", "standfirst", "keyTakeaway", "summaryPoints", "phrase", "syntax", "paragraphs", "dictionary", "quizzes", "imageQuery"]
    missing = [key for key in required if not lesson.get(key)]
    if missing:
        raise ValueError(f"Generated lesson is missing: {', '.join(missing)}")
    if len(lesson["paragraphs"]) != 6 or len(lesson["summaryPoints"]) != 3 or len(lesson["quizzes"]) != 3:
        raise ValueError("Lesson must contain 6 paragraphs, 3 summary points and 3 quizzes")
    if not 10 <= len(lesson["dictionary"]) <= 16:
        raise ValueError("Lesson dictionary must contain 10-16 entries")
    full_text = " ".join(item.get("en", "") for item in lesson["paragraphs"]).lower()
    word_count = len(full_text.split())
    if not 330 <= word_count <= 740:
        raise ValueError(f"Lesson word count {word_count} is outside the accepted range")
    for term, data in lesson["dictionary"].items():
        if term.lower() not in full_text or not all(data.get(key) for key in ("phonetic", "meaning", "example")):
            raise ValueError(f"Invalid dictionary entry: {term}")
    if lesson["phrase"]["term"].lower() not in full_text:
        raise ValueError("Phrase of the day does not appear in the lesson")
    for quiz in lesson["quizzes"]:
        if len(quiz.get("options", [])) != 3 or quiz.get("answer") not in (0, 1, 2):
            raise ValueError("Each quiz needs three options and a valid answer")


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:48] or "daily-brief"


def fetch_commons_image(query: str, target_stem: str) -> tuple[str, str]:
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": 6,
        "gsrlimit": 8,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 1400,
        "format": "json",
        "origin": "*",
    }
    api_url = "https://commons.wikimedia.org/w/api.php?" + urlencode(params)
    raw, _ = request_bytes(api_url, timeout=30)
    pages = json.loads(raw).get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if not url or not re.search(r"\.(?:jpe?g|png|webp)$", urlparse(url).path, re.I):
            continue
        image, content_type = request_bytes(url, timeout=40)
        if len(image) > 8_000_000:
            continue
        suffix = ".png" if "png" in content_type else ".jpg"
        filename = f"assets/{target_stem}{suffix}"
        (ROOT / filename).write_bytes(image)
        meta = info.get("extmetadata", {})
        artist = clean_html(meta.get("Artist", {}).get("value", "Wikimedia Commons"))
        license_name = clean_html(meta.get("LicenseShortName", {}).get("value", ""))
        credit = " · ".join(part for part in (artist[:70], license_name) if part)
        return filename, credit or "Wikimedia Commons"
    raise RuntimeError("No usable Wikimedia Commons image found")


def build_article(catalog: dict, story: dict, lesson: dict, today) -> dict:
    issue = max((int(item.get("issue", 0)) for item in catalog["articles"]), default=0) + 1
    stem = f"{today.isoformat()}-{slugify(lesson['title'])}"
    try:
        image_path, image_credit = fetch_commons_image(lesson["imageQuery"], stem)
    except Exception as exc:
        print(f"Image lookup failed, retaining the editorial fallback: {exc}", file=sys.stderr)
        image_path, image_credit = "yiwu-market.jpg", "LingoPress editorial fallback"
    return {
        "id": stem,
        "issue": issue,
        "publishAt": f"{today.isoformat()}T07:00:00+08:00",
        "source": story["source"]["name"],
        "sourceUrl": story["url"],
        "sourceArticleTitle": story["title"],
        "category": story["source"]["category"],
        "topic": story["source"]["topic"],
        "level": "C1",
        "readingMinutes": 12,
        "heroImage": image_path,
        "heroImageAlt": lesson["imageQuery"],
        "imageCredit": image_credit,
        **{key: lesson[key] for key in ("homeTitle", "dek", "title", "standfirst", "keyTakeaway", "summaryPoints", "phrase", "syntax", "paragraphs", "dictionary", "quizzes")},
    }


def main() -> None:
    now = datetime.now(TIMEZONE)
    today = now.date()
    catalog = load_catalog()
    publish_at = f"{today.isoformat()}T07:00:00+08:00"
    if any(item.get("publishAt") == publish_at for item in catalog["articles"]):
        print(f"Edition for {today.isoformat()} already exists; nothing to publish.")
        return
    story = choose_story(catalog, today)
    print(f"Selected {story['source']['name']}: {story['title']}")
    try:
        source_text = extract_story(story)
    except Exception as exc:
        print(f"Full article was unavailable; using the public RSS material: {exc}", file=sys.stderr)
        source_text = f"{story['title']}\n{story['description']}"
    lesson = generate_lesson(story, source_text)
    validate_lesson(lesson)
    article = build_article(catalog, story, lesson, today)
    catalog["articles"].insert(0, article)
    catalog["articles"] = catalog["articles"][:60]
    save_catalog(catalog)
    print(f"Prepared issue {article['issue']} for {article['publishAt']}: {article['title']}")


if __name__ == "__main__":
    main()
