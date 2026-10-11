export type FolderRow = {
  id: string;
  source?: string;
  sourceLabel?: string;
  path?: string;
  folder?: string;
};

export type FolderBranch = {
  name: string;
  path: string;
  count: number;
  titleIds: string[];
  children: FolderBranch[];
};

export type FolderExtra = { sourceLabel: string; folders?: string[] };

function clean(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function folderOf(title: FolderRow) {
  if (title.folder) return clean(title.folder);
  if (title.source === "folder" && title.path && /[/\\]/.test(title.path)) {
    const parts = clean(title.path).split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }
  return "";
}

function branch(name: string, path: string): FolderBranch {
  return { name, path, count: 0, titleIds: [], children: [] };
}

function insert(node: FolderBranch, parts: string[], id: string) {
  if (!parts.length) {
    if (id) node.titleIds.push(id);
    return;
  }
  const [head, ...rest] = parts;
  const path = node.path ? `${node.path}/${head}` : head;
  let child = node.children.find((item) => item.name === head);
  if (!child) {
    child = branch(head, path);
    node.children.push(child);
  }
  insert(child, rest, id);
}

function tally(node: FolderBranch): number {
  node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  node.count = node.titleIds.length + node.children.reduce((sum, child) => sum + tally(child), 0);
  return node.count;
}

export function mapFolderNetwork(rows: FolderRow[], extra: FolderExtra[] = []) {
  const groups = new Map<string, { folders: string[]; ids: string[][] }>();
  const take = (label: string) => {
    const key = label || "Library";
    const group = groups.get(key) || { folders: [], ids: [] };
    groups.set(key, group);
    return group;
  };
  for (const row of rows) {
    const folder = folderOf(row);
    if (!folder) continue;
    const group = take(row.sourceLabel || "Library");
    group.folders.push(folder);
    group.ids.push([folder, row.id]);
  }
  for (const item of extra) {
    const group = take(item.sourceLabel);
    for (const folder of item.folders || []) {
      if (folder) group.folders.push(clean(folder));
    }
  }
  const trees: FolderBranch[] = [];
  for (const [label, group] of groups) {
    if (!group.folders.length) continue;
    const root = branch(label, label);
    const partsOf = (folder: string) => clean(folder).split("/").filter(Boolean);
    for (const folder of group.folders) insert(root, partsOf(folder), "");
    for (const [folder, id] of group.ids) insert(root, partsOf(folder), id);
    tally(root);
    if (root.count || root.children.length) trees.push(root);
  }
  return trees.sort((a, b) => a.name.localeCompare(b.name));
}

export function findFolder(trees: FolderBranch[], path: string) {
  if (!path) return null;
  const walk = (nodes: FolderBranch[]): FolderBranch | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      const nested = walk(node.children);
      if (nested) return nested;
    }
    return null;
  };
  return walk(trees);
}

export function titlesInFolder<T extends FolderRow>(titles: T[], path: string) {
  if (!path) return titles;
  return titles.filter((title) => {
    const folder = folderOf(title);
    if (!folder) return false;
    const full = `${title.sourceLabel || "Library"}/${folder}`;
    return full === path || full.startsWith(`${path}/`);
  });
}
