"""Turns a transcript into a structured summary.

Without an LLM_API_KEY, generate_summary falls back to a clearly-labeled stub (naive
truncation/splitting, no model call) so the pipeline is testable end to end without a
provider account. It is never presented as a real AI result — "source" says which path
produced it, and the frontend/teacher-review flow must surface that honestly.
"""

import json

from app.config import get_settings

settings = get_settings()

SUMMARY_SCHEMA_KEYS = {
    "overview",
    "key_concepts",
    "definitions",
    "examples",
    "revision_questions",
    "quiz_questions",
}


def _build_offline_quiz(sentences: list[str], definitions: list | None = None) -> list[dict]:
    """Builds compact offline self-check MCQs (<2 KB) directly from lecture key statements."""
    quiz: list[dict] = []
    for idx, sent in enumerate(sentences[:3]):
        words = [w.strip(",.;:!?()[]{}\"'") for w in sent.split() if len(w.strip(",.;:!?()[]{}\"'")) >= 5]
        if not words:
            continue
        keyword = max(words, key=len)
        blanked = sent.replace(keyword, "______", 1)
        distractors = [w for w in ("latency", "throughput", "protocol", "bandwidth", "gradient", "entropy") if w.lower() != keyword.lower()]
        options = [keyword, distractors[0], distractors[1], distractors[2]]
        # Rotate answer slot deterministically so option 0 isn't always right
        shift = idx % len(options)
        rotated = options[shift:] + options[:shift]
        quiz.append(
            {
                "question": f"Complete the key lecture concept: {blanked}",
                "options": rotated,
                "answer_index": rotated.index(keyword),
                "explanation": sent,
            }
        )
    if definitions and len(quiz) < 3:
        for item in definitions[: 3 - len(quiz)]:
            if isinstance(item, dict) and item.get("term") and item.get("definition"):
                term = str(item["term"])
                quiz.append(
                    {
                        "question": f"Which term matches this definition: {item['definition']}",
                        "options": [term, "Unrelated buffer", "Static cache", "Fallback proxy"],
                        "answer_index": 0,
                        "explanation": f"{term}: {item['definition']}",
                    }
                )
    return quiz


def _extract_ranked_sentences(transcript_text: str) -> tuple[list[str], list[dict[str, str]], list[str]]:
    """Extracts sentences scored by TF frequency, definitions, and discourse cue markers."""
    import math
    import re
    from collections import Counter

    raw_sentences = [
        s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", transcript_text or "") if len(s.strip().split()) >= 4
    ]
    if not raw_sentences:
        fallback = [s.strip() for s in (transcript_text or "").replace("\n", " ").split(".") if s.strip()]
        return fallback, [], []

    stop_words = {
        "about", "after", "again", "being", "below", "between", "could", "doing", "during",
        "first", "found", "their", "there", "these", "thing", "think", "those", "through",
        "today", "using", "where", "which", "while", "would", "because", "should", "other",
    }
    token_lists: list[list[str]] = []
    df_counts: Counter[str] = Counter()
    all_tf: Counter[str] = Counter()
    for sent in raw_sentences:
        tokens = [
            w.lower()
            for w in re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", sent)
            if w.lower() not in stop_words
        ]
        token_lists.append(tokens)
        all_tf.update(tokens)
        for tok in set(tokens):
            df_counts[tok] += 1

    n_docs = max(len(raw_sentences), 1)
    cue_words = ("important", "key", "therefore", "means", "defined", "formula", "remember", "exam", "principle", "law")
    scored: list[tuple[float, int, str]] = []
    definitions: list[dict[str, str]] = []
    def_pattern = re.compile(r"^([A-Za-z0-9\s_'’-]{2,45}?)\s+(?:is defined as|refers to|means|is)\s+(.+)$", re.IGNORECASE)

    for idx, sent in enumerate(raw_sentences):
        tokens = token_lists[idx]
        if not tokens:
            continue
        score = sum(
            (all_tf[t] * math.log((n_docs + 1) / (df_counts[t] + 1) + 1.0)) for t in set(tokens)
        ) / (len(tokens) ** 0.5)
        lower = sent.lower()
        if any(cue in lower for cue in cue_words):
            score *= 1.35
        if idx < 2 or idx >= len(raw_sentences) - 2:
            score *= 1.15
        scored.append((score, idx, sent))

        match = def_pattern.match(sent.rstrip(".!?"))
        if match and len(definitions) < 5:
            term = match.group(1).strip(" \"'")
            defn = match.group(2).strip()
            if 2 <= len(term) <= 45 and len(defn) >= 8:
                definitions.append({"term": term, "definition": defn})

    scored.sort(key=lambda item: item[0], reverse=True)
    top_indices = sorted(idx for _, idx, _ in scored[: max(4, min(8, len(raw_sentences)))])
    ranked_sentences = [raw_sentences[idx] for idx in top_indices]
    top_keywords = [word for word, _ in all_tf.most_common(12)]
    return ranked_sentences, definitions, top_keywords


