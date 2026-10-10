import asyncio
import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from starlette.datastructures import Headers, UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import api
from app.api import _assistant_index_document, _validate_assistant_image, create_app
from app.schemas import AssistantChatRequest, AssistantSpeechRequest

_test_qdrant = QdrantClient(":memory:")
with patch("qdrant_client.QdrantClient", return_value=_test_qdrant):
    from assistant import rag_engine


class AssistantRequestSchemaTests(unittest.TestCase):
    def test_document_context_requires_an_indexed_document_identifier(self):
        with self.assertRaises(ValidationError):
            AssistantChatRequest(
                question="Summarize this manual",
                context="document",
            )

    def test_machine_context_requires_a_machine_identifier(self):
        with self.assertRaises(ValidationError):
            AssistantChatRequest(
                question="What is the current risk?",
                context="machine",
            )

    def test_operational_context_must_be_a_json_object(self):
        with self.assertRaises(ValidationError):
            AssistantChatRequest(
                question="Which machines are at risk?",
                operational_context="[]",
            )


class AssistantIndexingTests(unittest.TestCase):
    def test_utf8_text_is_indexed_with_a_stable_document_identifier(self):
        class FakeEngine:
            def __init__(self):
                self.indexed = []

            def add_document_structured(self, **kwargs):
                self.indexed.append(kwargs)
                return 2

        engine = FakeEngine()
        pages, chunks, warnings = _assistant_index_document(
            "دليل الصيانة".encode(),
            "manual.txt",
            "doc-123",
            engine,
        )
        self.assertEqual((pages, chunks, warnings), (1, 2, []))
        self.assertEqual(engine.indexed[0]["document_id"], "doc-123")
        self.assertEqual(engine.indexed[0]["filename"], "manual.txt")

    def test_invalid_image_content_type_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            _validate_assistant_image(b"not an image", "text/plain")
        self.assertEqual(raised.exception.status_code, 415)

    def test_valid_image_is_verified_and_mime_is_normalized(self):
        image = io.BytesIO()
        Image.new("RGB", (16, 12), color=(10, 20, 30)).save(image, format="PNG")
        self.assertEqual(
            _validate_assistant_image(image.getvalue(), "image/png"),
            "image/png",
        )


