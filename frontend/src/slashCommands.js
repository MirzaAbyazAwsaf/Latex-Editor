// Each item: label shown in menu, detail hint, insert text with ${} cursor spot,
// or an aiAction ('ai' | 'fix' | 'rewrite') to focus the AI terminal.
// type -> completion icon/group, keywords -> extra search terms, boost -> ranking.

export const SLASH_COMMANDS = [
  // ---- structure ----
  { label: '/section', detail: 'Section heading', insert: '\\section{${}}', type: 'keyword', keywords: ['heading', 'chapter'], boost: 20 },
  { label: '/subsection', detail: 'Subsection heading', insert: '\\subsection{${}}', type: 'keyword', keywords: ['heading'], boost: 18 },
  { label: '/subsubsection', detail: 'Subsubsection heading', insert: '\\subsubsection{${}}', type: 'keyword', keywords: ['heading'] },
  { label: '/paragraph', detail: 'Paragraph heading', insert: '\\paragraph{${}}', type: 'keyword', keywords: ['heading'] },
  { label: '/chapter', detail: 'Chapter heading', insert: '\\chapter{${}}', type: 'keyword', keywords: ['heading'] },
  { label: '/abstract', detail: 'Abstract block', insert: '\\begin{abstract}\n${}\n\\end{abstract}', type: 'keyword', keywords: ['summary'] },
  { label: '/maketitle', detail: 'Render the title block', insert: '\\maketitle', type: 'keyword', keywords: ['title'] },
  { label: '/title', detail: 'Document title', insert: '\\title{${}}', type: 'keyword' },
  { label: '/author', detail: 'Document author', insert: '\\author{${}}', type: 'keyword' },
  { label: '/date', detail: 'Document date', insert: '\\date{${}}', type: 'keyword' },

  // ---- text formatting ----
  { label: '/bold', detail: 'Bold text', insert: '\\textbf{${}}', type: 'text', keywords: ['textbf', 'b'], boost: 14 },
  { label: '/italic', detail: 'Italic text', insert: '\\textit{${}}', type: 'text', keywords: ['textit', 'i'], boost: 14 },
  { label: '/emph', detail: 'Emphasized text', insert: '\\emph{${}}', type: 'text', keywords: ['emphasis'] },
  { label: '/underline', detail: 'Underlined text', insert: '\\underline{${}}', type: 'text', keywords: ['ul'] },
  { label: '/texttt', detail: 'Monospace text', insert: '\\texttt{${}}', type: 'text', keywords: ['code', 'monospace'] },
  { label: '/textsc', detail: 'Small caps text', insert: '\\textsc{${}}', type: 'text', keywords: ['smallcaps'] },
  { label: '/footnote', detail: 'Footnote', insert: '\\footnote{${}}', type: 'property', keywords: ['note'] },
  { label: '/url', detail: 'Hyperlink (raw URL)', insert: '\\url{${}}', type: 'property', keywords: ['link'] },
  { label: '/href', detail: 'Hyperlink with text', insert: '\\href{${}}{}', type: 'property', keywords: ['link'] },

  // ---- lists ----
  { label: '/itemize', detail: 'Bulleted list', insert: '\\begin{itemize}\n\\item ${}\n\\end{itemize}', type: 'enum', keywords: ['bullet', 'list', 'ul'], boost: 12 },
  { label: '/enumerate', detail: 'Numbered list', insert: '\\begin{enumerate}\n\\item ${}\n\\end{enumerate}', type: 'enum', keywords: ['numbered', 'list', 'ol'], boost: 10 },
  { label: '/description', detail: 'Description list', insert: '\\begin{description}\n\\item[${}] \n\\end{description}', type: 'enum', keywords: ['list', 'dl'] },
  { label: '/item', detail: 'List item', insert: '\\item ${}', type: 'enum', keywords: ['bullet'] },

  // ---- math ----
  { label: '/math', detail: 'Inline math', insert: '\\(${}\\)', type: 'function', keywords: ['inline', 'equation', 'formula'], boost: 16 },
  { label: '/display', detail: 'Display math (unnumbered)', insert: '\\[${}\\]', type: 'function', keywords: ['equation', 'formula'] },
  { label: '/equation', detail: 'Numbered equation', insert: '\\begin{equation}\n${}\n\\end{equation}', type: 'function', keywords: ['math', 'formula'], boost: 12 },
  { label: '/align', detail: 'Aligned equations', insert: '\\begin{align}\n${}\n\\end{align}', type: 'function', keywords: ['math', 'equations'] },
  { label: '/frac', detail: 'Fraction', insert: '\\frac{${}}{}', type: 'function', keywords: ['math', 'division'] },
  { label: '/sqrt', detail: 'Square root', insert: '\\sqrt{${}}', type: 'function', keywords: ['math', 'root'] },
  { label: '/sum', detail: 'Summation', insert: '\\sum_{${}}^{}', type: 'function', keywords: ['math', 'sigma'] },
  { label: '/integral', detail: 'Integral', insert: '\\int_{${}}^{}', type: 'function', keywords: ['math', 'int'] },
  { label: '/matrix', detail: 'Matrix', insert: '\\begin{matrix}\n${}\n\\end{matrix}', type: 'function', keywords: ['math', 'array'] },
  { label: '/cases', detail: 'Piecewise cases', insert: '\\begin{cases}\n${}\n\\end{cases}', type: 'function', keywords: ['math', 'piecewise'] },

  // ---- floats, references ----
  { label: '/figure', detail: 'Figure float', insert: '\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.8\\linewidth]{${}}\n\\caption{}\n\\label{}\n\\end{figure}', type: 'type', keywords: ['image', 'graphic', 'picture'], boost: 8 },
  { label: '/table', detail: 'Table float', insert: '\\begin{table}[htbp]\n\\centering\n\\begin{tabular}{${ll}}\n & \\\\\n\\end{tabular}\n\\caption{}\n\\label{}\n\\end{table}', type: 'type', keywords: ['tabular'], boost: 8 },
  { label: '/image', detail: 'Pick an uploaded image to insert', pickImage: true, type: 'type', keywords: ['includegraphics', 'graphic', 'picture', 'photo'], boost: 15 },
  { label: '/includegraphics', detail: 'Insert an image', insert: '\\includegraphics[width=${}\\linewidth]{}', type: 'type', keywords: ['image', 'graphic'] },
  { label: '/caption', detail: 'Caption', insert: '\\caption{${}}', type: 'text', keywords: ['figure', 'table'] },
  { label: '/label', detail: 'Label for cross-reference', insert: '\\label{${}}', type: 'property', keywords: ['crossref'], boost: 6 },
  { label: '/ref', detail: 'Reference a label', insert: '\\ref{${}}', type: 'property', keywords: ['crossref'], boost: 6 },
  { label: '/cite', detail: 'Citation', insert: '\\cite{${}}', type: 'property', keywords: ['bibliography', 'reference'], boost: 8 },
  { label: '/bibliography', detail: 'Bibliography file', insert: '\\bibliography{${}}', type: 'property', keywords: ['bib', 'references'] },

  // ---- verbatim / code ----
  { label: '/verbatim', detail: 'Verbatim block', insert: '\\begin{verbatim}\n${}\n\\end{verbatim}', type: 'text', keywords: ['code', 'raw'] },
  { label: '/lstlisting', detail: 'Code listing', insert: '\\begin{lstlisting}\n${}\n\\end{lstlisting}', type: 'text', keywords: ['code', 'source'] },

  // ---- layout ----
  { label: '/center', detail: 'Centered block', insert: '\\begin{center}\n${}\n\\end{center}', type: 'namespace', keywords: ['align'] },
  { label: '/quote', detail: 'Quotation block', insert: '\\begin{quote}\n${}\n\\end{quote}', type: 'namespace', keywords: ['quotation'] },
  { label: '/newpage', detail: 'Page break', insert: '\\newpage', type: 'namespace', keywords: ['break'] },
  { label: '/vspace', detail: 'Vertical space', insert: '\\vspace{${}}', type: 'namespace', keywords: ['spacing'] },
  { label: '/hspace', detail: 'Horizontal space', insert: '\\hspace{${}}', type: 'namespace', keywords: ['spacing'] },

  // ---- document setup ----
  { label: '/usepackage', detail: 'Load a package', insert: '\\usepackage{${}}', type: 'namespace', keywords: ['package', 'import'] },
  { label: '/documentclass', detail: 'Document class', insert: '\\documentclass{${}}', type: 'namespace', keywords: ['class', 'preamble'] },
  { label: '/begin', detail: 'Begin an environment', insert: '\\begin{${}}', type: 'namespace', keywords: ['environment'] },
  { label: '/end', detail: 'End an environment', insert: '\\end{${}}', type: 'namespace', keywords: ['environment'] },

  // ---- AI actions ----
  { label: '/ai', detail: 'Ask the AI assistant', aiAction: 'ai', type: 'module', keywords: ['assistant', 'chat'], boost: 4 },
  { label: '/fix', detail: 'Fix last compile error with AI', aiAction: 'fix', type: 'module', keywords: ['error', 'repair'], boost: 4 },
  { label: '/rewrite', detail: 'Rewrite selection with AI', aiAction: 'rewrite', type: 'module', keywords: ['improve', 'rephrase'], boost: 4 },
]
