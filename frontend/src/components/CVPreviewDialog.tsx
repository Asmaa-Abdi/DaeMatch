import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, FileText, X } from 'lucide-react';

import type { ProtectedPreview } from '../api/client';

interface CVPreviewDialogProps {
  file: ProtectedPreview;
  onClose: () => void;
}

export function CVPreviewDialog({ file, onClose }: CVPreviewDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const latestOnClose = useRef(onClose);
  const titleId = useId();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState('');
  const isPDF = file.contentType === 'application/pdf';

  useEffect(() => {
    latestOnClose.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const closeButton = dialog?.querySelector<HTMLButtonElement>('.cv-preview-close');
    const focusableSelector = 'a[href],button:not(:disabled),iframe,[tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        latestOnClose.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      event.stopImmediatePropagation();
      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusableElements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    (closeButton ?? dialog)?.focus();
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
      previousActiveElement?.focus();
    };
  }, []);

  useEffect(() => {
    setPdfUrl(null);
    setDocumentText('');
    setTextError('');
    if (file.contentType === 'application/pdf') {
      const url = URL.createObjectURL(file.blob);
      setPdfUrl(url);
      setTextLoading(false);
      return () => URL.revokeObjectURL(url);
    }

    let cancelled = false;
    setTextLoading(true);
    file.blob.text()
      .then((text) => { if (!cancelled) setDocumentText(text); })
      .catch(() => { if (!cancelled) setTextError('The DOCX text could not be read in this browser.'); })
      .finally(() => { if (!cancelled) setTextLoading(false); });
    return () => { cancelled = true; };
  }, [file]);

  return (
    <div className="cv-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="cv-preview-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="cv-preview-header">
          <div className="cv-preview-heading">
            <span className="cv-preview-icon"><FileText size={16} aria-hidden="true" /></span>
            <div><h2 id={titleId}>{file.filename}</h2><p>{isPDF ? 'PDF preview' : 'DOCX text preview'}</p></div>
          </div>
          <div className="cv-preview-header-actions">
            {isPDF && pdfUrl && <a className="cv-preview-open-new" href={pdfUrl} target="_blank" rel="noreferrer">Open in new tab <ExternalLink size={13} /></a>}
            <button className="icon-button cv-preview-close" type="button" aria-label="Close CV preview" onClick={onClose}><X size={17} /></button>
          </div>
        </header>
        <div className={`cv-preview-content${isPDF ? ' cv-preview-content--pdf' : ''}`}>
          {isPDF ? pdfUrl ? <iframe className="cv-preview-pdf" src={pdfUrl} title={`PDF preview of ${file.filename}`} /> : <p className="cv-preview-status">Preparing PDF preview…</p>
            : textLoading ? <p className="cv-preview-status" role="status">Preparing text preview…</p>
              : textError ? <p className="cv-preview-status form-error" role="alert">{textError}</p>
                : documentText ? <pre className="cv-preview-docx">{documentText}</pre>
                  : <p className="cv-preview-status">No readable document text was found.</p>}
        </div>
        {!isPDF && <p className="cv-preview-note">This is read-only extracted text. Original formatting, headers, tables and images may differ or be omitted.</p>}
      </section>
    </div>
  );
}
