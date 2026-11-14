-- Batch C: Structural cleanup & atomic RAG page replacement RPC.

-- 1) Drop duplicate index flagged by Supabase Performance Advisor
--    (public.proposal_copis already has proposal_copis_staff_idx on (staff_id)).
DROP INDEX IF EXISTS public.proposal_copis_staff_id_idx;

-- 2) Atomic doc_pages replacement for the Python RAG ingestion worker.
--    Replaces sequential DELETE + INSERT calls from rag/db.py with one transaction
--    so a partial failure never leaves a document without pages.
CREATE OR REPLACE FUNCTION public.rag_replace_doc_pages(
    p_document_id uuid,
    p_pages jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.doc_pages
    WHERE document_id = p_document_id;

    IF p_pages IS NOT NULL AND jsonb_typeof(p_pages) = 'array' AND jsonb_array_length(p_pages) > 0 THEN
        INSERT INTO public.doc_pages (document_id, page, text)
        SELECT p_document_id, x.page, COALESCE(x.text, '')
        FROM jsonb_to_recordset(p_pages) AS x(page integer, text text);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rag_replace_doc_pages(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rag_replace_doc_pages(uuid, jsonb) TO service_role;
