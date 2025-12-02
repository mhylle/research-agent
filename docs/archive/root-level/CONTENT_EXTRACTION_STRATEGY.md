# Content Extraction Strategy

## Problem Statement

Web pages often exceed the 1MB axios maxContentLength limit, causing fetch failures. Additionally, modern websites use complex JavaScript rendering, making traditional HTML parsing insufficient.

**Critical Requirement**: Retrieve ALL data without loss, then intelligently compress for LLM processing.

---

## Solution Architecture: Multi-Method Extraction with Complete Persistence

### Three-Layer Approach

```
┌─────────────────────────────────────────┐
│  Layer 1: Complete Data Retrieval      │
│  - Download full HTML (no size limit)  │
│  - Capture screenshots (visual backup) │
│  - Persist everything to disk          │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  Layer 2: Multi-Method Extraction      │
│  - Method A: Readability (text)        │
│  - Method B: Vision LLM (screenshot)   │
│  - Method C: Cheerio (fallback)        │
│  - Best result selection               │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  Layer 3: LLM Preparation              │
│  - Compress to 5000 chars              │
│  - Keep reference to original          │
│  - Log extraction metadata             │
└─────────────────────────────────────────┘
```

---

## Implementation Details

### Layer 1: Complete Data Retrieval

#### 1.1 HTML Download (No Data Loss)

**Configuration Changes:**
```typescript
// web-fetch.provider.ts
const response = await axios.get(url, {
  timeout: 30000,  // Increased to 30s for large pages
  maxContentLength: 100 * 1024 * 1024,  // 100MB limit
  maxBodyLength: 100 * 1024 * 1024,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});
```

**Storage:**
```typescript
const urlHash = crypto.createHash('md5').update(url).digest('hex');
const logDir = path.join('data', 'fetched-content', logId);
const htmlPath = path.join(logDir, `${urlHash}.html`);

await fs.mkdir(logDir, { recursive: true });
await fs.writeFile(htmlPath, response.data);
```

#### 1.2 Screenshot Capture (Visual Backup)

**Using Playwright:**
```typescript
import { chromium } from 'playwright';

async captureScreenshot(url: string, logId: string, urlHash: string): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle' });

  const screenshotPath = path.join('data', 'fetched-content', logId, `${urlHash}.png`);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    type: 'png'
  });

  await browser.close();
  return screenshotPath;
}
```

**Storage Structure:**
```
data/fetched-content/{logId}/
├── {urlHash}.html          # Complete HTML
├── {urlHash}.png           # Full page screenshot
├── {urlHash}.json          # Extraction metadata
└── {urlHash}-vision.json   # Vision LLM extraction result
```

---

### Layer 2: Multi-Method Extraction

#### Method A: Mozilla Readability (Text Extraction)

**Installation:**
```bash
npm install @mozilla/readability jsdom
```

**Implementation:**
```typescript
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

extractWithReadability(html: string, url: string): ExtractionResult {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    return { success: false, method: 'readability' };
  }

  return {
    success: true,
    method: 'readability',
    title: article.title,
    content: article.textContent.substring(0, 5000),
    excerpt: article.excerpt,
    byline: article.byline,
    length: article.length,
    readingTime: Math.ceil(article.length / 1000), // ~200 words/min
    fullContent: article.textContent  // Store complete for evaluation
  };
}
```

**Advantages:**
- Removes ads, navigation, comments
- Identifies main article content
- Works well for news sites, blogs, articles
- Lightweight and fast

#### Method B: Vision LLM (Screenshot Analysis)

