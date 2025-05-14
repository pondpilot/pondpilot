type FileNode = {
  type: 'file';
  ext: 'csv' | 'json' | 'parquet' | 'duckdb' | 'xlsx';
  content: string;
  name: string;
};

type DirNode = {
  type: 'dir';
  name: string;
  children: FileSystemNode[];
};

export type FileSystemNode = FileNode | DirNode;
