export type Pane = {
  id: string;
  type: 'terminal' | 'editor';
  path?: string;
};

export type FileNode = {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
};

export type GitFileStatus = {
  path: string;
  status: string;
};

export type GitCommit = {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  time: number;
};

export type GitBranch = {
  name: string;
  is_head: boolean;
};

export type TerminalSession = {
  id: string;
};

export type TerminalMeta = {
  cwd: string;
  processName: string;
  gitBranch: string | null;
  currentCommand: string;
};
