import { IconDatabase, IconSitemap, IconTable } from '@tabler/icons-react';

export const getDBIconByType = (type: 'db' | 'schema' | 'table') =>
  ({
    db: <IconDatabase size={14} />,
    schema: <IconSitemap size={14} />,
    table: <IconTable size={14} />,
  })[type];
