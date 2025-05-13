type FileNode = {
  type: 'file';
  ext: 'csv' | 'json' | 'parquet';
  content: string;
  name: string;
};

type DirNode = {
  type: 'dir';
  name: string;
  children: FileSystemNode[];
};

export type FileSystemNode = FileNode | DirNode;

export const fileSystemTree: FileSystemNode[] = [
  {
    type: 'file',
    ext: 'csv',
    content: 'col\ndata1',
    name: 'a',
  },
  {
    type: 'file',
    ext: 'json',
    content: '{"col": "data2"}',
    name: 'a',
  },

  {
    type: 'file',
    ext: 'parquet',
    content: "SELECT 'data3' AS col;",
    name: 'parquet-test',
  },

  {
    type: 'dir',
    name: 'dir-a',
    children: [
      {
        type: 'file',
        ext: 'csv',
        content: 'col\ndataA1',
        name: 'a',
      },
      {
        type: 'file',
        ext: 'json',
        content: '{"col": "dataA2"}',
        name: 'a',
      },
      {
        type: 'dir',
        name: 'dir-b',
        children: [
          {
            type: 'file',
            ext: 'csv',
            content: 'col\ndataB1',
            name: 'a',
          },
          {
            type: 'file',
            ext: 'json',
            content: '{"col": "dataB2"}',
            name: 'a',
          },
        ],
      },
    ],
  },
];