**Using Ollama with LLaVA or Similar:**
```typescript
async extractWithVision(
  screenshotPath: string,
  url: string
): Promise<ExtractionResult> {
  // Read screenshot as base64
  const imageBuffer = await fs.readFile(screenshotPath);
  const base64Image = imageBuffer.toString('base64');

  // Call vision-enabled LLM
  const response = await this.visionLLM.analyze({
    image: base64Image,
    prompt: `Extract the main article content from this screenshot of ${url}.

    Focus on:
    1. Main article text (ignore ads, navigation, sidebars)
    2. Important headings and subheadings
    3. Key facts, dates, numbers, quotes
    4. Captions for images/charts

    Return structured content with title and main text.`
  });

  return {
    success: true,
    method: 'vision',
    title: response.title,
    content: response.content.substring(0, 5000),
    fullContent: response.content,
    visualElements: response.visualElements  // Charts, images described
  };
}
```

**Advantages:**
- Can "see" content that's rendered via JavaScript
- Extracts text from images, charts, infographics
- Handles complex layouts and dynamic content
- Can identify and describe visual data (graphs, diagrams)
- Fallback when HTML parsing fails

**Use Cases:**
- Pages with JavaScript-rendered content
- Infographics and data visualizations
- PDF-like formatted content
- Social media embeds
- Complex interactive articles

#### Method C: Cheerio (Fallback)

**Current implementation** - keep as fallback when both A and B fail:
```typescript
extractWithCheerio(html: string, url: string): ExtractionResult {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, iframe').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim();
  const content = $('body').text()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000);

  return {
    success: true,
    method: 'cheerio',
    title,
    content,
    fullContent: $('body').text().replace(/\s+/g, ' ').trim()
  };
}
```

---

### Layer 3: Intelligent Method Selection

**Extraction Pipeline:**
```typescript
async execute(args: Record<string, any>): Promise<WebFetchResult> {
  const { url } = args;
  const urlHash = this.hashUrl(url);

  try {
    // 1. Download complete HTML
    const html = await this.downloadCompleteHTML(url);
    await this.persistHTML(html, logId, urlHash);

    // 2. Capture screenshot (parallel with extraction)
    const screenshotPromise = this.captureScreenshot(url, logId, urlHash);

    // 3. Try extraction methods in priority order
    let result: ExtractionResult;

    // Try Readability first (fast, good for articles)
    result = await this.extractWithReadability(html, url);

    // If Readability fails or low confidence, try vision
    if (!result.success || result.confidence < 0.7) {
      const screenshotPath = await screenshotPromise;
      result = await this.extractWithVision(screenshotPath, url);
    }

    // Fallback to Cheerio
    if (!result.success) {
      result = await this.extractWithCheerio(html, url);
    }

    // 4. Save extraction metadata
    await this.saveMetadata(logId, urlHash, {
      url,
      method: result.method,
      originalSize: html.length,
      extractedSize: result.content.length,
      title: result.title,
      content: result.content,  // For LLM (5000 chars)
      fullContentPath: `data/fetched-content/${logId}/${urlHash}.html`,
      screenshotPath: `data/fetched-content/${logId}/${urlHash}.png`,
      extractionMetadata: result.metadata
    });

    return {
      url,
      title: result.title,
      content: result.content  // 5000 char excerpt for LLM
    };

  } catch (error) {
    return this.handleError(error, url);
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Content Fetching
WEB_FETCH_TIMEOUT=30000           # 30 seconds for large pages
WEB_FETCH_MAX_SIZE=104857600      # 100MB (effectively unlimited)
WEB_FETCH_STORAGE_DIR=./data/fetched-content

# Screenshot Settings
ENABLE_SCREENSHOTS=true           # Enable visual extraction
SCREENSHOT_TIMEOUT=15000          # 15 seconds
SCREENSHOT_VIEWPORT_WIDTH=1920    # Desktop viewport
SCREENSHOT_VIEWPORT_HEIGHT=1080

# Vision LLM (optional - for screenshot analysis)
VISION_LLM_MODEL=llava            # or bakllava, llava-phi, etc.
VISION_LLM_ENABLED=true
```

### Dependencies

**Required:**
```json
{
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "jsdom": "^24.0.0"
  }
}
```

