from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, LargeZipFile, ZipFile
from xml.etree import ElementTree

from django.http import FileResponse
from django.utils.text import get_valid_filename
from rest_framework.exceptions import ValidationError

MAX_CV_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
MAX_DOCX_ENTRIES = 2000
MAX_DOCX_XML_BYTES = 2 * 1024 * 1024


def validate_cv_upload(uploaded_file):
    raw_name = str(getattr(uploaded_file, "name", "") or "")
    base_name = raw_name.replace("\\", "/").rsplit("/", 1)[-1]
    extension = PurePosixPath(base_name).suffix.lower()
    if extension not in {".pdf", ".docx"}:
        raise ValidationError({"file": ["Upload a PDF or DOCX CV."]})

    if not getattr(uploaded_file, "size", 0):
        raise ValidationError({"file": ["The selected CV is empty."]})
    if uploaded_file.size > MAX_CV_UPLOAD_BYTES:
        raise ValidationError({"file": ["CV files must be 5 MiB or smaller."]})

    content = uploaded_file.read(MAX_CV_UPLOAD_BYTES + 1)
    if len(content) > MAX_CV_UPLOAD_BYTES:
        raise ValidationError({"file": ["CV files must be 5 MiB or smaller."]})
    if not content:
        raise ValidationError({"file": ["The selected CV is empty."]})

    if extension == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise ValidationError({"file": ["The file does not have a valid PDF signature."]})
        content_type = "application/pdf"
    else:
        if not content.startswith(b"PK\x03\x04"):
            raise ValidationError({"file": ["The file is not a valid DOCX archive."]})
        try:
            with ZipFile(BytesIO(content)) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
                uncompressed_size = sum(entry.file_size for entry in entries)
                if len(entries) > MAX_DOCX_ENTRIES or uncompressed_size > MAX_DOCX_UNCOMPRESSED_BYTES:
                    raise ValidationError({"file": ["The DOCX contents exceed safe processing limits."]})
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise ValidationError({"file": ["The archive is not a valid DOCX document."]})
                if any(name.lower().endswith("vbaproject.bin") for name in names):
                    raise ValidationError({"file": ["Macro-enabled documents are not accepted."]})
        except (BadZipFile, LargeZipFile, OSError):
            raise ValidationError({"file": ["The file is not a valid DOCX document."]}) from None
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    safe_base_name = get_valid_filename(base_name)
    stem = PurePosixPath(safe_base_name).stem[:160].strip(" .") or "developer-cv"
    filename = f"{stem}{extension}"
    return {"content": content, "filename": filename, "content_type": content_type, "size_bytes": len(content)}


def cv_attachment_response(document):
    response = FileResponse(
        BytesIO(bytes(document.content)),
        as_attachment=True,
        filename=document.file_name,
        content_type=document.content_type,
    )
    return _set_private_cv_headers(response)


def cv_preview_response(document):
    if document.content_type == "application/pdf":
        content = bytes(document.content)
        content_type = "application/pdf"
    elif document.content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        content = _extract_docx_text(document.content).encode("utf-8")
        content_type = "text/plain; charset=utf-8"
    else:
        raise ValidationError({"file": ["This CV file type cannot be previewed."]})

    response = FileResponse(
        BytesIO(content),
        as_attachment=False,
        filename=document.file_name,
        content_type=content_type,
    )
    return _set_private_cv_headers(response)


def _set_private_cv_headers(response):
    response["Cache-Control"] = "private, no-store, max-age=0"
    response["Pragma"] = "no-cache"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def _extract_docx_text(content):
    try:
        with ZipFile(BytesIO(bytes(content))) as archive:
            document_xml = archive.getinfo("word/document.xml")
            if document_xml.file_size > MAX_DOCX_XML_BYTES:
                raise ValidationError({"file": ["The DOCX text is too large to preview safely."]})
            xml_content = archive.read(document_xml)
    except (BadZipFile, LargeZipFile, KeyError, OSError, RuntimeError):
        raise ValidationError({"file": ["This DOCX could not be previewed safely."]}) from None

    upper_xml = xml_content.upper()
    if b"<!DOCTYPE" in upper_xml or b"<!ENTITY" in upper_xml:
        raise ValidationError({"file": ["This DOCX contains unsupported XML declarations."]})

    try:
        root = ElementTree.fromstring(xml_content)
    except ElementTree.ParseError:
        raise ValidationError({"file": ["This DOCX contains invalid document text."]}) from None

    word_namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []
    for paragraph in root.iter(f"{word_namespace}p"):
        parts = []
        for element in paragraph.iter():
            if element.tag == f"{word_namespace}t" and element.text:
                parts.append(element.text)
            elif element.tag in {f"{word_namespace}tab", f"{word_namespace}br", f"{word_namespace}cr"}:
                parts.append("\t" if element.tag == f"{word_namespace}tab" else "\n")
        text = "".join(parts).strip()
        if text:
            paragraphs.append(text)

    return "\n".join(paragraphs)