class AssistantApiTests(unittest.TestCase):
    def setUp(self):
        application = create_app(Path(__file__).resolve().parents[1] / "models")
        self.chat_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/assistant/chat"
        )
        self.image_chat_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/assistant/chat/image"
        )
        self.speech_chunks_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/assistant/speak/chunks"
        )
        self.transcribe_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/assistant/transcribe"
        )
        self.application = application

    def test_vercel_upload_limits_fit_under_function_payload_cap(self):
        with patch.dict(os.environ, {"VERCEL": "1"}, clear=False):
            self.assertEqual(
                api._request_upload_limit(20 * 1024 * 1024),
                4 * 1024 * 1024,
            )

        with patch.dict(os.environ, {"VERCEL": ""}, clear=False):
            self.assertEqual(
                api._request_upload_limit(20 * 1024 * 1024),
                20 * 1024 * 1024,
            )

    def test_chat_uses_project_context_and_returns_rag_sources(self):
        class FakeEngine:
            GROQ_API_KEY = "configured-for-test"

            def __init__(self):
                self.call = None

            def ask_rag(self, question, **kwargs):
                self.call = (question, kwargs)
                return {
                    "answer": "Based on the current model output.",
                    "sources": [
                        {
                            "filename": "manual.pdf",
                            "page": 3,
                            "machine": None,
                            "section": "Maintenance",
                            "subsection": None,
                            "topic": None,
                            "error_code": None,
                            "content_type": "text",
                            "score": 0.87,
                        }
                    ],
                    "intent": "document_question",
                }

        engine = FakeEngine()
        request = AssistantChatRequest(
            question="Why is M-001 at risk?",
            context="factory",
            history=[{"role": "user", "content": "Tell me about this machine."}],
            operational_context='{"scope":"factory","model_predictions":[]}',
            reasoning_mode=True,
            voice=True,
        )
        with patch("app.api._assistant_engine", return_value=engine), patch(
            "app.api._ensure_assistant_index", return_value=engine
        ):
            result = asyncio.run(self.chat_route.endpoint(request))

        self.assertEqual(result["answer"], "Based on the current model output.")
        self.assertEqual(result["sources"][0]["filename"], "manual.pdf")
        self.assertEqual(engine.call[0], request.question)
        self.assertEqual(
            engine.call[1]["operational_context"],
            request.operational_context,
        )
        self.assertTrue(engine.call[1]["reasoning_mode"])
        self.assertTrue(engine.call[1]["voice"])
        self.assertIn("Tell me about this machine.", engine.call[1]["history_context"])

    def test_live_transcription_reports_no_speech_without_returning_arabic_prompt_text(self):
        class FakeEngine:
            GROQ_API_KEY = "configured-for-test"
            NO_SPEECH_TEXT = rag_engine.NO_SPEECH_TEXT

            def transcribe_audio(self, contents, content_type):
                return self.NO_SPEECH_TEXT

        upload = UploadFile(
            filename="recording.webm",
            file=io.BytesIO(b"audio"),
            headers=Headers({"content-type": "audio/webm"}),
        )
        with patch("app.api._assistant_engine", return_value=FakeEngine()):
            result = asyncio.run(self.transcribe_route.endpoint(upload))

        self.assertEqual(result, {"text": "", "recognized": False})

    def test_missing_groq_key_returns_explicit_unavailable(self):
        class FakeEngine:
            GROQ_API_KEY = ""

        request = AssistantChatRequest(question="Explain this alarm.")
        with patch("app.api._assistant_engine", return_value=FakeEngine()):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(self.chat_route.endpoint(request))
        self.assertEqual(raised.exception.status_code, 503)

    def test_image_chat_forwards_reasoning_mode(self):
        class FakeEngine:
            GROQ_API_KEY = "configured-for-test"

            def ask_rag_with_image(self, question, image_bytes, image_type, **kwargs):
                self.reasoning_mode = kwargs["reasoning_mode"]
                return {
                    "answer": "Image result.",
                    "image_analysis": "A product image.",
                    "sources": [],
                }

        engine = FakeEngine()
        image = io.BytesIO()
        Image.new("RGB", (8, 6), color=(80, 120, 160)).save(image, format="PNG")
        upload = UploadFile(
            filename="sample.png",
            file=io.BytesIO(image.getvalue()),
            headers=Headers({"content-type": "image/png"}),
        )
        with patch("app.api._assistant_engine", return_value=engine), patch(
            "app.api._ensure_assistant_index", return_value=engine
        ):
            result = asyncio.run(
                self.image_chat_route.endpoint(
                    question="What is in the image?",
                    context="factory",
                    machine_id=None,
                    document_id=None,
                    history="[]",
                    operational_context="{}",
                    reasoning_mode=True,
                    image=upload,
                )
            )

        self.assertTrue(engine.reasoning_mode)
        self.assertEqual(result["answer"], "Image result.")

    def test_live_speech_chunks_use_cleaned_and_truncated_answer_text(self):
        request = AssistantSpeechRequest(text="A complete spoken response.")
        with patch("assistant.tts_engine.clean_for_tts", return_value="cleaned answer"), patch(
            "assistant.tts_engine.truncate_for_speech",
            return_value="shortened answer",
        ), patch(
            "assistant.tts_engine.split_for_streaming",
            return_value=["short", "answer"],
        ) as split:
            result = self.speech_chunks_route.endpoint(request)

        self.assertEqual(result, {"chunks": ["short", "answer"]})
        split.assert_called_once_with("shortened answer")