**Optional (for screenshots):**
```json
{
  "dependencies": {
    "playwright": "^1.40.0"
  }
}
```

---

## Data Models

### StoredContent Interface

```typescript
interface StoredContent {
  url: string;
  fetchedAt: string;
  logId: string;

  // Original data
  htmlPath: string;              // Path to complete HTML
  htmlSize: number;              // Original HTML size in bytes
  screenshotPath?: string;       // Path to screenshot

  // Extracted data
  extractionMethod: 'readability' | 'vision' | 'cheerio';
  title: string;
  content: string;               // 5000 char excerpt for LLM
  fullContentPath: string;       // Path to complete extracted text

  // Metadata
  extractionConfidence: number;  // 0-1
  compressionRatio: number;      // extracted/original
  hasVisualContent: boolean;     // Charts, images, etc.
  extractionTime: number;        // ms
}
```

### ExtractionResult Interface

```typescript
interface ExtractionResult {
  success: boolean;
  method: 'readability' | 'vision' | 'cheerio';
  confidence?: number;           // 0-1 (vision LLM confidence)

  title: string;
  content: string;               // Truncated for LLM
  fullContent: string;           // Complete extraction
  excerpt?: string;              // Summary (readability)
  byline?: string;               // Author (readability)

  // Vision-specific
  visualElements?: {
    type: 'chart' | 'image' | 'diagram';
    description: string;
    data?: any;
  }[];

  // Metadata
  readingTime?: number;          // Estimated minutes
  length?: number;               // Word count
  language?: string;
}
```

---

## Extraction Quality Scoring

**Method Confidence Scoring:**

**Readability**:
- Score 0.9-1.0: Clear article with title, byline, content
- Score 0.6-0.8: Found content but missing metadata
- Score < 0.6: Failed to identify article structure

**Vision LLM**:
- Score based on LLM's own confidence
- Presence of structured output increases confidence
- Visual content identification adds value
- Hallucination detection reduces confidence

**Cheerio (Fallback)**:
- Always succeeds (score 0.5)
- Lowest quality (gets everything including boilerplate)
- Reliable but noisy

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- ✅ Remove maxContentLength limit
- ✅ Implement file-based persistence
- ✅ Store complete HTML
- ✅ Update error handling
- ✅ Log storage metadata

### Phase 2: Readability Integration (Week 1-2)
- ✅ Install @mozilla/readability
- ✅ Implement intelligent extraction
- ✅ Compare with cheerio results
- ✅ Quality scoring system
- ✅ Fallback chain (Readability → Cheerio)

### Phase 3: Vision LLM Integration (Week 2-3)
- ✅ Install Playwright for screenshots
- ✅ Implement screenshot capture (full page)
- ✅ Integrate vision-enabled LLM (LLaVA via Ollama)
- ✅ Screenshot-to-text extraction
- ✅ Visual element identification (charts, graphs, images)
- ✅ Fallback chain (Readability → Vision → Cheerio)

### Phase 4: Optimization (Week 3-4)
- ✅ Parallel extraction (screenshot while parsing HTML)
- ✅ Caching (avoid re-fetching same URL)
- ✅ Cleanup policies (delete old content)
- ✅ Compression (gzip stored HTML)
- ✅ Quality metrics and monitoring

---

## Extraction Method Selection Logic

```typescript
async extractContent(url: string, html: string, logId: string): Promise<ExtractionResult> {
  const methods: ExtractionResult[] = [];

  // Method 1: Try Readability (fast, good for articles)
  try {
    const readabilityResult = await this.extractWithReadability(html, url);
    methods.push(readabilityResult);

    // If high confidence, use it immediately
    if (readabilityResult.confidence > 0.85) {
      return readabilityResult;
    }
  } catch (error) {
    console.warn('Readability extraction failed:', error);
  }

  // Method 2: Try Vision LLM (for complex layouts, visual content)
  if (this.config.visionEnabled) {
    try {
      const screenshotPath = await this.getOrCaptureScreenshot(url, logId);
      const visionResult = await this.extractWithVision(screenshotPath, url);
      methods.push(visionResult);

      // Vision is authoritative for visual-heavy pages
      if (visionResult.visualElements?.length > 0) {
        return visionResult;
      }
    } catch (error) {
      console.warn('Vision extraction failed:', error);
    }
  }

  // Method 3: Cheerio fallback (always works)
  const cheerioResult = await this.extractWithCheerio(html, url);
  methods.push(cheerioResult);

  // Select best result by confidence score
  return methods.sort((a, b) => b.confidence - a.confidence)[0];
}
```

