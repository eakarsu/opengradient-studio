import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const label = value => String(value).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
const cell = value => String(value ?? 'Not supplied').replaceAll('|', '\\|').replaceAll('\n', ' ');

// Older local runs and models that return structured data still get a readable report.
export function readableResponse(content) {
  const text = String(content || '').trim();
  const candidate = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!/^[\[{]/.test(candidate)) return text;
  try {
    const value = JSON.parse(candidate);
    const sections = (object, depth = 2) => {
      if (Array.isArray(object)) {
        if (object.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
          const keys = [...new Set(object.flatMap(item => Object.keys(item)))];
          if (keys.length && keys.length <= 8) return [`| ${keys.map(label).join(' | ')} |`, `| ${keys.map(() => '---').join(' | ')} |`, ...object.map(item => `| ${keys.map(key => cell(typeof item[key] === 'object' ? 'See details' : item[key])).join(' | ')} |`)].join('\n');
        }
        return object.map(item => typeof item === 'object' && item !== null ? sections(item, depth) : `- ${cell(item)}`).join('\n');
      }
      return Object.entries(object).map(([key, item]) => item && typeof item === 'object'
        ? `${'#'.repeat(Math.min(depth, 4))} ${label(key)}\n\n${sections(item, depth + 1)}`
        : `**${label(key)}:** ${cell(item)}`).join('\n\n');
    };
    return value && typeof value === 'object' ? sections(value) : text;
  } catch { return text; }
}

export default function AIResponse({ content }) {
  return <div className="ai-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    h1: ({ children }) => <h2>{children}</h2>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ alt }) => <span className="ai-image-label">{alt || 'Image reference'}</span>,
    table: ({ children }) => <div className="ai-report-table"><table>{children}</table></div>,
  }}>{readableResponse(content)}</ReactMarkdown></div>;
}
