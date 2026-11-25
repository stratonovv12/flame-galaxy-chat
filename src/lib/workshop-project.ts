export interface WorkshopProject {
  flameProject: 1;
  plan: string[];
  files: Record<string, string>;
}

export function validateProject(value: unknown): WorkshopProject {
  if (!value || typeof value !== "object") throw new Error("Invalid project response");
  const project = value as Partial<WorkshopProject>;
  if (project.flameProject !== 1 || !project.files || typeof project.files !== "object" || Array.isArray(project.files)) throw new Error("Invalid project format");
  const entries = Object.entries(project.files);
  if (!entries.length || entries.length > 80 || typeof project.files["index.html"] !== "string") throw new Error("Project needs index.html (maximum 80 files)");
  for (const [path, source] of entries) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith("/") || path.split("/").includes("..") || typeof source !== "string") throw new Error(`Invalid source file: ${path}`);
  }
  if (JSON.stringify(project.files).length > 190000) throw new Error("Project exceeds current source limit");
  return { flameProject: 1, files: project.files, plan: Array.isArray(project.plan) ? project.plan.filter((step): step is string => typeof step === "string") : [] };
}

export function readProject(content: string): WorkshopProject {
  if (content.trim().startsWith("{")) {
    try { return validateProject(JSON.parse(content)); } catch { /* Legacy HTML remains untouched. */ }
  }
  const sections = [...content.matchAll(/<!--\s*FILE:\s*(.+?)\s*-->([\s\S]*?)<!--\s*ENDFILE\s*-->/gi)];
  if (sections.length) {
    const files = Object.fromEntries(sections.map(match => [match[1].trim(), match[2].trim()]));
    if (files["index.html"]) return validateProject({ flameProject: 1, plan: [], files });
  }
  return { flameProject: 1, plan: [], files: { "index.html": content } };
}

export function resolveFilePath(from: string, target: string): string {
  const parts = target.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") { if (!parts.length) throw new Error("Import escapes project"); parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export function editProjectFile(project: WorkshopProject, path: string, source: string): WorkshopProject {
  return validateProject({ ...project, files: { ...project.files, [path]: source } });
}

// Browser-native module/import maps keep the preview and APK webview dependency-free.
export function compileProject(content: string): string {
  const project = readProject(content);
  const files = project.files;
  const imports: Record<string, string> = {};
  const isLocal = (path: string) => !/^(https?:|data:|blob:|\/\/)/.test(path);
  const rewriteImport = (from: string, path: string) => {
    if (!path.startsWith(".") && !path.startsWith("/")) return path;
    const resolved = resolveFilePath(from, path);
    if (!(resolved in files)) throw new Error(`Missing import: ${resolved}`);
    return `flame:/${resolved}`;
  };
  for (const [path, source] of Object.entries(files)) {
    if (!/\.(m?js)$/.test(path)) continue;
    const rewritten = source
      .replace(/(\bfrom\s*|\bimport\s*)(["'])([^"']+)\2/g, (_, prefix, quote, target) => `${prefix}${quote}${rewriteImport(path, target)}${quote}`)
      .replace(/(\bimport\s*\(\s*)(["'])([^"']+)\2/g, (_, prefix, quote, target) => `${prefix}${quote}${rewriteImport(path, target)}${quote}`);
    imports[`flame:/${path}`] = `data:text/javascript;charset=utf-8,${encodeURIComponent(rewritten)}`;
  }
  const escapeScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");
  let html = files["index.html"];
  html = html.replace(/<link\b([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (tag, before, path, after) => {
    if (!/stylesheet/i.test(before + after) || !isLocal(path)) return tag;
    const resolved = resolveFilePath("index.html", path);
    if (!(resolved in files)) throw new Error(`Missing stylesheet: ${resolved}`);
    return `<style>${files[resolved].replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  html = html.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*?)>\s*<\/script>/gi, (tag, before, path, after) => {
    if (!isLocal(path)) return tag;
    const resolved = resolveFilePath("index.html", path);
    if (!(resolved in files)) throw new Error(`Missing script: ${resolved}`);
    if (/type=["']module["']/i.test(before + after)) return `<script type="module">import ${JSON.stringify(`flame:/${resolved}`)};</script>`;
    return `<script>${escapeScript(files[resolved])}</script>`;
  });
  const map = `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, "\\u003c")}</script>`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => match + map);
  else html = map + html;
  return html;
}

export function projectPreview(content: string): { html: string; error: string | null } {
  try { return { html: compileProject(content), error: null }; }
  catch (error) { return { html: "", error: error instanceof Error ? error.message : "Preview unavailable" }; }
}