---

## Vision LLM Configuration

### Supported Models (Ollama)

**LLaVA** (Recommended):
```bash
ollama pull llava
```
- Good general-purpose vision model
- Fast inference
- Handles text extraction well

**BakLLaVA**:
```bash
ollama pull bakllava
```
- Mistral-based (better instruction following)
- Slower but higher quality
- Better for complex layouts

**LLaVA-Phi**:
```bash
ollama pull llava-phi
```
- Smallest, fastest
- Lower quality but very fast
- Good for quick extraction

### Vision Extraction Prompt

```typescript
const visionPrompt = `You are analyzing a screenshot of a web page: ${url}

Extract the main content following these rules:

1. TITLE: Identify the main article/page title
2. MAIN CONTENT: Extract the primary text content
   - Focus on article body, not navigation/ads/footer
   - Preserve paragraph structure
   - Include important headings
3. VISUAL ELEMENTS: Describe any charts, graphs, or infographics
   - What data is being shown
   - Key insights from visualizations
4. KEY FACTS: Extract dates, numbers, quotes, statistics

Return JSON:
{
  "title": "Article Title",
  "content": "Main article text...",
  "visualElements": [
    {"type": "chart", "description": "Bar chart showing...", "data": "..."}
  ],
  "keyFacts": ["fact 1", "fact 2"],
  "confidence": 0.95
}

Be factual and precise. If you can't read something clearly, note it.`;
```

---

## Storage and Retrieval

### Directory Structure

```
data/
└── fetched-content/
    ├── {logId-1}/
    │   ├── {hash-1}.html       # Complete HTML
    │   ├── {hash-1}.png        # Screenshot
    │   ├── {hash-1}.json       # Metadata
    │   ├── {hash-2}.html
    │   ├── {hash-2}.png
    │   └── {hash-2}.json
    └── {logId-2}/
        └── ...
