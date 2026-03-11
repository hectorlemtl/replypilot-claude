-- Knowledge Base articles table for AI-powered article lookup during draft generation
CREATE TABLE IF NOT EXISTS kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  content_snippet TEXT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content_snippet, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_search_vector ON kb_articles USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles (category);

-- Allow read/write for service role and anon (reference data table)
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_articles_read" ON kb_articles FOR SELECT USING (true);
CREATE POLICY "kb_articles_write" ON kb_articles FOR ALL USING (true) WITH CHECK (true);
