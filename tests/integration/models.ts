import { supportedDataSourceFileExt } from '@models/file-system';

type FileNode = {
  type: 'file';
  ext: supportedDataSourceFileExt;
  content: string;
  name: string;
};

type DirNode = {
  type: 'dir';
  name: string;
  children: FileSystemNode[];
};

export type FileSystemNode = FileNode | DirNode;