class AssistantRetrievalTests(unittest.TestCase):
    def test_answer_language_tracks_the_current_question(self):
        questions = (
            ("What is the current machine risk?", "Respond in English"),
            ("ما مستوى خطورة الآلة حاليًا؟", "أجب باللغة العربية"),
        )
        for question, expected_instruction in questions:
            understanding = {
                "intent": "document_question",
                "standalone_question": question,
                "search_queries": [],
                "clarifying_question": "",
            }
            with self.subTest(question=question), patch.object(
                rag_engine, "understand_question", return_value=understanding
            ), patch.object(rag_engine, "search_solved_cases", return_value=[]), patch.object(
                rag_engine, "retrieve_for_queries", return_value=[]
            ), patch.object(rag_engine, "_generate", return_value="A safe answer.") as generate:
                rag_engine.ask_rag(question)

            self.assertIn(expected_instruction, generate.call_args.args[0])

    def test_voice_mode_uses_short_answer_style_and_preserves_question_language(self):
        questions = (
            ("What is the current machine risk?", "Respond in English"),
            ("ما مستوى خطورة الآلة حاليًا؟", "أجب باللغة العربية"),
        )
        for question, expected_instruction in questions:
            understanding = {
                "intent": "document_question",
                "standalone_question": question,
                "search_queries": [],
                "clarifying_question": "",
            }
            with self.subTest(question=question), patch.object(
                rag_engine, "understand_question", return_value=understanding
            ), patch.object(
                rag_engine, "retrieve_for_queries", return_value=[]
            ) as retrieve, patch.object(
                rag_engine, "_generate", return_value="The risk is unavailable."
            ) as generate, patch.object(rag_engine, "add_voice_turn"):
                rag_engine.ask_rag(question, voice=True)

            prompt = generate.call_args.args[0]
            self.assertIn(expected_instruction, prompt)
            self.assertIn(rag_engine.VOICE_STYLE_SUFFIX.strip(), prompt)
            self.assertEqual(retrieve.call_args.kwargs["limit"], rag_engine.VOICE_RETRIEVAL_LIMIT)
            self.assertEqual(generate.call_args.kwargs["model"], rag_engine.VOICE_CHAT_MODEL)

    def test_reasoning_mode_adds_evidence_review_without_exposing_chain_of_thought(self):
        understanding = {
            "intent": "document_question",
            "standalone_question": "Why is M-001 at risk?",
            "search_queries": [],
            "clarifying_question": "",
        }
        with patch.object(rag_engine, "understand_question", return_value=understanding), patch.object(
            rag_engine, "search_solved_cases", return_value=[]
        ), patch.object(rag_engine, "retrieve_for_queries", return_value=[]), patch.object(
            rag_engine, "_generate", return_value="The prediction is unavailable."
        ) as generate:
            rag_engine.ask_rag(
                "Why is M-001 at risk?",
                reasoning_mode=True,
            )

        prompt = generate.call_args.args[0]
        self.assertIn("REASONING MODE", prompt)
        self.assertIn("Do not reveal private chain-of-thought", prompt)

    def test_greeting_language_tracks_the_current_question(self):
        self.assertIn("Hello", rag_engine._greeting_answer("Hello"))
        self.assertIn("أهلاً", rag_engine._greeting_answer("السلام عليكم"))

    def test_image_analysis_language_tracks_the_current_question(self):
        questions = (
            ("What is wrong with this motor?", "Respond in English"),
            ("ما العطل الظاهر في المحرك؟", "أجب باللغة العربية"),
        )
        for question, expected_instruction in questions:
            with self.subTest(question=question), patch.object(
                rag_engine, "_chat", return_value="Image findings."
            ) as chat:
                rag_engine.analyze_image_with_context(b"image", "image/png", question)

            self.assertIn(expected_instruction, chat.call_args.args[0])

    def test_transcription_uses_automatic_language_detection_by_default(self):
        class FakeTranscriptions:
            def create(self, **kwargs):
                self.kwargs = kwargs
                return type("Transcription", (), {"text": "How is the machine?"})()

        transcriptions = FakeTranscriptions()
        client = type("Client", (), {"audio": type("Audio", (), {"transcriptions": transcriptions})()})()
        with patch.object(rag_engine, "STT_LANGUAGE", ""), patch.object(
            rag_engine, "_get_groq_client", return_value=client
        ):
            text = rag_engine.transcribe_audio(b"audio", "audio/webm")

        self.assertEqual(text, "How is the machine?")
        self.assertNotIn("language", transcriptions.kwargs)

    def test_remote_qdrant_uses_tls_endpoint_and_api_key(self):
        with patch.dict(
            os.environ,
            {
                "QDRANT_URL": "https://example.qdrant.io",
                "QDRANT_API_KEY": "test-api-key",
            },
            clear=True,
        ), patch.object(rag_engine, "QdrantClient") as client_class:
            rag_engine.create_qdrant_client()

        client_class.assert_called_once_with(
            url="https://example.qdrant.io",
            api_key="test-api-key",
        )

    def test_remote_qdrant_rejects_insecure_endpoint(self):
        with patch.dict(
            os.environ,
            {"QDRANT_URL": "http://example.qdrant.io", "QDRANT_API_KEY": "test-api-key"},
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "HTTPS"):
                rag_engine.create_qdrant_client()

    def test_vercel_requires_remote_qdrant_instead_of_ephemeral_local_storage(self):
        with patch.dict(os.environ, {"VERCEL": "1"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "persistent assistant storage"):
                rag_engine.create_qdrant_client()

    def test_local_development_retains_persistent_file_storage(self):
        local_path = Path.cwd() / "test-qdrant-path"
        with patch.dict(os.environ, {}, clear=True), patch.object(
            rag_engine, "QDRANT_PATH", local_path
        ), patch.object(rag_engine, "QdrantClient") as client_class:
            rag_engine.create_qdrant_client()

        client_class.assert_called_once_with(path=str(local_path.resolve()))

    def test_document_filter_is_applied_to_semantic_search(self):
        with patch.object(rag_engine, "create_embedding", return_value=[0.1, 0.2]), patch.object(
            rag_engine, "qdrant"
        ) as qdrant:
            qdrant.query_points.return_value.points = []
            rag_engine.semantic_search("bearing vibration", document_id="doc-123")

        query_filter = qdrant.query_points.call_args.kwargs["query_filter"]
        conditions = query_filter.must
        self.assertEqual(conditions[0].key, "document_id")
        self.assertEqual(conditions[0].match.value, "doc-123")

    def test_embedding_failure_is_not_converted_to_an_empty_answer(self):
        with patch.object(
            rag_engine,
            "create_embeddings_batch",
            side_effect=RuntimeError("local embedding model failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "embedding model failed"):
                rag_engine.retrieve_for_queries(
                    ["bearing vibration"],
                    "bearing vibration",
                )

    def test_platform_context_and_history_are_included_in_answer_prompt(self):
        understanding = {
            "intent": "document_question",
            "standalone_question": "Why is M-001 at risk?",
            "search_queries": [],
            "clarifying_question": "",
        }
        with patch.object(rag_engine, "understand_question", return_value=understanding), patch.object(
            rag_engine, "search_solved_cases", return_value=[]
        ), patch.object(rag_engine, "retrieve_for_queries", return_value=[]), patch.object(
            rag_engine, "_generate", return_value="The prediction is unavailable."
        ) as generate:
            rag_engine.ask_rag(
                "Why is M-001 at risk?",
                history_context="المستخدم: اسأل عن الماكينة",
                operational_context='{"model_predictions":[]}',
            )

        prompt = generate.call_args.args[1]
        self.assertIn("المستخدم: اسأل عن الماكينة", prompt)
        self.assertIn('{"model_predictions":[]}', prompt)
        self.assertIn("لا تستنتج قراءة حسّاس", prompt)

    def test_indexed_document_listing_and_deletion_are_scoped_by_document_id(self):
        local_qdrant = QdrantClient(":memory:")
        local_qdrant.create_collection(
            collection_name=rag_engine.COLLECTION_NAME,
            vectors_config=VectorParams(size=2, distance=Distance.COSINE),
        )
        local_qdrant.upsert(
            collection_name=rag_engine.COLLECTION_NAME,
            points=[
                PointStruct(
                    id="7c3a2d92-87a8-4aad-a0f4-b7ea35aaefc2",
                    vector=[1.0, 0.0],
                    payload={
                        "document_id": "doc-123",
                        "filename": "manual.pdf",
                        "page": 1,
                        "uploaded_at": 100,
                    },
                ),
                PointStruct(
                    id="cc68025e-2c98-4673-9c4f-ed2203f00bc6",
                    vector=[0.0, 1.0],
                    payload={
                        "document_id": "doc-456",
                        "filename": "other.pdf",
                        "page": 1,
                        "uploaded_at": 200,
                    },
                ),
            ],
        )
        try:
            with patch.object(rag_engine, "qdrant", local_qdrant):
                documents = rag_engine.list_indexed_documents()
                rag_engine.delete_document_points("doc-123")
                remaining = rag_engine.list_indexed_documents()
        finally:
            local_qdrant.close()

        self.assertEqual(
            [(item["document_id"], item["filename"]) for item in documents],
            [("doc-456", "other.pdf"), ("doc-123", "manual.pdf")],
        )
        self.assertEqual([item["document_id"] for item in remaining], ["doc-456"])


if __name__ == "__main__":
    unittest.main()