```

### Metadata JSON Format

```json
{
  "url": "https://www.politico.com/news/denmark",
  "fetchedAt": "2025-11-22T12:00:00Z",
  "logId": "uuid-v4",
  "urlHash": "md5-hash",

  "originalData": {
    "htmlPath": "data/fetched-content/{logId}/{hash}.html",
    "htmlSize": 5242880,
    "screenshotPath": "data/fetched-content/{logId}/{hash}.png",
    "screenshotSize": 524288
  },

  "extraction": {
    "method": "readability",
    "confidence": 0.92,
    "title": "Denmark News Today",
    "excerpt": "Summary of article...",
    "content": "First 5000 characters...",
    "fullContentSize": 15420,
    "compressionRatio": 0.0029,
    "extractionTime": 234,
    "language": "en",
    "readingTime": 8
  },

  "visionAnalysis": {
    "used": true,
    "confidence": 0.88,
    "visualElements": [
      {
        "type": "chart",
        "description": "Bar chart showing election results",
        "extractedData": "..."
      }
    ]
  },

  "forLLM": {
    "content": "Compressed 5000 char content with visual descriptions",
    "tokenEstimate": 1250
  }
}
```

---

## Benefits for Evaluation Phase

### Complete Source Material
- ✅ Full HTML available for accuracy verification
- ✅ Screenshots for visual fact-checking
- ✅ Multiple extraction results to compare quality
- ✅ Can re-extract with different parameters

### Quality Assessment
- ✅ Compare extracted content vs full original
- ✅ Calculate coverage percentage
- ✅ Verify no important facts were lost
- ✅ Assess extraction method effectiveness

### Visual Content Analysis
- ✅ Identify data in charts/graphs that text extraction missed
- ✅ Verify visual claims in answer
- ✅ Extract numerical data from infographics
- ✅ Assess completeness including visual information

---

## Performance Considerations

### Storage
- **Per Query**: ~25MB (5 URLs × 5MB avg)
- **100 Queries**: ~2.5GB
- **Cleanup Policy**: Delete after 30 days or after evaluation complete

### Processing Time
- **Readability**: +50-100ms per page
- **Screenshot**: +2-5s per page (Playwright launch/render)
- **Vision LLM**: +5-15s per screenshot (model inference)

### Optimization Strategies
1. **Parallel Processing**: Capture screenshot while parsing HTML
2. **Lazy Screenshots**: Only capture if Readability fails
3. **Caching**: Store extraction results, avoid re-processing
4. **Selective Vision**: Only use vision for pages with identified visual content
5. **Background Jobs**: Move screenshot capture to async queue

---

## Error Handling

### Large File Handling
```typescript
if (size > 100MB) {
  return {
    url,
    title: 'Content too large',
    content: `Page size (${formatBytes(size)}) exceeds maximum. Falling back to search results summary.`
  };
}
```

### Screenshot Failures
```typescript
catch (error) {
  console.warn('Screenshot capture failed:', error);
  // Continue with HTML-only extraction
  // Vision method marked as unavailable
}
```

### Vision LLM Unavailable
```typescript
if (!this.visionLLMAvailable) {
  // Skip vision method
  // Fall back to Readability → Cheerio chain
}
```

---

## Monitoring and Metrics

### Extraction Quality Metrics
```typescript
interface ExtractionMetrics {
  method: string;
  confidence: number;
  originalSize: number;
  extractedSize: number;
  compressionRatio: number;
  extractionTime: number;
  hasVisualContent: boolean;
  visualElementsFound: number;
}
```

### Logging
```typescript
this.logger.info('Content extracted', {
  url,
  method: result.method,
  confidence: result.confidence,
  originalSize: html.length,
  extractedSize: result.content.length,
  compressionRatio: result.content.length / html.length,
  hasScreenshot: !!screenshotPath,
  visualElements: result.visualElements?.length || 0
});
```

---

## Testing Strategy

### Unit Tests
- Test each extraction method independently
- Mock Playwright for screenshot tests
- Test method selection logic
- Verify file persistence

### Integration Tests
- Test complete flow with real URLs
- Verify all three methods work
- Test large file handling (> 10MB pages)
- Verify stored files are readable

### Performance Tests
- Benchmark extraction methods
- Measure storage growth rate
- Test parallel vs sequential processing
- Measure vision LLM overhead

---

## Future Enhancements

1. **Smart Summarization**: Use LLM to compress 50KB → 5KB while preserving key facts
2. **Incremental Loading**: Stream content to LLM as it's extracted
3. **Deduplication**: Detect duplicate content across URLs
4. **Format Support**: PDF, Word docs, presentations
5. **Multi-page Articles**: Handle paginated content
6. **Comparison Mode**: A/B test extraction methods
7. **Quality Feedback Loop**: Learn which methods work best for which sites

---

## Migration Path

### Immediate (No Breaking Changes)
1. Increase maxContentLength to 10MB
2. Add file persistence
3. Keep current cheerio extraction

### Week 1
1. Add Readability extraction
2. Implement method selection
3. Store complete HTML

### Week 2
1. Add Playwright screenshot capture
2. Integrate vision LLM
3. Visual element extraction

### Week 3
1. Optimize parallel processing
2. Add caching layer
3. Implement cleanup policies

This ensures ALL data is preserved while progressively improving extraction quality.