def _stub_summary(transcript_text: str, *, target_language: str = "en") -> dict:
    sentences = [s.strip() for s in transcript_text.replace("\n", " ").split(".") if s.strip()]
    ranked, definitions, top_keywords = _extract_ranked_sentences(transcript_text)
    chosen = ranked if ranked else sentences

    overview = ". ".join(chosen[:2])
    if overview and not overview.endswith((".", "!", "?")):
        overview += "."
    if not overview:
        overview = "Transcript was too short to summarize."

    key_concepts = chosen[2:6] if len(chosen) > 2 else chosen[:3]
    examples = [s for s in chosen if "example" in s.lower() or "for instance" in s.lower()][:3]
    if not examples and len(chosen) > 5:
        examples = chosen[5:7]

    rev_qs = [f"Explain the principle behind: \"{s}\"" for s in chosen[:4]]
    quiz = _build_offline_quiz(chosen, definitions)
    return {
        "overview": overview,
        "key_concepts": key_concepts,
        "definitions": definitions,
        "examples": examples,
        "revision_questions": rev_qs,
        "quiz_questions": quiz,
        "keywords": top_keywords[:8],
        "target_language": target_language or "en",
        "offline_nlp_engine": "extractive-tfidf-v1",
        "source": "stub",
    }


def _openai_summary(transcript_text: str, *, target_language: str = "en") -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url or None)
    lang_note = (
        f" Keep technical terms in English while translating explanations cleanly into language '{target_language}'."
        if target_language and target_language != "en"
        else ""
    )
    prompt = (
        "You are generating a study aid from a class transcript. "
        "Return strict JSON with keys: overview (string), key_concepts (list of strings), "
        "definitions (list of objects with {term, definition}), examples (list of strings), "
        "revision_questions (list of strings), quiz_questions (list of up to 4 objects with "
        "{question, options (4 strings), answer_index (0-3 int), explanation}). "
        f"Only use information present in the transcript; do not invent facts.{lang_note}\n\n"
        f"Transcript:\n{transcript_text}"
    )
    response = client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    data = json.loads(response.choices[0].message.content)
    data["source"] = "llm"
    data.setdefault("target_language", target_language or "en")
    if not data.get("quiz_questions"):
        sentences = [s.strip() for s in transcript_text.replace("\n", " ").split(".") if s.strip()]
        data["quiz_questions"] = _build_offline_quiz(sentences, data.get("definitions"))
    return data


LONG_TRANSCRIPT_CHARS = 60_000  # roughly 15k tokens; beyond this, summarise in parts so nothing is truncated
PART_CHARS = 40_000


def _split_parts(text: str, size: int = PART_CHARS) -> list[str]:
    """Splits on paragraph boundaries so a part never cuts a sentence in half where avoidable."""
    parts, current = [], ""
    for para in text.split("\n\n"):
        if current and len(current) + len(para) > size:
            parts.append(current)
            current = ""
        while len(para) > size:  # a single enormous paragraph
            parts.append(para[:size])
            para = para[size:]
        current += ("\n\n" if current else "") + para
    if current:
        parts.append(current)
    return parts


def _merge(partials: list[dict]) -> dict:
    merged = {"overview": " ".join(p.get("overview", "") for p in partials).strip()}
    for key in ("key_concepts", "definitions", "examples", "revision_questions", "quiz_questions"):
        seen, items = set(), []
        for p in partials:
            for item in p.get(key, []):
                marker = json.dumps(item, sort_keys=True) if isinstance(item, (dict, list)) else item
                if marker not in seen:
                    seen.add(marker)
                    items.append(item)
        merged[key] = items
    merged["target_language"] = partials[0].get("target_language", "en")
    merged["source"] = partials[0].get("source", "stub")
    return merged


def _call_summarize(summarize, text: str, target_language: str) -> dict:
    import inspect

    if target_language != "en" and "target_language" in inspect.signature(summarize).parameters:
        return summarize(text, target_language=target_language)
    return summarize(text)


def generate_summary(transcript_text: str, *, target_language: str = "en") -> dict:
    """Summarises the COMPLETE transcript. A long one is summarised part by part and merged, never cut off."""
    summarize = _stub_summary if not settings.llm_configured else _openai_summary
    if len(transcript_text) <= LONG_TRANSCRIPT_CHARS:
        return _call_summarize(summarize, transcript_text, target_language)
    partials = [_call_summarize(summarize, part, target_language) for part in _split_parts(transcript_text)]
    result = _merge(partials)
    result["parts_summarized"] = len(partials)
    return result
