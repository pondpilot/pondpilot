import { supportedDataSourceFileExt } from '@models/file-system';

type Row = Record<string, any>;

type Sheet = {
  name: string;
  rows: Row[];
};

export type XlsxContent = Sheet[];

export type FileNodeExtensionSpecifics =
  | { ext: 'xlsx'; content: XlsxContent }
  | { ext: Exclude<supportedDataSourceFileExt, 'xlsx'>; content: string };

export type FileNode = {
  type: 'file';
  ext: supportedDataSourceFileExt;
  name: string;
} & FileNodeExtensionSpecifics;

type DirNode = {
  type: 'dir';
  name: string;
  children: FileSystemNode[];
};

export type FileSystemNode = FileNode | DirNode;
